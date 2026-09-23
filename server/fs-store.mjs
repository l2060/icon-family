import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashPassword, verifyPassword, hashToken } from './db.mjs';

const timestamp = () => new Date().toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));
const DEFAULT_PROJECT_MARGIN = 100;

function projectView(state, project) {
  if (!project) return null;
  const owner = state.users.find((user) => user.id === project.owner_id);
  const margin = Number(project.settings?.margin);
  const settings = { ...(project.settings || {}), margin: Number.isFinite(margin) && margin >= 0 && margin <= 512 ? margin : DEFAULT_PROJECT_MARGIN };
  return { ...project, settings, owner_name: owner?.username || '', icon_count: state.icons.filter((icon) => icon.project_id === project.id && icon.status === 'active').length };
}

function iconView(icon) {
  if (!icon) return null;
  const { source_meta, padding_top, padding_right, padding_bottom, padding_left, ...publicIcon } = icon;
  return { ...publicIcon, folder_id: icon.folder_id ?? null, sourceMeta: source_meta ?? null };
}

export class JsonStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'metadata.json');
    this.inTransaction = false;
    this.state = { nextIds: { users: 1, projects: 1, icons: 1, builds: 1, importJobs: 1, cartItems: 1 }, users: [], sessions: [], projects: [], icons: [], builds: [], importJobs: [], apiTokens: [], cartItems: [] };
    this.load();
  }

  load() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.state = { ...this.state, ...parsed, nextIds: { ...this.state.nextIds, ...(parsed.nextIds || {}) } };
    } catch {
      this.save();
    }
  }

  save() {
    if (this.inTransaction) return;
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(temporary, this.file);
  }

  close() {}

  listCart(userId) {
    return this.state.cartItems.filter(item => item.userId === userId).sort((a, b) => b.id - a.id)
      .map(({ userId: owner, ...item }) => clone(item));
  }

  addCartItem(userId, item) {
    const existing = this.state.cartItems.find(row => row.userId === userId && row.remoteId === item.remoteId);
    if (!existing) {
      this.state.cartItems.push({ ...item, id: this.idFor('cartItems'), userId, createdAt: timestamp() });
      this.save();
    }
    return this.listCart(userId).find(row => row.remoteId === item.remoteId);
  }

  removeCartItems(userId, ids) {
    const selected = new Set(ids);
    this.state.cartItems = this.state.cartItems.filter(item => item.userId !== userId || !selected.has(item.id));
    this.save();
  }

  transaction(callback) {
    const snapshot = clone(this.state);
    this.inTransaction = true;
    try {
      const result = callback();
      this.inTransaction = false;
      this.save();
      return result;
    } catch (error) {
      this.inTransaction = false;
      this.state = snapshot;
      this.save();
      throw error;
    }
  }

  idFor(collection) {
    const id = this.state.nextIds[collection] || 1;
    this.state.nextIds[collection] = id + 1;
    return id;
  }

  seedAdmin(username, password) {
    if (this.state.users.length) return;
    this.state.users.push({ id: this.idFor('users'), username, password_hash: hashPassword(password), role: 'admin', status: 'active', created_at: timestamp(), last_login_at: null });
    this.save();
  }

  userById(id) {
    const user = this.state.users.find((candidate) => Number(candidate.id) === Number(id) && candidate.status === 'active');
    if (!user) return null;
    const { password_hash, ...publicUser } = user;
    return publicUser;
  }

  authenticate(username, password) {
    const user = this.state.users.find((candidate) => candidate.username === username && candidate.status === 'active');
    if (!user || !verifyPassword(password, user.password_hash)) return null;
    user.last_login_at = timestamp();
    this.save();
    return this.userById(user.id);
  }

  listUsers() { return this.state.users.map(({ password_hash, ...user }) => ({ ...user })); }

  createUser({ username, password, role = 'member' }) {
    if (this.state.users.some((user) => user.username === username)) throw new Error('用户名已存在');
    const user = { id: this.idFor('users'), username, password_hash: hashPassword(password), role: role === 'admin' ? 'admin' : 'member', status: 'active', created_at: timestamp(), last_login_at: null };
    this.state.users.push(user);
    this.save();
    return this.userById(user.id);
  }

  deleteUser(id) {
    const user = this.state.users.find((candidate) => Number(candidate.id) === Number(id));
    if (!user) return false;
    const admins = this.state.users.filter((candidate) => candidate.role === 'admin' && candidate.status === 'active').length;
    if (user.role === 'admin' && admins <= 1) throw new Error('不能删除最后一个管理员');
    const fallbackAdmin = this.state.users.find((candidate) => candidate.role === 'admin' && candidate.status === 'active' && candidate.id !== user.id);
    if (fallbackAdmin) this.state.projects.filter((project) => project.owner_id === user.id).forEach((project) => { project.owner_id = fallbackAdmin.id; project.updated_at = timestamp(); });
    user.status = 'deleted';
    this.state.sessions = this.state.sessions.filter((session) => session.user_id !== user.id);
    this.save();
    return true;
  }

  changePassword(id, password, currentPassword) {
    const user = this.state.users.find((candidate) => Number(candidate.id) === Number(id) && candidate.status === 'active');
    if (!user || (currentPassword !== undefined && !verifyPassword(currentPassword, user.password_hash))) return false;
    user.password_hash = hashPassword(password);
    this.state.sessions = this.state.sessions.filter((session) => session.user_id !== user.id);
    this.save();
    return true;
  }

  createSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    this.state.sessions.push({ token_hash: hashToken(token), user_id: userId, expires_at: expiresAt, created_at: timestamp() });
    this.save();
    return { token, expiresAt };
  }

  userBySession(token) {
    if (!token) return null;
    const session = this.state.sessions.find((candidate) => candidate.token_hash === hashToken(token) && candidate.expires_at > timestamp());
    return session ? this.userById(session.user_id) : null;
  }

  destroySession(token) {
    if (!token) return;
    this.state.sessions = this.state.sessions.filter((session) => session.token_hash !== hashToken(token));
    this.save();
  }

  cleanupSessions() {
    this.state.sessions = this.state.sessions.filter((session) => session.expires_at > timestamp());
    this.save();
  }

  listProjects(user) {
    return this.state.projects.filter((project) => user.role === 'admin' || project.owner_id === user.id || project.settings?.everyoneCanEdit === true || (project.settings?.collaboratorIds || []).includes(user.id)).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).map((project) => projectView(this.state, project));
  }

  projectById(id) { return projectView(this.state, this.state.projects.find((project) => Number(project.id) === Number(id))); }

  createProject({ name, prefix, description = '', ownerId, settings = {} }) {
    const project = { id: this.idFor('projects'), name, prefix, description, owner_id: ownerId, settings, revision: 0, latest_build_id: null, created_at: timestamp(), updated_at: timestamp() };
    this.state.projects.push(project);
    this.save();
    return projectView(this.state, project);
  }

  updateProject(id, fields) {
    const project = this.state.projects.find((candidate) => Number(candidate.id) === Number(id));
    if (!project) return null;
    Object.assign(project, { name: fields.name ?? project.name, prefix: fields.prefix ?? project.prefix, description: fields.description ?? project.description, settings: fields.settings ?? project.settings, revision: project.revision + 1, updated_at: timestamp() });
    this.save();
    return projectView(this.state, project);
  }

  deleteProject(id) {
    this.state.projects = this.state.projects.filter((project) => Number(project.id) !== Number(id));
    this.state.icons = this.state.icons.filter((icon) => Number(icon.project_id) !== Number(id));
    this.state.builds = this.state.builds.filter((build) => Number(build.project_id) !== Number(id));
    this.state.importJobs = this.state.importJobs.filter((job) => Number(job.project_id) !== Number(id));
    this.state.apiTokens = this.state.apiTokens.filter((token) => Number(token.project_id) !== Number(id));
    this.save();
  }

  listIcons(projectId, search = '') {
    const needle = String(search).toLowerCase();
    return this.state.icons.filter((icon) => Number(icon.project_id) === Number(projectId) && icon.status === 'active' && (!needle || `${icon.name} ${icon.slug}`.toLowerCase().includes(needle))).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || Number(b.id) - Number(a.id)).map(iconView);
  }

  setFolders(projectId, folders) {
    const project = this.state.projects.find(project => Number(project.id) === Number(projectId));
    project.settings = { ...project.settings, folders };
    this.save();
  }

  moveIcons(projectId, ids, folderId) {
    const selected = new Set(ids);
    for (const icon of this.state.icons) {
      if (Number(icon.project_id) === Number(projectId) && selected.has(Number(icon.id)) && icon.status === 'active') icon.folder_id = folderId;
    }
    this.save();
  }

  iconById(id) { return iconView(this.state.icons.find((icon) => Number(icon.id) === Number(id))); }
  iconBySlug(projectId, slug) { return iconView(this.state.icons.find((icon) => Number(icon.project_id) === Number(projectId) && icon.slug === slug && icon.status === 'active')); }
  iconByHash(projectId, sourceHash) { return iconView(this.state.icons.find((icon) => Number(icon.project_id) === Number(projectId) && icon.source_hash === sourceHash && icon.status === 'active')); }
  iconByRemoteId(projectId, provider, remoteId) { return iconView(this.state.icons.find((icon) => Number(icon.project_id) === Number(projectId) && icon.source_provider === provider && String(icon.source_remote_id) === String(remoteId) && icon.status === 'active')); }

  createIcon(data) {
    const icon = { id: this.idFor('icons'), project_id: data.projectId, name: data.name, slug: data.slug, source_type: data.sourceType ?? 'upload', source_provider: data.sourceProvider ?? null, source_remote_id: data.sourceRemoteId ?? null, source_url: data.sourceUrl ?? null, source_meta: data.sourceMeta ?? null, source_hash: data.sourceHash, svg: data.svg, view_box: data.viewBox ?? '0 0 1024 1024', color_mode: data.colorMode ?? 'preserve', codepoint: data.codepoint ?? null, sort_order: data.sortOrder ?? 0, status: 'active', revision: 0, created_at: timestamp(), updated_at: timestamp() };
    this.state.icons.push(icon);
    const project = this.state.projects.find((candidate) => candidate.id === icon.project_id);
    if (project) { project.revision += 1; project.updated_at = timestamp(); }
    this.save();
    return iconView(icon);
  }

  updateIcon(id, fields) {
    const icon = this.state.icons.find((candidate) => Number(candidate.id) === Number(id));
    if (!icon) return null;
    Object.assign(icon, { name: fields.name ?? icon.name, slug: fields.slug ?? icon.slug, svg: fields.svg ?? icon.svg, view_box: fields.viewBox ?? icon.view_box, color_mode: fields.colorMode ?? icon.color_mode, codepoint: fields.codepoint === undefined ? icon.codepoint : fields.codepoint, source_hash: fields.sourceHash ?? icon.source_hash, source_meta: fields.sourceMeta === undefined ? icon.source_meta : fields.sourceMeta, revision: icon.revision + 1, updated_at: timestamp() });
    const project = this.state.projects.find((candidate) => candidate.id === icon.project_id);
    if (project) { project.revision += 1; project.updated_at = timestamp(); }
    this.save();
    return iconView(icon);
  }

  softDeleteIcon(id) {
    const icon = this.state.icons.find((candidate) => Number(candidate.id) === Number(id));
    if (!icon) return false;
    icon.status = 'deleted'; icon.revision += 1; icon.updated_at = timestamp();
    const project = this.state.projects.find((candidate) => candidate.id === icon.project_id);
    if (project) { project.revision += 1; project.updated_at = timestamp(); }
    this.save();
    return true;
  }

  nextCodepoint(projectId, start = 0xe900) {
    const values = this.state.icons.filter((icon) => Number(icon.project_id) === Number(projectId) && icon.codepoint).map((icon) => Number(icon.codepoint));
    return Math.max(Number(start) || 0xe900, (values.length ? Math.max(...values) : 0) + 1);
  }

  createBuild(projectId, sourceRevision, version) {
    const build = { id: this.idFor('builds'), project_id: projectId, source_revision: sourceRevision, version, status: 'processing', artifact_path: null, checksum: null, error_message: null, created_at: timestamp(), finished_at: null };
    this.state.builds.push(build); this.save(); return { ...build };
  }

  finishBuild(id, data) {
    const build = this.state.builds.find((candidate) => Number(candidate.id) === Number(id));
    if (!build) return null;
    Object.assign(build, { status: data.status, artifact_path: data.artifactPath ?? null, checksum: data.checksum ?? null, error_message: data.errorMessage ?? null, finished_at: timestamp() });
    this.save(); return { ...build };
  }

  listBuilds(projectId) { return this.state.builds.filter((build) => Number(build.project_id) === Number(projectId)).sort((a, b) => b.id - a.id).slice(0, 20).map((build) => ({ ...build })); }
  latestBuild(projectId) { const project = this.state.projects.find((candidate) => Number(candidate.id) === Number(projectId)); return project?.latest_build_id ? { ...this.state.builds.find((build) => Number(build.id) === Number(project.latest_build_id)) } : null; }
  publishBuild(projectId, buildId) { const project = this.state.projects.find((candidate) => Number(candidate.id) === Number(projectId)); if (project) { project.latest_build_id = buildId; project.updated_at = timestamp(); this.save(); } }

  createImportJob(projectId, total) { const job = { id: this.idFor('importJobs'), project_id: projectId, status: 'processing', total, succeeded: 0, skipped: 0, failed: 0, report: [], created_at: timestamp(), finished_at: null }; this.state.importJobs.push(job); this.save(); return { ...job }; }
  importJobById(id) { const job = this.state.importJobs.find((candidate) => Number(candidate.id) === Number(id)); return job ? { ...job, report: job.report || [] } : null; }
  finishImportJob(id, result) { const job = this.state.importJobs.find((candidate) => Number(candidate.id) === Number(id)); if (!job) return null; Object.assign(job, { status: result.status, succeeded: result.succeeded, skipped: result.skipped, failed: result.failed, report: result.report || [], finished_at: timestamp() }); this.save(); return { ...job }; }

  createApiToken(projectId, name) { const token = `if_${crypto.randomBytes(24).toString('base64url')}`; this.state.apiTokens.push({ id: this.state.apiTokens.length + 1, project_id: projectId, name, token_hash: hashToken(token), scopes: 'build:read,build:write', created_at: timestamp(), revoked_at: null }); this.save(); return token; }
  apiToken(token) { const row = this.state.apiTokens.find((candidate) => candidate.token_hash === hashToken(token) && !candidate.revoked_at); return row ? { ...row, scopes: String(row.scopes).split(',').map((scope) => scope.trim()) } : null; }
}
