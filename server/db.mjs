import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_PROJECT_MARGIN = 100;

function now() {
  return new Date().toISOString();
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, encoded) {
  const [algorithm, salt, expected] = String(encoded ?? '').split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function projectRow(row) {
  if (!row) return null;
  const settings = parseJson(row.settings, {});
  const margin = Number(settings?.margin);
  return { ...row, settings: { ...settings, margin: Number.isFinite(margin) && margin >= 0 && margin <= 512 ? margin : DEFAULT_PROJECT_MARGIN } };
}

function iconRow(row) {
  if (!row) return null;
  const { source_meta, padding_top, padding_right, padding_bottom, padding_left, ...publicRow } = row;
  return { ...publicRow, sourceMeta: parseJson(source_meta, null) };
}

function buildRow(row) {
  if (!row) return null;
  return { ...row };
}

export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, 'iconfamily.sqlite'));
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        last_login_at TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cart_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        remote_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, remote_id)
      );
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        prefix TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        owner_id INTEGER NOT NULL REFERENCES users(id),
        settings TEXT NOT NULL DEFAULT '{}',
        revision INTEGER NOT NULL DEFAULT 0,
        latest_build_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS icons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'upload',
        source_provider TEXT,
        source_remote_id TEXT,
        source_url TEXT,
        source_meta TEXT,
        source_hash TEXT NOT NULL,
        svg TEXT NOT NULL,
        view_box TEXT NOT NULL DEFAULT '0 0 1024 1024',
        color_mode TEXT NOT NULL DEFAULT 'preserve',
        codepoint INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        revision INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, slug)
      );
      CREATE INDEX IF NOT EXISTS idx_icons_project ON icons(project_id, status, sort_order, id);
      CREATE INDEX IF NOT EXISTS idx_icons_remote ON icons(project_id, source_provider, source_remote_id);
      CREATE TABLE IF NOT EXISTS builds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_revision INTEGER NOT NULL,
        version INTEGER NOT NULL,
        status TEXT NOT NULL,
        artifact_path TEXT,
        checksum TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        finished_at TEXT
      );
      CREATE TABLE IF NOT EXISTS import_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        total INTEGER NOT NULL DEFAULT 0,
        succeeded INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        report TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        finished_at TEXT
      );
      CREATE TABLE IF NOT EXISTS api_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        scopes TEXT NOT NULL DEFAULT 'build:read,build:write',
        created_at TEXT NOT NULL,
        revoked_at TEXT
      );
    `);
    if (!this.db.prepare('PRAGMA table_info(icons)').all().some(column => column.name === 'folder_id')) {
      this.db.exec('ALTER TABLE icons ADD COLUMN folder_id TEXT DEFAULT NULL');
    }
  }

  close() { this.db.close(); }

  listCart(userId) {
    return this.db.prepare('SELECT id,payload,created_at FROM cart_items WHERE user_id=? ORDER BY id DESC').all(userId)
      .map(row => ({ ...parseJson(row.payload, {}), id: Number(row.id), createdAt: row.created_at }));
  }

  addCartItem(userId, item) {
    this.db.prepare('INSERT INTO cart_items(user_id,remote_id,payload,created_at) VALUES(?,?,?,?) ON CONFLICT(user_id,remote_id) DO NOTHING')
      .run(userId, item.remoteId, JSON.stringify(item), now());
    const row = this.db.prepare('SELECT id,payload,created_at FROM cart_items WHERE user_id=? AND remote_id=?').get(userId, item.remoteId);
    return { ...parseJson(row.payload, {}), id: Number(row.id), createdAt: row.created_at };
  }

  removeCartItems(userId, ids) {
    const statement = this.db.prepare('DELETE FROM cart_items WHERE user_id=? AND id=?');
    this.transaction(() => { for (const id of ids) statement.run(userId, id); });
  }

  transaction(callback) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  seedAdmin(username, password) {
    const exists = this.db.prepare('SELECT id FROM users LIMIT 1').get();
    if (exists) return;
    this.db.prepare('INSERT INTO users(username,password_hash,role,status,created_at) VALUES(?,?,?,?,?)')
      .run(username, hashPassword(password), 'admin', 'active', now());
  }

  authenticate(username, password) {
    const user = this.db.prepare('SELECT * FROM users WHERE username = ? AND status = \'active\'').get(username);
    if (!user || !verifyPassword(password, user.password_hash)) return null;
    this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), user.id);
    return this.userById(user.id);
  }

  userById(id) {
    const row = this.db.prepare('SELECT id,username,role,status,created_at,last_login_at FROM users WHERE id = ?').get(id);
    return row ? { ...row } : null;
  }

  listUsers() {
    return this.db.prepare('SELECT id,username,role,status,created_at,last_login_at FROM users ORDER BY username').all().map((row) => ({ ...row }));
  }

  createUser({ username, password, role = 'member' }) {
    const result = this.db.prepare('INSERT INTO users(username,password_hash,role,status,created_at) VALUES(?,?,?,?,?)')
      .run(username, hashPassword(password), role === 'admin' ? 'admin' : 'member', 'active', now());
    return this.userById(Number(result.lastInsertRowid));
  }

  deleteUser(id) {
    const user = this.userById(id);
    if (!user) return false;
    const adminCount = this.db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND status='active'").get().count;
    if (user.role === 'admin' && adminCount <= 1) throw new Error('不能删除最后一个管理员');
    const fallbackAdmin = this.db.prepare("SELECT id FROM users WHERE role='admin' AND status='active' AND id<>? ORDER BY id LIMIT 1").get(id);
    if (fallbackAdmin) this.db.prepare('UPDATE projects SET owner_id=?,updated_at=? WHERE owner_id=?').run(fallbackAdmin.id, now(), id);
    this.db.prepare("UPDATE users SET status='deleted' WHERE id=?").run(id);
    this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    return true;
  }

  changePassword(id, password, currentPassword) {
    const user = this.db.prepare("SELECT * FROM users WHERE id=? AND status='active'").get(id);
    if (!user || (currentPassword !== undefined && !verifyPassword(currentPassword, user.password_hash))) return false;
    const encoded = hashPassword(password);
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(encoded, id);
      this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return true;
  }

  createSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
      .run(hashToken(token), userId, expiry, now());
    return { token, expiresAt: expiry };
  }

  userBySession(token) {
    if (!token) return null;
    const row = this.db.prepare(`
      SELECT u.id,u.username,u.role,u.status,u.created_at,u.last_login_at
      FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'
    `).get(hashToken(token), now());
    return row ? { ...row } : null;
  }

  destroySession(token) {
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
  }

  cleanupSessions() { this.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now()); }

  listProjects(user) {
    const rows = this.db.prepare(`SELECT p.*,u.username AS owner_name,(SELECT COUNT(*) FROM icons i WHERE i.project_id=p.id AND i.status='active') AS icon_count FROM projects p JOIN users u ON u.id=p.owner_id ORDER BY p.updated_at DESC`).all();
    return rows.map(projectRow).filter((project) => user.role === 'admin' || project.owner_id === user.id || project.settings?.everyoneCanEdit === true || (project.settings?.collaboratorIds || []).includes(user.id));
  }

  projectById(id) {
    return projectRow(this.db.prepare(`SELECT p.*,u.username AS owner_name,(SELECT COUNT(*) FROM icons i WHERE i.project_id=p.id AND i.status='active') AS icon_count FROM projects p JOIN users u ON u.id=p.owner_id WHERE p.id=?`).get(id));
  }

  createProject({ name, prefix, description = '', ownerId, settings = {} }) {
    const timestamp = now();
    const result = this.db.prepare('INSERT INTO projects(name,prefix,description,owner_id,settings,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(name, prefix, description, ownerId, JSON.stringify(settings), timestamp, timestamp);
    return this.projectById(Number(result.lastInsertRowid));
  }

  updateProject(id, fields) {
    const current = this.projectById(id);
    if (!current) return null;
    const next = {
      name: fields.name ?? current.name,
      prefix: fields.prefix ?? current.prefix,
      description: fields.description ?? current.description,
      settings: fields.settings ?? current.settings,
    };
    this.db.prepare('UPDATE projects SET name=?,prefix=?,description=?,settings=?,revision=revision+1,updated_at=? WHERE id=?')
      .run(next.name, next.prefix, next.description, JSON.stringify(next.settings), now(), id);
    return this.projectById(id);
  }

  deleteProject(id) {
    this.db.prepare('DELETE FROM projects WHERE id=?').run(id);
  }

  setFolders(projectId, folders) {
    const project = this.projectById(projectId);
    this.db.prepare('UPDATE projects SET settings=? WHERE id=?')
      .run(JSON.stringify({ ...project.settings, folders }), projectId);
  }

  moveIcons(projectId, ids, folderId) {
    const statement = this.db.prepare("UPDATE icons SET folder_id=? WHERE id=? AND project_id=? AND status='active'");
    for (const id of ids) statement.run(folderId, id, projectId);
  }

  listIcons(projectId, search = '') {
    const pattern = `%${String(search).replace(/[%_]/g, '')}%`;
    return this.db.prepare(`
      SELECT * FROM icons
      WHERE project_id=? AND status='active' AND (?='' OR name LIKE ? OR slug LIKE ?)
      ORDER BY created_at DESC, id DESC
    `).all(projectId, search, pattern, pattern).map(iconRow);
  }

  iconById(id) { return iconRow(this.db.prepare('SELECT * FROM icons WHERE id=?').get(id)); }

  iconBySlug(projectId, slug) { return iconRow(this.db.prepare('SELECT * FROM icons WHERE project_id=? AND slug=?').get(projectId, slug)); }

  iconByHash(projectId, sourceHash) { return iconRow(this.db.prepare("SELECT * FROM icons WHERE project_id=? AND source_hash=? AND status='active' LIMIT 1").get(projectId, sourceHash)); }

  iconByRemoteId(projectId, provider, remoteId) {
    return iconRow(this.db.prepare('SELECT * FROM icons WHERE project_id=? AND source_provider=? AND source_remote_id=? AND status=\'active\'').get(projectId, provider, String(remoteId)));
  }

  createIcon(data) {
    const timestamp = now();
    const result = this.db.prepare(`
      INSERT INTO icons(project_id,name,slug,source_type,source_provider,source_remote_id,source_url,source_meta,source_hash,svg,view_box,color_mode,codepoint,sort_order,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(data.projectId, data.name, data.slug, data.sourceType ?? 'upload', data.sourceProvider ?? null, data.sourceRemoteId ?? null, data.sourceUrl ?? null, JSON.stringify(data.sourceMeta ?? null), data.sourceHash, data.svg, data.viewBox ?? '0 0 1024 1024', data.colorMode ?? 'preserve', data.codepoint ?? null, data.sortOrder ?? 0, timestamp, timestamp);
    this.db.prepare('UPDATE projects SET revision=revision+1,updated_at=? WHERE id=?').run(timestamp, data.projectId);
    return this.iconById(Number(result.lastInsertRowid));
  }

  updateIcon(id, fields) {
    const current = this.iconById(id);
    if (!current) return null;
    const next = {
      name: fields.name ?? current.name,
      slug: fields.slug ?? current.slug,
      svg: fields.svg ?? current.svg,
      viewBox: fields.viewBox ?? current.view_box,
      colorMode: fields.colorMode ?? current.color_mode,
      codepoint: fields.codepoint === undefined ? current.codepoint : fields.codepoint,
      sourceHash: fields.sourceHash ?? current.source_hash,
      sourceMeta: fields.sourceMeta === undefined ? current.sourceMeta : fields.sourceMeta,
    };
    const timestamp = now();
    this.db.prepare(`UPDATE icons SET name=?,slug=?,svg=?,view_box=?,color_mode=?,codepoint=?,source_hash=?,source_meta=?,revision=revision+1,updated_at=? WHERE id=?`)
      .run(next.name, next.slug, next.svg, next.viewBox, next.colorMode, next.codepoint, next.sourceHash, JSON.stringify(next.sourceMeta ?? null), timestamp, id);
    this.db.prepare('UPDATE projects SET revision=revision+1,updated_at=? WHERE id=?').run(timestamp, current.project_id);
    return this.iconById(id);
  }

  softDeleteIcon(id) {
    const icon = this.iconById(id);
    if (!icon) return false;
    const timestamp = now();
    this.db.prepare("UPDATE icons SET status='deleted',revision=revision+1,updated_at=? WHERE id=?").run(timestamp, id);
    this.db.prepare('UPDATE projects SET revision=revision+1,updated_at=? WHERE id=?').run(timestamp, icon.project_id);
    return true;
  }

  nextCodepoint(projectId, start = 0xe900) {
    const row = this.db.prepare('SELECT MAX(codepoint) AS max FROM icons WHERE project_id=?').get(projectId);
    return Math.max(Number(start) || 0xe900, Number(row?.max ?? 0) + 1);
  }

  createBuild(projectId, sourceRevision, version) {
    const result = this.db.prepare('INSERT INTO builds(project_id,source_revision,version,status,created_at) VALUES(?,?,?,?,?)')
      .run(projectId, sourceRevision, version, 'processing', now());
    return buildRow(this.db.prepare('SELECT * FROM builds WHERE id=?').get(Number(result.lastInsertRowid)));
  }

  finishBuild(id, { status, artifactPath = null, checksum = null, errorMessage = null }) {
    this.db.prepare('UPDATE builds SET status=?,artifact_path=?,checksum=?,error_message=?,finished_at=? WHERE id=?')
      .run(status, artifactPath, checksum, errorMessage, now(), id);
    return buildRow(this.db.prepare('SELECT * FROM builds WHERE id=?').get(id));
  }

  listBuilds(projectId, limit = 20) { return this.db.prepare('SELECT * FROM builds WHERE project_id=? ORDER BY id DESC LIMIT ?').all(projectId, limit ?? -1).map(buildRow); }
  deleteBuild(projectId, id) { this.db.prepare('DELETE FROM builds WHERE project_id=? AND id=?').run(projectId, id); }

  latestBuild(projectId) {
    const project = this.projectById(projectId);
    return project?.latest_build_id ? buildRow(this.db.prepare('SELECT * FROM builds WHERE id=?').get(project.latest_build_id)) : null;
  }

  publishBuild(projectId, buildId) {
    this.db.prepare('UPDATE projects SET latest_build_id=?,updated_at=? WHERE id=?').run(buildId, now(), projectId);
  }

  createImportJob(projectId, total) {
    const result = this.db.prepare('INSERT INTO import_jobs(project_id,status,total,created_at) VALUES(?,?,?,?)').run(projectId, 'processing', total, now());
    return this.importJobById(Number(result.lastInsertRowid));
  }

  importJobById(id) {
    const row = this.db.prepare('SELECT * FROM import_jobs WHERE id=?').get(id);
    return row ? { ...row, report: parseJson(row.report, []) } : null;
  }

  finishImportJob(id, result) {
    this.db.prepare('UPDATE import_jobs SET status=?,succeeded=?,skipped=?,failed=?,report=?,finished_at=? WHERE id=?')
      .run(result.status, result.succeeded, result.skipped, result.failed, JSON.stringify(result.report ?? []), now(), id);
    return this.importJobById(id);
  }

  createApiToken(projectId, name) {
    const token = `if_${crypto.randomBytes(24).toString('base64url')}`;
    this.db.prepare('INSERT INTO api_tokens(project_id,name,token_hash,created_at) VALUES(?,?,?,?)').run(projectId, name, hashToken(token), now());
    return token;
  }

  apiToken(token) {
    const row = this.db.prepare("SELECT * FROM api_tokens WHERE token_hash=? AND revoked_at IS NULL").get(hashToken(token));
    return row ? { ...row, scopes: String(row.scopes).split(',').map((scope) => scope.trim()) } : null;
  }
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
