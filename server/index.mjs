import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store } from './db.mjs';
import { JsonStore } from './fs-store.mjs';
import { createCartHandler } from './cart.mjs';
import { manageFolders, moveFolderIcons } from './folders.mjs';
import { pruneBuildHistory } from './build-retention.mjs';
import {
  hash,
  slugify,
  normalizePrefix,
  iconFromSvg,
  sanitizeSvg,
  normalizeToViewport,
  fitSvgToMargin,
  svgContentBounds,
  setSvgColor,
  transformSvg,
  generateIconfontJs,
  parseIconfontZip,
  parseIconfontJs,
  extractGlyphsFromIconfontSvg,
} from './core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'dist');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const ARTIFACTS_DIR = path.join(DATA_DIR, 'artifacts');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 35 * 1024 * 1024;
const SEARCH_TTL = 60 * 1000;
const DEFAULT_PROJECT_MARGIN = 100;
const MARGIN_FIT_VERSION = 2;
const searchCache = new Map();
const legacyRepairJobs = new Map();
const publicBuildJobs = new Map();

async function requestExternal(url, options = {}, redirectCount = 0) {
  const parsed = new URL(url);
  const transport = parsed.protocol === 'https:' ? https : http;
  const body = options.body ?? null;
  const headers = { ...(options.headers || {}) };
  if (body !== null && !headers['Content-Length']) headers['Content-Length'] = Buffer.byteLength(body);
  const requestOptions = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || undefined,
    path: `${parsed.pathname}${parsed.search}`,
    method: options.method || 'GET',
    headers,
    timeout: options.timeout || 12_000,
  };
  if (parsed.protocol === 'https:' && process.env.ICONFONT_INSECURE_TLS === '1') requestOptions.rejectUnauthorized = false;
  if (parsed.protocol === 'https:' && process.env.ICONFONT_CA_FILE) {
    try { requestOptions.ca = fs.readFileSync(path.resolve(process.env.ICONFONT_CA_FILE)); } catch {}
  }
  return new Promise((resolve, reject) => {
    const request = transport.request(requestOptions, (response) => {
      const chunks = [];
      let length = 0;
      response.on('data', (chunk) => {
        length += chunk.length;
        if (length <= 25 * 1024 * 1024) chunks.push(chunk);
      });
      response.on('end', async () => {
        const responseBody = Buffer.concat(chunks).toString('utf8');
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location && redirectCount < 3) {
          try { resolve(await requestExternal(new URL(response.headers.location, url).toString(), options, redirectCount + 1)); } catch (error) { reject(error); }
          return;
        }
        resolve({ status: response.statusCode || 0, headers: response.headers, body: responseBody });
      });
    });
    request.on('timeout', () => request.destroy(new Error('外部请求超时')));
    request.on('error', reject);
    if (body !== null) request.write(body);
    request.end();
  });
}

await fsp.mkdir(PROJECTS_DIR, { recursive: true });
await fsp.mkdir(ARTIFACTS_DIR, { recursive: true });
const store = String(process.env.STORAGE_DRIVER || 'sqlite').toLowerCase() === 'fs'
  ? new JsonStore(DATA_DIR)
  : new Store(DATA_DIR);
store.seedAdmin(process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASSWORD || 'adminadmin');
store.cleanupSessions();

function json(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function text(res, status, body, contentType = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': contentType, ...headers });
  res.end(body);
}

function errorResponse(res, status, message, details = undefined) {
  json(res, status, { error: message, ...(details === undefined ? {} : { details }) });
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').map((part) => part.trim().split('='))
    .filter(([key, value]) => key && value)
    .map(([key, value]) => [key, decodeURIComponent(value)]));
}

function setSessionCookie(res, token, maxAge = 7 * 24 * 60 * 60) {
  res.setHeader('Set-Cookie', `if_session=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'if_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('请求体过大'), { statusCode: 413 });
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const contentType = String(req.headers['content-type'] || '');
  if (contentType.includes('application/json')) {
    if (!buffer.length) return {};
    try { return JSON.parse(buffer.toString('utf8')); } catch { throw Object.assign(new Error('JSON 请求体无效'), { statusCode: 400 }); }
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(buffer.toString('utf8')).entries());
  }
  return buffer;
}

function parsePath(urlPath) {
  return urlPath.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
}

function sessionUser(req) {
  const cookies = parseCookies(req);
  return store.userBySession(cookies.if_session);
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

function authContext(req) {
  const user = sessionUser(req);
  if (user) return { user, token: null };
  const token = bearerToken(req);
  if (token) return { user: null, token: store.apiToken(token) };
  return { user: null, token: null };
}

function requireUser(req, res) {
  const context = authContext(req);
  if (!context.user) {
    errorResponse(res, 401, '请先登录');
    return null;
  }
  return context.user;
}

function canAccessProject(context, project, write = false) {
  if (!context.user && !context.token) return false;
  if (context.user?.role === 'admin') return true;
  if (context.token) return Number(context.token.project_id) === Number(project.id) && (!write || context.token.scopes.includes('build:write'));
  return Number(context.user.id) === Number(project.owner_id) || project.settings?.everyoneCanEdit === true || (project.settings?.collaboratorIds || []).includes(Number(context.user.id));
}

function projectDirectory(projectId) {
  const id = String(Number(projectId));
  if (!/^\d+$/.test(id) || Number(id) <= 0) throw new Error('项目 ID 无效');
  const target = path.resolve(PROJECTS_DIR, id);
  const root = path.resolve(PROJECTS_DIR) + path.sep;
  if (!target.startsWith(root)) throw new Error('项目路径无效');
  return target;
}

async function writeAtomic(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`;
  await fsp.writeFile(temporary, content);
  await fsp.rename(temporary, filePath);
}

async function saveIconAssets(icon, original = null) {
  const directory = path.join(projectDirectory(icon.project_id), 'icons', String(icon.id));
  await fsp.mkdir(directory, { recursive: true });
  if (original) await writeAtomic(path.join(directory, 'original.svg'), original);
  await writeAtomic(path.join(directory, 'current.svg'), icon.svg);
}

function projectPayload(project) {
  return {
    ...project,
    settings: { margin: DEFAULT_PROJECT_MARGIN, ...(project.settings || {}) },
    latestBuild: store.latestBuild(project.id),
  };
}

function normalizeName(name, fallback = 'icon') {
  const value = String(name ?? '').trim();
  return value || fallback;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * iconfont 项目资源有时会把项目此前缀写进 name/slug（例如 biz-add、biz_add）。
 * 前缀属于项目级命名空间，存储时只保留图标自身的后缀，生成时再统一补回。
 */
function stripProjectPrefix(value, projectPrefix) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const prefix = normalizePrefix(projectPrefix);
  const boundary = new RegExp(`^${escapeRegExp(prefix)}(?:[-_\\s/:.]+)(.+)$`, 'i');
  const match = text.match(boundary);
  if (match?.[1]?.trim()) return match[1].trim();

  // 对已经是机器 slug 的值再做一次归一化判断，覆盖 biz_add / biz add 等变体。
  const normalized = slugify(text);
  const normalizedPrefix = slugify(prefix);
  if (normalized === normalizedPrefix) return 'icon';
  if (normalized.startsWith(`${normalizedPrefix}-`)) return normalized.slice(normalizedPrefix.length + 1) || 'icon';
  return text;
}

function projectPrefixCandidates(project) {
  const candidates = [project?.name, project?.prefix]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .map((value) => normalizePrefix(value));
  return [...new Set(candidates)].sort((left, right) => right.length - left.length);
}

function stripProjectPrefixes(value, project) {
  const result = String(value ?? '').trim();
  for (const candidate of projectPrefixCandidates(project)) {
    const next = stripProjectPrefix(result, candidate);
    if (next && next !== result) return next;
  }
  return result;
}

function stripLeadingPrefix(value, prefix) {
  const text = String(value ?? '').trim();
  const cleanedPrefix = String(prefix ?? '').trim().replace(/^[-_\s/:.]+|[-_\s/:.]+$/g, '');
  if (!text || !cleanedPrefix) return text;
  const pattern = new RegExp(`^${escapeRegExp(cleanedPrefix)}(?:[-_\\s/:.]+|$)`, 'i');
  const match = text.match(pattern);
  if (!match) return text;
  return text.slice(match[0].length).trim() || 'icon';
}

function versionedSourceMeta(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value, marginFitVersion: MARGIN_FIT_VERSION };
  return { value: value ?? null, marginFitVersion: MARGIN_FIT_VERSION };
}

function uniqueSlug(projectId, initial, sourceHash) {
  if (store.iconByHash?.(projectId, sourceHash)) return null;
  const base = slugify(initial || 'icon');
  let slug = base;
  let index = 2;
  while (store.iconBySlug(projectId, slug)) {
    const existing = store.iconBySlug(projectId, slug);
    if (existing?.source_hash === sourceHash) return null;
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}

function normalizeSearchItem(item, index) {
  const value = item && typeof item === 'object' ? item : {};
  const get = (...keys) => keys.map((key) => value[key]).find((candidate) => candidate !== undefined && candidate !== null && candidate !== '');
  const remoteId = String(get('id', 'icon_id', 'iconId', 'uid', 'iconIdStr') ?? `result-${index}`);
  const name = String(get('name', 'font_class', 'fontClass', 'title', 'icon_name') ?? `icon-${index + 1}`);
  const rawSvg = get('svg', 'svgData', 'svg_content', 'content', 'symbol', 'show_svg');
  const assetUrl = get('svgUrl', 'svg_url', 'origin_file', 'originFile', 'downloadUrl', 'download_url', 'url', 'image');
  let svg = null;
  if (typeof rawSvg === 'string') {
    try {
      if (/<svg\b/i.test(rawSvg)) svg = sanitizeSvg(rawSvg).svg;
      else if (/<symbol\b/i.test(rawSvg)) svg = sanitizeSvg(`<svg viewBox="0 0 1024 1024">${rawSvg}</svg>`).svg;
      else if (/^\s*M[\s\d.,-]+/i.test(rawSvg)) svg = sanitizeSvg(`<svg viewBox="0 0 1024 1024"><path d="${rawSvg.replace(/"/g, '&quot;')}"/></svg>`).svg;
    } catch { svg = null; }
  }
  return {
    remoteId,
    name,
    slug: slugify(name),
    fontClass: get('font_class', 'fontClass', 'className') ?? null,
    unicode: get('unicode', 'codepoint', 'unicode_decimal') ?? null,
    svg,
    assetUrl: typeof assetUrl === 'string' ? assetUrl : null,
    previewUrl: get('show_url', 'preview', 'previewUrl', 'image', 'preview_image') ?? null,
    author: get('author', 'user_name', 'username') ?? null,
    isColor: Boolean(get('is_color', 'isColor', 'colors')),
    sourceMeta: value,
  };
}

function extractSearchItems(payload) {
  const candidates = [payload?.data?.icons, payload?.data?.list, payload?.data?.results, payload?.data?.rows, payload?.icons, payload?.list, payload?.results, payload?.rows, Array.isArray(payload?.data) ? payload.data : null, Array.isArray(payload) ? payload : null];
  const items = candidates.find(Array.isArray) || [];
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  const total = Number(data?.total ?? data?.count ?? payload?.total ?? payload?.count ?? items.length) || items.length;
  return { items: items.map(normalizeSearchItem), total };
}

async function searchIconfont(params) {
  const query = {
    q: String(params.q ?? '').trim(),
    sortType: String(params.sortType ?? 'updated_at'),
    page: Math.max(1, Number(params.page) || 1),
    pageSize: Math.min(54, Math.max(1, Number(params.pageSize) || 54)),
    sType: String(params.sType ?? ''),
    fromCollection: String(params.fromCollection ?? '-1'),
    fills: String(params.fills ?? ''),
    t: String(Date.now()),
    ctoken: params.ctoken === undefined ? 'null' : String(params.ctoken ?? 'null'),
  };
  if (!query.q) return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
  const cacheKey = JSON.stringify(query);
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;
  const form = new URLSearchParams(query);
  const response = await requestExternal('https://www.iconfont.cn/api/icon/search.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'IconFamily/0.1',
      },
      body: form.toString(),
      timeout: 12_000,
  });
  const raw = response.body;
  let payload;
  try { payload = JSON.parse(raw); } catch { throw new Error(`iconfont 返回的不是 JSON（HTTP ${response.status}）`); }
  if (response.status < 200 || response.status >= 300) throw new Error(`iconfont 搜索失败（HTTP ${response.status}）`);
  const normalized = { ...extractSearchItems(payload), page: query.page, pageSize: query.pageSize };
  searchCache.set(cacheKey, { expires: Date.now() + SEARCH_TTL, value: normalized });
  if (searchCache.size > 100) searchCache.delete(searchCache.keys().next().value);
  return normalized;
}

function allowedRemoteUrl(raw) {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    const allow = String(process.env.REMOTE_ASSET_HOSTS || 'iconfont.cn,alicdn.com,alipayobjects.com').split(',').map((item) => item.trim()).filter(Boolean);
    if (!allow.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) return null;
    return parsed.toString();
  } catch { return null; }
}

async function resolveRemoteSvg(item) {
  const inline = item.svg;
  if (typeof inline === 'string' && /<svg\b/i.test(inline)) return { svg: inline, sourceUrl: null };
  if (typeof inline === 'string' && /<symbol\b/i.test(inline)) return { svg: `<svg viewBox="0 0 1024 1024">${inline}</svg>`, sourceUrl: null };
  if (typeof inline === 'string' && /^\s*M[\s\d.,-]+/i.test(inline)) return { svg: `<svg viewBox="0 0 1024 1024"><path d="${inline.replace(/"/g, '&quot;')}"/></svg>`, sourceUrl: null };
  const url = allowedRemoteUrl(item.assetUrl || item.svgUrl || item.url);
  if (!url) throw new Error('搜索结果未提供可下载的 SVG 资源');
  const response = await requestExternal(url, { timeout: 12_000, headers: { Accept: 'image/svg+xml,text/plain,*/*', 'User-Agent': 'IconFamily/0.1' } });
  if (response.status < 200 || response.status >= 300) throw new Error(`下载远程 SVG 失败（HTTP ${response.status}）`);
  const svg = response.body;
  if (!/<svg\b/i.test(svg)) throw new Error('远程资源不是 SVG');
  return { svg, sourceUrl: url };
}

async function importItems(project, items, sourceType = 'upload') {
  if (!Array.isArray(items) || !items.length || items.length > 2000) throw Object.assign(new Error('单次导入需包含 1–2000 个图标'), { statusCode: 400 });
  const list = Array.isArray(items) ? items : [];
  const job = store.createImportJob(project.id, list.length);
  const report = [];
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;
  let codepoint = store.nextCodepoint(project.id, project.settings?.codepointStart ?? 0xe900);
  for (const item of list) {
    try {
      let sourceUrl = item.sourceUrl ?? null;
      let rawSvg = item.svg;
      if (sourceType === 'iconfont') {
        const remote = await resolveRemoteSvg(item);
        rawSvg = remote.svg;
        sourceUrl = sourceUrl || remote.sourceUrl;
      }
      if (typeof rawSvg !== 'string' || rawSvg.length > 2 * 1024 * 1024) throw new Error('SVG 文件为空或超过 2 MB 限制');
      const rawName = normalizeName(item.name || item.slug);
      const importedName = sourceType === 'iconfont' ? stripProjectPrefixes(rawName, project) : rawName;
      const prepared = iconFromSvg({ name: normalizeName(importedName), svg: rawSvg, sourceType, sourceMeta: item.sourceMeta ?? item, colorMode: item.colorMode ?? 'preserve' });
      const fitted = fitSvgToMargin(prepared.svg, project.settings?.margin ?? DEFAULT_PROJECT_MARGIN);
      prepared.svg = fitted.svg;
      prepared.body = fitted.body;
      prepared.viewBox = fitted.viewBox;
      prepared.sourceHash = hash(prepared.svg);
      if (sourceType === 'iconfont' && item.remoteId && store.iconByRemoteId(project.id, 'iconfont', item.remoteId)) {
        skipped += 1;
        report.push({ name: item.name, status: 'skipped', reason: '该 iconfont 图标已经导入' });
        continue;
      }
      const rawSlug = String(item.slug || prepared.slug).replace(/\.[^.]+$/, '');
      const importedSlug = sourceType === 'iconfont' ? stripProjectPrefixes(rawSlug, project) : rawSlug;
      const slug = uniqueSlug(project.id, importedSlug || prepared.slug, prepared.sourceHash);
      if (!slug) {
        skipped += 1;
        report.push({ name: item.name, status: 'skipped', reason: '相同 SVG 已存在' });
        continue;
      }
      const unicode = item.unicode === null || item.unicode === undefined || item.unicode === '' ? codepoint : Number(String(item.unicode).replace(/^0x/i, '')) || codepoint;
      const created = store.createIcon({
        projectId: project.id,
        name: prepared.name,
        slug,
        sourceType,
        sourceProvider: sourceType === 'iconfont' ? 'iconfont' : null,
        sourceRemoteId: sourceType === 'iconfont' ? String(item.remoteId ?? '') : null,
        sourceUrl,
        sourceMeta: versionedSourceMeta(item.sourceMeta ?? item),
        sourceHash: prepared.sourceHash,
        svg: prepared.svg,
        viewBox: prepared.viewBox,
        colorMode: prepared.colorMode,
        codepoint: unicode,
        sortOrder: Date.now() % 1_000_000,
      });
      await saveIconAssets(created, prepared.svg);
      codepoint = Math.max(codepoint + 1, unicode + 1);
      succeeded += 1;
      report.push({ name: prepared.name, slug, status: 'success', iconId: created.id });
    } catch (error) {
      failed += 1;
      report.push({ name: item?.name ?? 'unknown', status: 'failed', reason: error.message });
    }
  }
  const status = failed && succeeded ? 'partial_success' : failed ? 'failed' : 'success';
  return store.finishImportJob(job.id, { status, succeeded, skipped, failed, report });
}

async function repairLegacyIconfontIcons(project) {
  const projectId = Number(project.id);
  if (legacyRepairJobs.has(projectId)) return legacyRepairJobs.get(projectId);
  const job = (async () => {
    const icons = store.listIcons(projectId);
    for (const icon of icons) {
      if (icon.source_type !== 'iconfont') continue;
      const metadata = icon.sourceMeta && typeof icon.sourceMeta === 'object' ? icon.sourceMeta : {};
      if (Number(metadata.marginFitVersion) >= MARGIN_FIT_VERSION) continue;
      try {
        const margin = project.settings?.margin ?? DEFAULT_PROJECT_MARGIN;
        const targetSize = Math.max(0.0001, 1024 - Number(margin) * 2);
        const currentBounds = svgContentBounds(icon.svg);
        const currentSize = Math.max(currentBounds.width, currentBounds.height);
        const centerX = (currentBounds.minX + currentBounds.maxX) / 2;
        const centerY = (currentBounds.minY + currentBounds.maxY) / 2;
        const needsRefit = !Number.isFinite(currentSize)
          || Math.abs(currentSize - targetSize) > 2
          || Math.abs(centerX - 512) > 2
          || Math.abs(centerY - 512) > 2;
        const fitted = needsRefit ? fitSvgToMargin(icon.svg, margin) : { svg: icon.svg, viewBox: icon.view_box };
        const cleanedName = stripProjectPrefixes(icon.name, project) || icon.name;
        const requestedSlug = stripProjectPrefixes(icon.slug, project);
        let cleanedSlug = slugify(requestedSlug || icon.slug);
        const conflict = store.iconBySlug(projectId, cleanedSlug);
        if (conflict && Number(conflict.id) !== Number(icon.id)) cleanedSlug = icon.slug;
        const updated = store.updateIcon(icon.id, {
          name: cleanedName,
          slug: cleanedSlug,
          svg: fitted.svg,
          viewBox: fitted.viewBox,
          sourceHash: needsRefit ? hash(fitted.svg) : icon.source_hash,
          sourceMeta: { ...metadata, marginFitVersion: MARGIN_FIT_VERSION },
        });
        if (needsRefit) await saveIconAssets(updated);
      } catch (error) {
        console.warn(`修复 iconfont 图标 ${icon.id} 失败：${error.message}`);
      }
    }
  })();
  legacyRepairJobs.set(projectId, job);
  try { await job; } finally { legacyRepairJobs.delete(projectId); }
}

const projectBuildJobs = new Map();
async function buildProject(projectId) {
  const id = Number(projectId);
  if (projectBuildJobs.has(id)) return projectBuildJobs.get(id);
  const job = runProjectBuild(id);
  projectBuildJobs.set(id, job);
  try { return await job; } finally { projectBuildJobs.delete(id); }
}

function cleanBuildHistory(projectId) {
  try { pruneBuildHistory(store, ARTIFACTS_DIR, projectId); }
  catch (error) { console.error(`Build history cleanup failed for project ${projectId}:`, error); }
}

async function runProjectBuild(projectId) {
  const project = store.projectById(projectId);
  if (!project) throw new Error('项目不存在');
  const icons = store.listIcons(projectId);
  const previous = store.listBuilds(projectId)[0];
  const version = Number(previous?.version || 0) + 1;
  const build = store.createBuild(projectId, project.revision, version);
  try {
    const content = generateIconfontJs(project, icons);
    const checksum = hash(content);
    const directory = path.join(ARTIFACTS_DIR, String(projectId));
    await fsp.mkdir(directory, { recursive: true });
    const artifactPath = path.join(directory, `iconfont-v${version}.js`);
    await writeAtomic(artifactPath, content);
    await writeAtomic(path.join(directory, 'latest.js'), content);
    const finished = store.finishBuild(build.id, { status: 'success', artifactPath, checksum });
    store.publishBuild(projectId, build.id);
    return finished;
  } catch (error) {
    return store.finishBuild(build.id, { status: 'failed', errorMessage: error.message });
  } finally {
    cleanBuildHistory(projectId);
  }
}

/**
 * Return a build whose source revision matches the current project.  The
 * public download endpoint uses this helper so the first request (or a
 * request after edits) transparently produces a fresh iconfont.js.  Requests
 * for the same project are coalesced while a build is in progress.
 */
async function ensureLatestPublicBuild(projectId) {
  const id = Number(projectId);
  if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error('项目 ID 无效'), { statusCode: 400 });
  const running = publicBuildJobs.get(id);
  if (running) return running;
  const job = (async () => {
    let project = store.projectById(id);
    if (!project) throw Object.assign(new Error('项目不存在'), { statusCode: 404 });

    // Legacy iconfont imports may be normalized on first access and bump the
    // project revision, so repair before deciding whether a build is stale.
    await repairLegacyIconfontIcons(project);
    project = store.projectById(id) || project;
    let latest = store.latestBuild(id);
    const currentRevision = Number(project.revision);
    const isCurrent = latest
      && latest.status === 'success'
      && latest.artifact_path
      && Number(latest.source_revision) === currentRevision;
    if (!isCurrent) {
      latest = await buildProject(id);
      if (!latest || latest.status !== 'success' || !latest.artifact_path) {
        throw new Error(latest?.error_message || '生成 iconfont.js 失败');
      }
    }
    return latest;
  })();
  publicBuildJobs.set(id, job);
  try { return await job; } finally { publicBuildJobs.delete(id); }
}

async function requireProject(req, res, projectId, write = false) {
  const context = authContext(req);
  const project = store.projectById(projectId);
  if (!project) {
    errorResponse(res, 404, '项目不存在');
    return null;
  }
  if (!canAccessProject(context, project, write)) {
    errorResponse(res, context.user || context.token ? 403 : 401, context.user || context.token ? '没有权限访问该项目' : '请先登录');
    return null;
  }
  return { context, project };
}

const handleCart = createCartHandler({ store, requireUser, readBody, json, errorResponse, resolveRemoteSvg, importItems, canAccessProject });

async function handleApi(req, res, urlObject) {
  const parts = parsePath(urlObject.pathname);
  const method = req.method || 'GET';

  if (parts[0] === 'cart') return handleCart(req, res, parts, method);

  if (parts[0] === 'health') return json(res, 200, { ok: true, service: 'iconfamily', time: new Date().toISOString() });

  if (parts[0] === 'auth' && parts[1] === 'login' && method === 'POST') {
    const body = await readBody(req);
    const user = store.authenticate(String(body.username ?? '').trim(), String(body.password ?? ''));
    if (!user) return errorResponse(res, 401, '用户名或密码错误');
    const session = store.createSession(user.id);
    setSessionCookie(res, session.token);
    return json(res, 200, { user });
  }
  if (parts[0] === 'auth' && parts[1] === 'logout' && method === 'POST') {
    const cookies = parseCookies(req);
    store.destroySession(cookies.if_session);
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }
  if (parts[0] === 'auth' && parts[1] === 'me' && method === 'GET') {
    const user = sessionUser(req);
    return user ? json(res, 200, { user }) : errorResponse(res, 401, '未登录');
  }

  if (parts[0] === 'auth' && parts[1] === 'password' && parts.length === 2 && method === 'POST') {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    if (typeof body.password !== 'string' || body.password.length < 6 || body.password.length > 128) return errorResponse(res, 400, '密码需为 6–128 位');
    if (typeof body.currentPassword !== 'string' || !store.changePassword(user.id, body.password, body.currentPassword)) return errorResponse(res, 400, '当前密码错误');
    setSessionCookie(res, store.createSession(user.id).token);
    return json(res, 200, { ok: true });
  }

  if (parts[0] === 'iconfont' && parts[1] === 'search' && method === 'POST') {
    if (!requireUser(req, res)) return;
    const body = await readBody(req);
    try { return json(res, 200, await searchIconfont(body)); } catch (error) { return errorResponse(res, 502, error.message); }
  }

  if (parts[0] === 'users') {
    const user = requireUser(req, res);
    if (!user) return;
    if (user.role !== 'admin') return errorResponse(res, 403, '只有管理员可以管理用户');
    if (method === 'POST' && parts.length === 3 && parts[2] === 'password') {
      const id = Number(parts[1]);
      if (id === user.id) return errorResponse(res, 400, '请通过我的账号修改自己的密码');
      const body = await readBody(req);
      if (typeof body.password !== 'string' || body.password.length < 6 || body.password.length > 128) return errorResponse(res, 400, '密码需为 6–128 位');
      if (!Number.isSafeInteger(id) || !store.changePassword(id, body.password)) return errorResponse(res, 404, '用户不存在');
      return json(res, 200, { ok: true });
    }
    if (method === 'GET' && parts.length === 1) return json(res, 200, { users: store.listUsers() });
    if (method === 'POST' && parts.length === 1) {
      const body = await readBody(req);
      const username = String(body.username ?? '').trim();
      const password = String(body.password ?? '');
      if (!/^[\w.@-]{2,80}$/.test(username) || password.length < 6 || password.length > 128) return errorResponse(res, 400, '用户名或密码不符合要求');
      try { return json(res, 201, { user: store.createUser({ username, password, role: body.role }) }); } catch (error) { return errorResponse(res, 409, '用户名已存在'); }
    }
    if (method === 'DELETE' && parts.length === 2) {
      if (Number(parts[1]) === user.id) return errorResponse(res, 400, '不能删除当前登录用户');
      try { store.deleteUser(Number(parts[1])); return json(res, 200, { ok: true }); } catch (error) { return errorResponse(res, 400, error.message); }
    }
  }

  if (parts[0] === 'projects' && parts.length === 1) {
    const user = requireUser(req, res);
    if (!user) return;
    if (method === 'GET') return json(res, 200, { projects: store.listProjects(user) });
    if (method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name ?? '').trim();
      if (!name) return errorResponse(res, 400, '项目名称不能为空');
      if (body.everyoneCanEdit !== undefined && typeof body.everyoneCanEdit !== 'boolean') return errorResponse(res, 400, '协作用户无效');
      if (body.collaboratorIds !== undefined && (!Array.isArray(body.collaboratorIds) || body.collaboratorIds.some(id => !Number.isSafeInteger(id) || store.userById(id)?.status !== 'active'))) return errorResponse(res, 400, '协作用户无效');
      if (user.role !== 'admin' && (body.everyoneCanEdit || body.collaboratorIds?.length)) return errorResponse(res, 403, '仅管理员可分配协作权限');
      const collaboration = { everyoneCanEdit: body.everyoneCanEdit === true, collaboratorIds: [...new Set(body.collaboratorIds || [])] };
      if (body.themeColor !== undefined && (typeof body.themeColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(body.themeColor))) return errorResponse(res, 400, '项目主题色无效');
      if (body.jsFilename && typeof body.jsFilename === 'string' && !/\.js$/i.test(body.jsFilename)) body.jsFilename += '.js';
      if (body.jsFilename && (typeof body.jsFilename !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}\.js$/i.test(body.jsFilename))) return errorResponse(res, 400, 'JS 文件名无效');
      const requestedMargin = Number(body.margin);
      const margin = Number.isFinite(requestedMargin) ? Math.min(512, Math.max(0, requestedMargin)) : DEFAULT_PROJECT_MARGIN;
      const project = store.createProject({ name, prefix: normalizePrefix(body.prefix || name), description: String(body.description ?? ''), ownerId: user.id, settings: { ...collaboration, themeColor: body.themeColor || '#1677ff', jsFilename: body.jsFilename || '', codepointStart: Number(body.codepointStart) || 0xe900, emSize: Number(body.emSize) || 1024, margin, defaultColorMode: body.defaultColorMode || 'preserve' } });
      await fsp.mkdir(projectDirectory(project.id), { recursive: true });
      return json(res, 201, { project: projectPayload(project) });
    }
  }

  // Public distribution endpoint.  It intentionally bypasses session/API
  // token checks: the generated sprite is the project's publishable asset.
  // A build is reused only when its source revision still matches the project;
  // otherwise the current project is built before the file is returned.
  if (parts[0] === 'projects' && parts[1] && parts[2] === 'javascript' && parts.length === 3 && method === 'GET') {
    const projectId = Number(parts[1]);
    try {
      const latest = await ensureLatestPublicBuild(projectId);
      const content = await fsp.readFile(latest.artifact_path, 'utf8');
      const etag = latest.checksum ? `"${latest.checksum}"` : null;
      if (etag && String(req.headers['if-none-match'] || '') === etag) {
        res.writeHead(304, {
          ETag: etag,
          'Cache-Control': 'no-cache, must-revalidate',
          'Access-Control-Allow-Origin': '*',
        });
        return res.end();
      }
      return text(res, 200, content, 'application/javascript; charset=utf-8', {
        'Content-Disposition': `attachment; filename="${store.projectById(projectId).settings.jsFilename || 'iconfont.js'}"`,
        ...(etag ? { ETag: etag } : {}),
        'Cache-Control': 'no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      });
    } catch (error) {
      const status = [400, 404].includes(Number(error.statusCode)) ? Number(error.statusCode) : 500;
      return errorResponse(res, status, error.message || '生成 iconfont.js 失败');
    }
  }

  if (parts[0] === 'projects' && parts[1]) {
    const projectId = Number(parts[1]);
    const action = parts[2];
    const projectAccess = await requireProject(req, res, projectId, method !== 'GET');
    if (!projectAccess) return;
    const { project, context } = projectAccess;

    if (!action && method === 'GET') {
      await repairLegacyIconfontIcons(project);
      const refreshedProject = store.projectById(projectId) || project;
      const icons = store.listIcons(projectId, urlObject.searchParams.get('search') || '');
      const visibleIcons = urlObject.searchParams.get('view') === 'workspace'
        ? icons.map(({ id, name, slug, svg, codepoint, color_mode, revision, created_at, folder_id }) => ({ id, name, slug, svg, codepoint, color_mode, revision, created_at, folder_id: folder_id ?? null }))
        : icons;
      return json(res, 200, { project: projectPayload(refreshedProject), icons: visibleIcons });
    }
    if (!action && method === 'PATCH') {
      if (!context.user) return errorResponse(res, 403, 'API Token 不能修改项目');
      if (context.user.role !== 'admin' && Number(project.owner_id) !== context.user.id) return errorResponse(res, 403, '仅管理员或创建者可以修改项目设置');
      const body = await readBody(req);
      const nextSettings = { ...(project.settings || {}), ...(body.settings && typeof body.settings === 'object' ? body.settings : {}) };
      nextSettings.folders = store.projectById(projectId).settings.folders || [];
      if (nextSettings.themeColor !== undefined && (typeof nextSettings.themeColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(nextSettings.themeColor))) return errorResponse(res, 400, '项目主题色无效');
      if (nextSettings.jsFilename && typeof nextSettings.jsFilename === 'string' && !/\.js$/i.test(nextSettings.jsFilename)) nextSettings.jsFilename += '.js';
      if (nextSettings.jsFilename && (typeof nextSettings.jsFilename !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}\.js$/i.test(nextSettings.jsFilename))) return errorResponse(res, 400, 'JS 文件名无效');
      if (context.user.role !== 'admin') {
        nextSettings.everyoneCanEdit = project.settings?.everyoneCanEdit === true;
        nextSettings.collaboratorIds = project.settings?.collaboratorIds || [];
      } else if (nextSettings.collaboratorIds !== undefined) {
        if (!Array.isArray(nextSettings.collaboratorIds) || nextSettings.collaboratorIds.some((id) => !Number.isSafeInteger(id) || store.userById(id)?.status !== 'active')) return errorResponse(res, 400, '协作用户无效');
        nextSettings.collaboratorIds = [...new Set(nextSettings.collaboratorIds)];
      }
      if (nextSettings.everyoneCanEdit !== undefined && typeof nextSettings.everyoneCanEdit !== 'boolean') return errorResponse(res, 400, '协作用户无效');
      if (body.margin !== undefined) nextSettings.margin = body.margin;
      if (nextSettings.margin !== undefined) {
        const margin = Number(nextSettings.margin);
        if (!Number.isFinite(margin) || margin < 0 || margin > 512) return errorResponse(res, 400, '边距必须是 0 到 512 之间的数字');
        nextSettings.margin = margin;
      } else nextSettings.margin = DEFAULT_PROJECT_MARGIN;
      const updated = store.updateProject(projectId, { name: body.name, prefix: body.prefix ? normalizePrefix(body.prefix) : undefined, description: body.description, settings: nextSettings });
      return json(res, 200, { project: projectPayload(updated) });
    }
    if (!action && method === 'DELETE') {
      if (!context.user) return errorResponse(res, 403, 'API Token 不能删除项目');
      if (context.user.role !== 'admin' && Number(project.owner_id) !== context.user.id) return errorResponse(res, 403, '仅管理员或创建者可以删除项目');
      const directory = projectDirectory(projectId);
      store.deleteProject(projectId);
      await fsp.rm(directory, { recursive: true, force: true });
      await fsp.rm(path.join(ARTIFACTS_DIR, String(projectId)), { recursive: true, force: true });
      return json(res, 200, { ok: true });
    }

    if (action === 'folders' && ['POST', 'PATCH', 'DELETE'].includes(method)) {
      if (!context.user) return errorResponse(res, 403, 'API Token 不能管理目录');
      if ((method === 'POST' && parts.length !== 3) || (method !== 'POST' && parts.length !== 4)) return errorResponse(res, 400, '目录操作无效');
      const body = method === 'DELETE' ? {} : await readBody(req);
      try { return json(res, method === 'POST' ? 201 : 200, manageFolders(store, projectId, method, parts[3], body)); }
      catch (error) { return errorResponse(res, error.status || 400, error.message); }
    }
    if (action === 'icons' && parts[3] === 'move' && method === 'POST') {
      if (!context.user) return errorResponse(res, 403, 'API Token 不能移动图标');
      const body = await readBody(req);
      try { return json(res, 200, moveFolderIcons(store, projectId, body)); }
      catch (error) { return errorResponse(res, error.status || 400, error.message); }
    }
    if (action === 'icons' && !parts[3] && method === 'GET') {
      await repairLegacyIconfontIcons(project);
      return json(res, 200, { icons: store.listIcons(projectId, urlObject.searchParams.get('search') || '') });
    }

    if (action === 'icons' && parts[3] === 'import' && method === 'POST') {
      if (!context.user) return errorResponse(res, 403, 'API Token 不能导入图标');
      const body = await readBody(req);
      const result = await importItems(project, body.items || [], 'upload');
      return json(res, 200, { job: result });
    }

    if (action === 'icons' && parts[3] === 'import-preview' && method === 'POST') {
      if (!context.user) return errorResponse(res, 403, 'API Token 不能导入图标');
      const body = await readBody(req);
      try {
        const fileName = String(body.fileName || '');
        let items;
        if (/\.zip$/i.test(fileName)) items = parseIconfontZip(Buffer.from(String(body.data || ''), 'base64'));
        else if (/\.js$/i.test(fileName)) items = parseIconfontJs(body.text);
        else if (/\.svg$/i.test(fileName)) {
          const glyphs = extractGlyphsFromIconfontSvg(body.text);
          items = glyphs.length ? glyphs : [{ name: fileName.replace(/\.svg$/i, ''), svg: body.text }];
        } else throw new Error('仅支持 SVG、JS 和 ZIP 文件');
        if (!items.length || items.length > 2000) throw new Error('单次导入需包含 1–2000 个图标');
        const valid = [], rejected = [];
        for (const item of items) {
          try { valid.push({ name: String(item.name).slice(0, 200), svg: iconFromSvg({ name: item.name, svg: item.svg }).svg }); }
          catch (error) { rejected.push({ name: String(item.name).slice(0, 200), reason: error.message }); }
        }
        return json(res, 200, { items: valid, rejected });
      } catch (error) { return errorResponse(res, 400, error.message); }
    }

    if (action === 'icons' && parts[3] === 'import-js' && method === 'POST') {
      if (!context.user) return errorResponse(res, 403, 'API Token 不能导入图标');
      const body = await readBody(req);
      try { return json(res, 200, { job: await importItems(project, parseIconfontJs(body.text), 'upload') }); }
      catch (error) { return errorResponse(res, 400, error.message); }
    }

    if (action === 'icons' && parts[3] === 'import-zip' && method === 'POST') {
      if (!context.user) return errorResponse(res, 403, 'API Token 不能导入图标');
      const body = await readBody(req);
      try {
        const buffer = Buffer.from(String(body.data || ''), 'base64');
        const items = parseIconfontZip(buffer).map((item) => ({ ...item, sourceMeta: { fileName: body.fileName || 'bundle.zip' } }));
        const result = await importItems(project, items, 'iconfont');
        return json(res, 200, { job: result, count: items.length });
      } catch (error) { return errorResponse(res, 400, `ZIP 导入失败：${error.message}`); }
    }

    if (action === 'icons' && parts[3] === 'import-iconfont' && method === 'POST') {
      if (!context.user) return errorResponse(res, 403, 'API Token 不能导入图标');
      const body = await readBody(req);
      const result = await importItems(project, body.items || [], 'iconfont');
      return json(res, 200, { job: result });
    }

    if (action === 'icons' && parts[3] === 'batch' && method === 'POST') {
      if (!context.user) return errorResponse(res, 403, 'API Token 不能修改图标');
      const body = await readBody(req);
      const ids = (body.iconIds || []).map(Number).filter(Number.isFinite);
      const operation = body.operation || {};
      const requestedMargin = Number(operation.margin);
      if ((operation.type === 'fitMargin' || operation.type === 'margin') && (!Number.isFinite(requestedMargin) || requestedMargin < 0 || requestedMargin > 512)) {
        return errorResponse(res, 400, '边距必须是 0 到 512 之间的数字');
      }
      const requestedPrefix = String(operation.prefix ?? '').trim();
      if (operation.type === 'stripPrefix' && !requestedPrefix.replace(/^[-_\s/:.]+|[-_\s/:.]+$/g, '')) {
        return errorResponse(res, 400, '要移除的前缀不能为空');
      }
      const changed = [];
      let changedCount = 0;
      store.transaction(() => {
        const occupiedSlugs = operation.type === 'stripPrefix'
          ? new Set(store.listIcons(projectId).map((icon) => String(icon.slug)))
          : null;
        if ((operation.type === 'fitMargin' || operation.type === 'margin') && context.user && (context.user.role === 'admin' || Number(project.owner_id) === context.user.id)) {
          const margin = Math.min(512, Math.max(0, requestedMargin));
          store.updateProject(projectId, { settings: { ...(store.projectById(projectId).settings || {}), margin } });
        }
        for (const id of ids) {
          const icon = store.iconById(id);
          if (!icon || Number(icon.project_id) !== projectId) continue;
          if (operation.type === 'delete') { store.softDeleteIcon(id); continue; }
          if (operation.type === 'stripPrefix') {
            const nextName = stripLeadingPrefix(icon.name, requestedPrefix);
            const strippedSlug = stripLeadingPrefix(icon.slug, requestedPrefix);
            const candidateSlug = slugify(strippedSlug || nextName || 'icon');
            occupiedSlugs.delete(String(icon.slug));
            let nextSlug = candidateSlug || 'icon';
            let suffix = 2;
            while (occupiedSlugs.has(nextSlug)) nextSlug = `${candidateSlug}-${suffix++}`;
            occupiedSlugs.add(nextSlug);
            if (nextName !== icon.name || nextSlug !== icon.slug) {
              changed.push(store.updateIcon(id, { name: nextName, slug: nextSlug }));
              changedCount += 1;
            }
          } else if (operation.type === 'color') {
            const mode = operation.mode === 'custom' ? 'custom' : 'currentColor';
            const colored = setSvgColor(icon.svg, mode, operation.color);
            changed.push(store.updateIcon(id, { svg: colored.svg, colorMode: mode, sourceHash: hash(colored.svg) }));
            changedCount += 1;
          } else if (operation.type === 'fitMargin' || operation.type === 'margin') {
            const fitted = fitSvgToMargin(icon.svg, requestedMargin);
            changed.push(store.updateIcon(id, { svg: fitted.svg, viewBox: fitted.viewBox, sourceHash: hash(fitted.svg) }));
            changedCount += 1;
          } else if (operation.type === 'transform') {
            const transformed = transformSvg(icon.svg, {
              scale: operation.scale,
              translateX: operation.translateX ?? operation.left ?? 0,
              translateY: operation.translateY ?? operation.top ?? 0,
              rotation: operation.rotation,
              flipX: operation.flipX,
              flipY: operation.flipY,
            });
            changed.push(store.updateIcon(id, { svg: transformed.svg, viewBox: transformed.viewBox, sourceHash: hash(transformed.svg) }));
            changedCount += 1;
          }
        }
      });
      for (const icon of changed.filter(Boolean)) await saveIconAssets(icon);
      return json(res, 200, { icons: store.listIcons(projectId), changed: changedCount });
    }

    if (action === 'icons' && parts[3] && parts[4] === 'clone' && parts.length === 5 && method === 'POST') {
      if (!context.user) return errorResponse(res, 403, 'API Token 不能修改图标');
      const original = store.iconById(Number(parts[3]));
      if (!original || Number(original.project_id) !== projectId || original.status !== 'active') return errorResponse(res, 404, '图标不存在');
      const body = await readBody(req);
      const targetId = body.targetProjectId ?? projectId;
      if (!Number.isSafeInteger(targetId)) return errorResponse(res, 400, '目标项目无效');
      const target = store.projectById(targetId);
      if (!target || !canAccessProject(context, target, true)) return errorResponse(res, 403, '无权访问目标项目');
      const folderId = body.folderId ?? null;
      if (folderId !== null && !(target.settings.folders || []).some(folder => folder.id === folderId)) return errorResponse(res, 404, '目标目录不存在');
      let slug = `${original.slug}-copy`;
      let suffix = 2;
      while (store.iconBySlug(targetId, slug)) slug = `${original.slug}-copy-${suffix++}`;
      let cloned;
      store.transaction(() => {
      cloned = store.createIcon({ projectId: targetId, name: String(body.name || `${original.name} copy`).slice(0, 200), slug,
        svg: original.svg, viewBox: original.view_box, colorMode: original.color_mode,
        sourceType: 'clone', sourceHash: hash(original.svg), sourceMeta: { clonedFrom: original.id },
        codepoint: store.nextCodepoint(targetId, target.settings?.codepointStart ?? 0xe900) });
      store.moveIcons(targetId, [cloned.id], folderId);
      cloned = store.iconById(cloned.id);
      });
      await saveIconAssets(cloned);
      return json(res, 201, { icon: cloned });
    }

    if (action === 'icons' && parts[3] && method === 'PATCH') {
      if (!context.user) return errorResponse(res, 403, 'API Token 不能修改图标');
      const icon = store.iconById(Number(parts[3]));
      if (!icon || Number(icon.project_id) !== projectId) return errorResponse(res, 404, '图标不存在');
      const body = await readBody(req);
      if (body.baseRevision !== undefined && Number(body.baseRevision) !== Number(icon.revision)) return errorResponse(res, 409, '图标已被其他操作修改，请刷新后重试');
      let svg = icon.svg;
      let viewBox = icon.view_box;
      if (body.svg !== undefined) {
        const clean = sanitizeSvg(body.svg, { colorMode: body.colorMode === 'currentColor' ? 'currentColor' : 'preserve' });
        const normalized = normalizeToViewport(clean);
        svg = normalized.svg;
        viewBox = normalized.viewBox;
      }
      const slug = body.slug === undefined ? icon.slug : slugify(body.slug);
      const same = store.iconBySlug(projectId, slug);
      if (same && Number(same.id) !== Number(icon.id)) return errorResponse(res, 409, '图标 slug 已存在');
      const updated = store.updateIcon(Number(parts[3]), { name: body.name, slug, svg, viewBox, colorMode: body.colorMode, codepoint: body.codepoint === '' ? null : body.codepoint, sourceHash: hash(svg) });
      await saveIconAssets(updated);
      return json(res, 200, { icon: updated });
    }

    if (action === 'icons' && parts[3] && method === 'DELETE') {
      if (!context.user) return errorResponse(res, 403, 'API Token 不能删除图标');
      const icon = store.iconById(Number(parts[3]));
      if (!icon || Number(icon.project_id) !== projectId) return errorResponse(res, 404, '图标不存在');
      store.softDeleteIcon(Number(parts[3]));
      return json(res, 200, { ok: true });
    }

    if (action === 'build' && method === 'POST') {
      await repairLegacyIconfontIcons(project);
      const result = await buildProject(projectId);
      return result.status === 'success' ? json(res, 200, { build: result }) : errorResponse(res, 500, result.error_message || '构建失败', { build: result });
    }
    if (action === 'builds' && method === 'GET') return json(res, 200, { builds: store.listBuilds(projectId) });
    if (action === 'artifacts' && parts[3] === 'iconfont.js' && method === 'GET') {
      if (context.token && !context.token.scopes.includes('build:read')) return errorResponse(res, 403, 'Token 没有读取构建产物权限');
      const latest = store.latestBuild(projectId);
      if (!latest || latest.status !== 'success' || !latest.artifact_path) return errorResponse(res, 404, '项目还没有成功的构建产物');
      const content = await fsp.readFile(latest.artifact_path, 'utf8');
      return text(res, 200, content, 'application/javascript; charset=utf-8', { 'Cache-Control': 'public, max-age=60', ETag: latest.checksum });
    }
    if (action === 'import-jobs' && parts[3] && method === 'GET') {
      const job = store.importJobById(Number(parts[3]));
      return job ? json(res, 200, { job }) : errorResponse(res, 404, '导入任务不存在');
    }
    if (action === 'tokens' && method === 'POST') {
      return errorResponse(res, 410, 'API Token 创建功能已停用');
    }
  }

  return errorResponse(res, 404, '接口不存在');
}

async function serveStatic(req, res, urlObject) {
  let relative = decodeURIComponent(urlObject.pathname.replace(/^\//, '')) || 'index.html';
  if (relative.includes('..')) return errorResponse(res, 400, '路径无效');
  let target = path.resolve(PUBLIC_DIR, relative);
  const root = path.resolve(PUBLIC_DIR) + path.sep;
  if (!target.startsWith(root)) return errorResponse(res, 400, '路径无效');
  try {
    const stat = await fsp.stat(target);
    if (!stat.isFile()) throw new Error('not file');
  } catch {
    target = path.join(PUBLIC_DIR, 'index.html');
  }
  const extension = path.extname(target).toLowerCase();
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };
  try {
    return text(res, 200, await fsp.readFile(target), types[extension] || 'application/octet-stream', {
      'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'",
    });
  } catch { return errorResponse(res, 404, '资源不存在'); }
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObject = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (urlObject.pathname.startsWith('/api/')) {
      const apiUrl = new URL(urlObject.toString());
      apiUrl.pathname = urlObject.pathname.slice(5);
      await handleApi(req, res, apiUrl);
    }
    else await serveStatic(req, res, urlObject);
  } catch (error) {
    console.error(error);
    errorResponse(res, error.statusCode || 500, error.statusCode ? error.message : '服务器内部错误');
  }
});

for (const project of store.listProjects({ role: 'admin' })) cleanBuildHistory(project.id);
server.listen(PORT, HOST, () => console.log(`IconFamily running at http://localhost:${PORT}`));

process.on('SIGINT', () => { store.close(); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { store.close(); server.close(() => process.exit(0)); });
