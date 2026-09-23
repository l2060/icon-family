const app = document.querySelector('#app');
const filePicker = document.querySelector('#filePicker');

const state = {
  user: null,
  projects: [],
  activeProjectId: null,
  project: null,
  icons: [],
  iconSearch: '',
  selected: new Set(),
  remoteResults: [],
  remoteSelected: new Map(),
  remotePage: 1,
  remoteTotal: 0,
  remoteQuery: '',
  editor: null,
};
let iconSearchTimer = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function clientSlug(value, fallback = 'icon') {
  const text = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return text || fallback;
}

function clientPrefix(value) {
  const prefix = clientSlug(value, 'icon');
  return /^[a-z]/i.test(prefix) ? prefix.slice(0, 40) : `p-${prefix}`.slice(0, 40);
}

function projectIconId(project, icon) {
  const prefix = clientPrefix(project?.prefix);
  const candidate = clientSlug(icon?.slug || icon?.name || 'icon');
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const suffix = candidate.toLowerCase() === prefix.toLowerCase()
    ? 'icon'
    : candidate.replace(new RegExp(`^${escapedPrefix}(?:-)+`, 'i'), '') || 'icon';
  return `${prefix}-${suffix}`;
}

async function copyText(value) {
  const text = String(value ?? '');
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {}
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('浏览器拒绝了剪贴板访问');
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin' });
  const raw = await response.text();
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
  if (!response.ok) {
    const error = new Error(payload?.error || `请求失败（${response.status}）`);
    error.status = response.status;
    error.payload = payload;
    if (response.status === 401 && !path.includes('/auth/')) {
      state.user = null;
      renderLogin();
    }
    throw error;
  }
  return payload;
}

function showToast(message, type = 'info') {
  let holder = document.querySelector('#toastHolder');
  if (!holder) {
    holder = document.createElement('div');
    holder.id = 'toastHolder';
    holder.className = 'toast-holder';
    document.body.append(holder);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  holder.append(toast);
  setTimeout(() => toast.remove(), 3200);
}

function overlay(content, className = '') {
  const node = document.createElement('div');
  node.className = `overlay ${className}`;
  node.innerHTML = content;
  document.body.append(node);
  return node;
}

function closeOverlay(node) {
  if (node && node.parentNode) node.remove();
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="brand"><span class="brand-mark">IF</span><span>IconFamily</span></div>
        <h1>登录图标库</h1>
        <p>管理 SVG 图标、导入 iconfont 资源并生成发布文件。</p>
        <form id="loginForm">
          <div class="form-item"><label for="loginUsername">用户名</label><input id="loginUsername" class="ant-input" autocomplete="username" required /></div>
          <div class="form-item"><label for="loginPassword">密码</label><input id="loginPassword" type="password" class="ant-input" autocomplete="current-password" required /></div>
          <div id="loginError" class="notice error hidden"></div>
          <button class="ant-btn ant-btn-primary ant-btn-block" type="submit">登录</button>
        </form>
        <div class="muted" style="margin-top:16px;font-size:12px">首次启动默认账号：admin / adminadmin</div>
      </div>
    </div>`;
  document.querySelector('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = document.querySelector('#loginError');
    errorBox.classList.add('hidden');
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: document.querySelector('#loginUsername').value, password: document.querySelector('#loginPassword').value }) });
      state.user = result.user;
      await renderApp();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
    } finally { button.disabled = false; }
  });
  document.querySelector('#loginUsername').focus();
}

async function renderApp() {
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-brand"><span class="brand-mark">IF</span><span>IconFamily</span></div>
          <div class="sidebar-actions"><button id="newProjectButton" class="ant-btn ant-btn-primary ant-btn-block">＋ 新建项目</button></div>
        </div>
        <div style="padding:10px 10px 0"><input id="projectSearch" class="ant-input" placeholder="搜索项目" /></div>
        <div id="projectList" class="sidebar-list"></div>
        <div class="sidebar-footer"><button id="userButton" class="user-button"><span class="avatar">${esc((state.user?.username || 'U').slice(0, 1).toUpperCase())}</span><span class="project-meta"><span class="project-name ellipsis">${esc(state.user?.username)}</span><span class="project-sub">${state.user?.role === 'admin' ? '管理员' : '普通用户'}</span></span><span>⋯</span></button></div>
      </aside>
      <main id="workspace" class="workspace"></main>
    </div>`;
  document.querySelector('#newProjectButton').addEventListener('click', () => openProjectModal());
  document.querySelector('#projectSearch').addEventListener('input', renderSidebar);
  document.querySelector('#userButton').addEventListener('click', openUserModal);
  await loadProjects();
}

async function loadProjects() {
  try {
    const result = await api('/projects');
    state.projects = result.projects || [];
    if (!state.projects.some((project) => Number(project.id) === Number(state.activeProjectId))) state.activeProjectId = state.projects[0]?.id ?? null;
    renderSidebar();
    if (state.activeProjectId) await loadProject(state.activeProjectId);
    else renderWorkspace();
  } catch (error) { showToast(error.message, 'error'); }
}

async function loadProject(projectId) {
  state.activeProjectId = Number(projectId);
  state.selected.clear();
  renderSidebar();
  try {
    const result = await api(`/projects/${state.activeProjectId}`);
    state.project = result.project;
    state.icons = result.icons || [];
    renderWorkspace();
  } catch (error) { showToast(error.message, 'error'); }
}

function renderSidebar() {
  const list = document.querySelector('#projectList');
  if (!list) return;
  const search = String(document.querySelector('#projectSearch')?.value || '').toLowerCase();
  const projects = state.projects.filter((project) => !search || `${project.name} ${project.prefix}`.toLowerCase().includes(search));
  if (!projects.length) {
    list.innerHTML = `<div class="sidebar-empty">${state.projects.length ? '没有匹配的项目' : '还没有项目<br><br>点击上方按钮创建第一个项目'}</div>`;
    return;
  }
  list.innerHTML = projects.map((project) => `
    <div class="project-item ${Number(project.id) === Number(state.activeProjectId) ? 'active' : ''}" data-project-id="${project.id}">
      <span class="project-dot"></span><span class="project-meta"><span class="project-name ellipsis">${esc(project.name)}</span><span class="project-sub"> · ${project.icon_count || 0} 个图标</span></span>
      <button class="project-more" data-project-more="${project.id}" title="项目操作">⋯</button>
    </div>`).join('');
  list.querySelectorAll('[data-project-id]').forEach((node) => node.addEventListener('click', (event) => {
    if (event.target.closest('[data-project-more]')) return;
    loadProject(node.dataset.projectId);
  }));
  list.querySelectorAll('[data-project-more]').forEach((node) => node.addEventListener('click', (event) => {
    event.stopPropagation();
    const project = state.projects.find((item) => Number(item.id) === Number(node.dataset.projectMore));
    if (project) openProjectMenu(project, event.currentTarget);
  }));
}

function renderWorkspace() {
  const workspace = document.querySelector('#workspace');
  if (!workspace) return;
  if (!state.project) {
    workspace.innerHTML = `<div class="empty-workspace"><div class="empty-inner"><div class="empty-symbol">✦</div><h2>开始管理图标</h2><p>从左侧创建或选择一个项目，然后导入 SVG 或搜索 iconfont 图标。</p><button id="emptyCreate" class="ant-btn ant-btn-primary">创建项目</button></div></div>`;
    workspace.querySelector('#emptyCreate').addEventListener('click', () => openProjectModal());
    return;
  }
  const visibleIcons = state.icons.filter((icon) => !state.iconSearch || `${icon.name} ${icon.slug}`.toLowerCase().includes(state.iconSearch.toLowerCase()));
  const latest = state.project.latestBuild;
  const projectMargin = Number(state.project.settings?.margin ?? 100);
  workspace.innerHTML = `
    <div class="workspace-header">
      <div class="workspace-title"><h2 class="ellipsis">${esc(state.project.name)}</h2><small>${esc(state.project.prefix)} · ${state.icons.length} 个图标 · 边距 ${projectMargin}${latest ? ` · 最近构建 v${latest.version}` : ''}</small></div>
      <div class="workspace-actions">
        <button id="projectSettings" class="ant-btn optional-action">⚙ 设置</button>
        <button id="buildProject" class="ant-btn ant-btn-primary">⚡ 生成 iconfont.js</button>
        <button id="downloadBuild" class="ant-btn">⇩ 下载最新</button>
        <button id="copyIconfontUrl" class="ant-btn">复制 iconfont.js URL</button>
      </div>
    </div>
    <div class="toolbar">
      <input id="iconSearch" class="ant-input search-input" value="${esc(state.iconSearch)}" placeholder="搜索项目内图标" />
      <button id="localImport" class="ant-btn">＋ 导入 SVG</button>
      <button id="remoteImport" class="ant-btn">⌘ 从 iconfont 添加</button>
      <span class="toolbar-spacer"></span>
      ${state.selected.size ? `<span class="selection-info">已选 ${state.selected.size} 个</span><button id="batchPadding" class="ant-btn ant-btn-sm">整体调整边距</button><button id="batchColor" class="ant-btn ant-btn-sm">批量去色</button><button id="batchStripPrefix" class="ant-btn ant-btn-sm">移除前缀</button><button id="batchDelete" class="ant-btn ant-btn-sm ant-btn-danger">删除</button>` : ''}
      <button id="selectAll" class="ant-btn ant-btn-sm">${state.selected.size && state.selected.size === visibleIcons.length ? '取消全选' : '全选'}</button>
    </div>
    <div class="icon-scroll"><div class="icon-grid">${visibleIcons.length ? visibleIcons.map(renderIconCard).join('') : `<div class="empty-workspace" style="grid-column:1/-1;min-height:360px"><div class="empty-inner"><div class="empty-symbol">⌁</div><h2>项目还没有图标</h2><p>可以导入本地 SVG，或者从 iconfont 搜索并添加。</p></div></div>`}</div></div>`;
  document.querySelectorAll('[data-icon-preview]').forEach((preview) => {
    const icon = state.icons.find((item) => Number(item.id) === Number(preview.dataset.iconPreview));
    if (icon) preview.innerHTML = icon.svg || '';
  });
  bindWorkspaceEvents(visibleIcons);
}

function renderIconCard(icon) {
  const selected = state.selected.has(Number(icon.id));
  const id = projectIconId(state.project, icon);
  return `<article class="icon-card ${selected ? 'selected' : ''}" data-icon-card="${icon.id}"><input class="icon-check" type="checkbox" data-icon-check="${icon.id}" ${selected ? 'checked' : ''} aria-label="选择 ${esc(icon.name)}" /><div class="icon-preview" data-icon-preview="${icon.id}"></div><div class="icon-name ellipsis" title="${esc(icon.name)}">${esc(icon.name)}</div><div class="icon-id ellipsis" title="${esc(id)}">${esc(id)}</div><div class="icon-card-actions"><button type="button" class="ant-btn ant-btn-sm" data-copy-icon="${esc(id)}" title="复制带项目此前缀的图标名">复制名称</button></div></article>`;
}

function bindWorkspaceEvents(visibleIcons) {
  document.querySelector('#projectSettings')?.addEventListener('click', () => openProjectModal(state.project));
  document.querySelector('#buildProject')?.addEventListener('click', buildCurrentProject);
  document.querySelector('#downloadBuild')?.addEventListener('click', downloadBuild);
  document.querySelector('#copyIconfontUrl')?.addEventListener('click', copyPublicIconfontUrl);
  document.querySelector('#localImport')?.addEventListener('click', () => filePicker.click());
  document.querySelector('#remoteImport')?.addEventListener('click', openIconfontDrawer);
  document.querySelector('#iconSearch')?.addEventListener('input', (event) => {
    state.iconSearch = event.target.value;
    const caret = event.target.selectionStart;
    clearTimeout(iconSearchTimer);
    iconSearchTimer = setTimeout(() => {
      renderWorkspace();
      const next = document.querySelector('#iconSearch');
      if (next) { next.focus(); next.setSelectionRange(caret, caret); }
    }, 120);
  });
  document.querySelector('#selectAll')?.addEventListener('click', () => {
    if (state.selected.size === visibleIcons.length) state.selected.clear();
    else visibleIcons.forEach((icon) => state.selected.add(Number(icon.id)));
    renderWorkspace();
  });
  document.querySelector('#batchPadding')?.addEventListener('click', openBatchPadding);
  document.querySelector('#batchColor')?.addEventListener('click', openBatchColor);
  document.querySelector('#batchStripPrefix')?.addEventListener('click', openBatchStripPrefix);
  document.querySelector('#batchDelete')?.addEventListener('click', deleteSelected);
  document.querySelectorAll('[data-icon-check]').forEach((check) => check.addEventListener('click', (event) => {
    event.stopPropagation();
    const id = Number(check.dataset.iconCheck);
    if (check.checked) state.selected.add(id); else state.selected.delete(id);
    renderWorkspace();
  }));
  document.querySelectorAll('[data-copy-icon]').forEach((button) => button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try { await copyText(button.dataset.copyIcon); showToast(`已复制 ${button.dataset.copyIcon}`, 'success'); }
    catch (error) { showToast(error.message, 'error'); }
  }));
  document.querySelectorAll('[data-icon-card]').forEach((card) => card.addEventListener('click', (event) => {
    if (event.target.closest('input,button')) return;
    const icon = state.icons.find((item) => Number(item.id) === Number(card.dataset.iconCard));
    if (icon) openEditor(icon);
  }));
}

function openProjectMenu(project) {
  const node = overlay(`<div class="modal" style="width:300px"><div class="modal-header"><h3>${esc(project.name)}</h3><button class="close-button" data-close>×</button></div><button class="ant-btn ant-btn-block" data-edit>项目设置</button><button class="ant-btn ant-btn-block" style="margin-top:8px" data-token>创建 API Token</button><button class="ant-btn ant-btn-danger ant-btn-block" style="margin-top:8px" data-delete>删除项目</button></div>`);
  node.querySelector('[data-close]').addEventListener('click', () => closeOverlay(node));
  node.querySelector('[data-edit]').addEventListener('click', () => { closeOverlay(node); openProjectModal(project); });
  node.querySelector('[data-token]').addEventListener('click', async () => {
    try {
      const result = await api(`/projects/${project.id}/tokens`, { method: 'POST', body: JSON.stringify({ name: 'IconFamily API Token' }) });
      closeOverlay(node);
      showToken(result.token);
    } catch (error) { showToast(error.message, 'error'); }
  });
  node.querySelector('[data-delete]').addEventListener('click', async () => {
    if (prompt(`请输入项目名称“${project.name}”以确认删除`) !== project.name) return;
    try { await api(`/projects/${project.id}`, { method: 'DELETE' }); closeOverlay(node); state.project = null; state.activeProjectId = null; await loadProjects(); showToast('项目已删除', 'success'); } catch (error) { showToast(error.message, 'error'); }
  });
}

function openProjectModal(project = null) {
  const isEdit = Boolean(project);
  const node = overlay(`<div class="modal"><div class="modal-header"><h3>${isEdit ? '项目设置' : '新建项目'}</h3><button class="close-button" data-close>×</button></div><form id="projectForm"><div class="form-item"><label>项目名称</label><input id="projectName" class="ant-input" value="${esc(project?.name || '')}" required /></div><div class="form-item"><label>项目此前缀</label><input id="projectPrefix" class="ant-input" value="${esc(project?.prefix || '')}" placeholder="例如 biz" required /></div><div class="form-item"><label>说明</label><textarea id="projectDescription" class="ant-textarea">${esc(project?.description || '')}</textarea></div><div class="form-row"><div class="form-item"><label>em 尺寸</label><input id="projectEm" class="ant-input" type="number" value="${Number(project?.settings?.emSize || 1024)}" min="64" max="4096" /></div><div class="form-item"><label>codepoint 起始值</label><input id="projectCodepoint" class="ant-input" value="${Number(project?.settings?.codepointStart || 0xe900)}" /></div></div><div class="form-item"><label>项目默认边距（viewport 单位）</label><input id="projectMargin" class="ant-input" type="number" step="0.1" min="0" max="512" value="${Number(project?.settings?.margin ?? 100)}" /><div class="muted" style="font-size:12px;margin-top:5px">默认 100；以后导入或从 iconfont 添加的图标会自动按此边距等比居中。</div></div><div id="projectFormNotice" class="notice error hidden"></div><div class="modal-footer"><button type="button" class="ant-btn" data-close>取消</button><button class="ant-btn ant-btn-primary" type="submit">${isEdit ? '保存' : '创建项目'}</button></div></form></div>`);
  node.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeOverlay(node)));
  node.querySelector('#projectForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const notice = node.querySelector('#projectFormNotice');
    notice.classList.add('hidden');
    const payload = { name: node.querySelector('#projectName').value.trim(), prefix: node.querySelector('#projectPrefix').value.trim(), description: node.querySelector('#projectDescription').value, emSize: Number(node.querySelector('#projectEm').value) || 1024, codepointStart: Number(node.querySelector('#projectCodepoint').value) || 0xe900, margin: Number(node.querySelector('#projectMargin').value) };
    if (!Number.isFinite(payload.margin) || payload.margin < 0 || payload.margin > 512) {
      notice.textContent = '项目默认边距必须是 0 到 512 之间的数字';
      notice.classList.remove('hidden');
      return;
    }
    try {
      if (isEdit) {
        const result = await api(`/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ name: payload.name, prefix: payload.prefix, description: payload.description, settings: { ...(project.settings || {}), emSize: payload.emSize, codepointStart: payload.codepointStart, margin: payload.margin } }) });
        state.project = result.project;
      } else {
        const result = await api('/projects', { method: 'POST', body: JSON.stringify(payload) });
        state.activeProjectId = result.project.id;
      }
      closeOverlay(node);
      await loadProjects();
      showToast(isEdit ? '项目已保存' : '项目已创建', 'success');
    } catch (error) { notice.textContent = error.message; notice.classList.remove('hidden'); }
  });
}

function showToken(token) {
  const node = overlay(`<div class="modal"><div class="modal-header"><h3>API Token</h3><button class="close-button" data-close>×</button></div><div class="notice">Token 只显示这一次，请立即复制并安全保存。</div><textarea class="ant-textarea" readonly>${esc(token)}</textarea><div class="modal-footer"><button class="ant-btn ant-btn-primary" data-copy>复制 Token</button><button class="ant-btn" data-close>关闭</button></div></div>`);
  node.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeOverlay(node)));
  node.querySelector('[data-copy]').addEventListener('click', async () => { try { await copyText(token); showToast('已复制', 'success'); } catch (error) { showToast(error.message, 'error'); } });
}

async function openUserModal() {
  if (state.user?.role !== 'admin') {
    const node = overlay(`<div class="modal"><div class="modal-header"><h3>账号</h3><button class="close-button" data-close>×</button></div><p>当前登录用户：${esc(state.user.username)}</p><button class="ant-btn ant-btn-danger" data-logout>退出登录</button></div>`);
    node.querySelector('[data-close]').addEventListener('click', () => closeOverlay(node));
    node.querySelector('[data-logout]').addEventListener('click', logout);
    return;
  }
  let users;
  try { users = (await api('/users')).users; } catch (error) { showToast(error.message, 'error'); return; }
  const node = overlay(`<div class="modal wide"><div class="modal-header"><h3>用户管理</h3><button class="close-button" data-close>×</button></div><table class="user-table"><thead><tr><th>用户名</th><th>角色</th><th>状态</th><th></th></tr></thead><tbody>${users.map((user) => `<tr><td>${esc(user.username)}</td><td><span class="tag">${user.role === 'admin' ? '管理员' : '普通用户'}</span></td><td>${user.status === 'active' ? '正常' : '已删除'}</td><td>${user.id === state.user.id ? '' : `<button class="ant-btn ant-btn-sm ant-btn-danger" data-delete-user="${user.id}">删除</button>`}</td></tr>`).join('')}</tbody></table><hr style="border:0;border-top:1px solid var(--border);margin:22px 0"><h3 style="font-size:15px">添加用户</h3><form id="addUserForm"><div class="form-row"><input id="newUsername" class="ant-input" placeholder="用户名" required><input id="newPassword" class="ant-input" type="password" placeholder="至少 6 位密码" required></div><div class="modal-footer"><button class="ant-btn ant-btn-primary" type="submit">添加</button><button type="button" class="ant-btn" data-close>关闭</button></div></form></div>`);
  node.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeOverlay(node)));
  node.querySelectorAll('[data-delete-user]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('确认删除该用户？')) return;
    try { await api(`/users/${button.dataset.deleteUser}`, { method: 'DELETE' }); closeOverlay(node); openUserModal(); showToast('用户已删除', 'success'); } catch (error) { showToast(error.message, 'error'); }
  }));
  node.querySelector('#addUserForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await api('/users', { method: 'POST', body: JSON.stringify({ username: node.querySelector('#newUsername').value, password: node.querySelector('#newPassword').value }) }); closeOverlay(node); openUserModal(); showToast('用户已添加', 'success'); } catch (error) { showToast(error.message, 'error'); }
  });
}

async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  state.user = null;
  renderLogin();
}

filePicker.addEventListener('change', async () => {
  const files = [...filePicker.files];
  filePicker.value = '';
  if (!files.length || !state.project) return;
  let lastReport = null;
  for (const file of files) {
    try {
      if (/\.zip$/i.test(file.name)) {
        const data = await toBase64(await file.arrayBuffer());
        lastReport = (await api(`/projects/${state.project.id}/icons/import-zip`, { method: 'POST', body: JSON.stringify({ fileName: file.name, data }) })).job;
      } else {
        lastReport = (await api(`/projects/${state.project.id}/icons/import`, { method: 'POST', body: JSON.stringify({ items: [{ name: file.name, svg: await file.text() }] }) })).job;
      }
    } catch (error) { showToast(`${file.name}：${error.message}`, 'error'); }
  }
  await loadProject(state.project.id);
  if (lastReport) showImportReport(lastReport);
});

async function toBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
}

function showImportReport(job) {
  const node = overlay(`<div class="modal"><div class="modal-header"><h3>导入结果</h3><button class="close-button" aria-label="关闭">×</button></div><div class="notice ${job.failed ? 'error' : 'success'}">成功 ${job.succeeded}，跳过 ${job.skipped}，失败 ${job.failed}</div><div class="muted">点击任意位置关闭</div></div>`);
  node.addEventListener('click', () => closeOverlay(node));
}

function openIconfontDrawer() {
  state.remoteResults = [];
  state.remoteSelected.clear();
  state.remotePage = 1;
  const node = overlay(`<div class="drawer"><div class="drawer-header"><h3>从 iconfont 添加图标</h3><button class="close-button" data-close>×</button></div><div id="remoteNotice" class="notice hidden"></div><div class="remote-toolbar"><input id="remoteQuery" class="ant-input" placeholder="搜索 iconfont 图标，例如 google" /><select id="remoteSort" class="ant-select" style="width:145px"><option value="updated_at">最近更新</option><option value="download">下载最多</option><option value="name">名称</option></select><button id="remoteSearch" class="ant-btn ant-btn-primary">搜索</button></div><div class="remote-toolbar"><select id="remoteFills" class="ant-select" style="width:145px"><option value="">全部颜色类型</option><option value="0">单色</option><option value="1">多色</option></select><span class="muted">搜索结果来自 iconfont.cn</span><span class="toolbar-spacer"></span><button id="remoteAdd" class="ant-btn ant-btn-primary" disabled>添加选中（0）</button></div><div id="remoteResults" class="remote-grid"></div><div id="remotePagination" class="pagination"></div></div>`);
  node.querySelector('[data-close]').addEventListener('click', () => closeOverlay(node));
  node.querySelector('#remoteSearch').addEventListener('click', () => performRemoteSearch(node, 1));
  node.querySelector('#remoteQuery').addEventListener('keydown', (event) => { if (event.key === 'Enter') performRemoteSearch(node, 1); });
  node.querySelector('#remoteAdd').addEventListener('click', () => importRemoteSelected(node));
  node.querySelector('#remoteResults').innerHTML = `<div class="muted" style="grid-column:1/-1;text-align:center;padding:50px 10px">输入关键词搜索 iconfont 图标</div>`;
  node.querySelector('#remoteQuery').focus();
}

async function performRemoteSearch(node, page = 1) {
  const query = node.querySelector('#remoteQuery').value.trim();
  if (!query) return;
  const resultBox = node.querySelector('#remoteResults');
  const notice = node.querySelector('#remoteNotice');
  resultBox.innerHTML = `<div class="muted" style="grid-column:1/-1;text-align:center;padding:50px 10px">搜索中…</div>`;
  notice.classList.add('hidden');
  try {
    const result = await api('/iconfont/search', { method: 'POST', body: JSON.stringify({ q: query, sortType: node.querySelector('#remoteSort').value, page, pageSize: 54, sType: '', fromCollection: '-1', fills: node.querySelector('#remoteFills').value, ctoken: null }) });
    state.remoteQuery = query;
    state.remoteResults = result.items || [];
    state.remoteTotal = result.total || state.remoteResults.length;
    state.remotePage = page;
    renderRemoteResults(node);
    resultBox.scrollTop = 0;
  } catch (error) {
    notice.textContent = error.message;
    notice.classList.remove('hidden');
    resultBox.innerHTML = `<div class="muted" style="grid-column:1/-1;text-align:center;padding:50px 10px">暂时无法获取搜索结果</div>`;
  }
}

function remotePreview(item) {
  if (item.svg) {
    if (/<svg\b/i.test(item.svg)) return item.svg;
    if (/<symbol\b/i.test(item.svg)) return `<svg viewBox="0 0 1024 1024">${item.svg}</svg>`;
    if (/^\s*M[\s\d.,-]+/i.test(item.svg)) return `<svg viewBox="0 0 1024 1024"><path d="${esc(item.svg)}"/></svg>`;
  }
  return `<span class="muted" style="font-size:28px">✦</span>`;
}

function renderRemoteResults(node) {
  const resultBox = node.querySelector('#remoteResults');
  if (!state.remoteResults.length) resultBox.innerHTML = `<div class="muted" style="grid-column:1/-1;text-align:center;padding:50px 10px">没有找到图标</div>`;
  else resultBox.innerHTML = state.remoteResults.map((item) => `<div class="remote-card ${state.remoteSelected.has(item.remoteId) ? 'selected' : ''}" data-remote-id="${esc(item.remoteId)}"><input type="checkbox" ${state.remoteSelected.has(item.remoteId) ? 'checked' : ''}><div class="icon-preview" data-remote-preview="${esc(item.remoteId)}"></div><div class="remote-card-name ellipsis" title="${esc(item.name)}">${esc(item.name)}</div><div class="remote-card-meta ellipsis">${esc(item.fontClass || item.unicode || item.remoteId)}</div></div>`).join('');
  resultBox.querySelectorAll('[data-remote-preview]').forEach((preview) => {
    const item = state.remoteResults.find((candidate) => String(candidate.remoteId) === String(preview.dataset.remotePreview));
    if (item) {
      preview.innerHTML = remotePreview(item);
      preview.querySelector('svg')?.removeAttribute('style');
    }
  });
  resultBox.querySelectorAll('[data-remote-id]').forEach((card) => card.addEventListener('click', () => {
    const id = card.dataset.remoteId;
    const item = state.remoteResults.find((candidate) => String(candidate.remoteId) === id);
    if (!item) return;
    if (state.remoteSelected.has(id)) state.remoteSelected.delete(id); else state.remoteSelected.set(id, item);
    renderRemoteResults(node);
  }));
  const add = node.querySelector('#remoteAdd');
  add.disabled = !state.remoteSelected.size;
  add.textContent = `添加选中（${state.remoteSelected.size}）`;
  const pages = Math.max(1, Math.ceil(state.remoteTotal / 54));
  node.querySelector('#remotePagination').innerHTML = `<button class="ant-btn ant-btn-sm" ${state.remotePage <= 1 ? 'disabled' : ''} data-remote-prev>上一页</button><span>${state.remotePage} / ${pages}</span><button class="ant-btn ant-btn-sm" ${state.remotePage >= pages ? 'disabled' : ''} data-remote-next>下一页</button>`;
  node.querySelector('[data-remote-prev]').addEventListener('click', () => performRemoteSearch(node, state.remotePage - 1));
  node.querySelector('[data-remote-next]').addEventListener('click', () => performRemoteSearch(node, state.remotePage + 1));
}

async function importRemoteSelected(node) {
  if (!state.remoteSelected.size || !state.project) return;
  const button = node.querySelector('#remoteAdd');
  button.disabled = true;
  try {
    const result = await api(`/projects/${state.project.id}/icons/import-iconfont`, { method: 'POST', body: JSON.stringify({ items: [...state.remoteSelected.values()] }) });
    closeOverlay(node);
    await loadProject(state.project.id);
    showImportReport(result.job);
  } catch (error) { showToast(error.message, 'error'); button.disabled = false; }
}

function openBatchPadding() {
  const defaultMargin = Number(state.project?.settings?.margin ?? 100);
  const node = overlay(`<div class="modal"><div class="modal-header"><h3>整体调整边距</h3><button class="close-button" data-close>×</button></div><p class="muted">边距是项目属性。这里只需输入一个值（viewport 单位）；当前项目默认值为 ${defaultMargin}。应用后会更新项目默认边距，并让选中图标的最长边保持该边距、等比缩放且居中。以后导入或从 iconfont 添加的图标也会自动使用此值。</p><div class="form-item"><label for="transformMargin">项目边距</label><input id="transformMargin" class="ant-input" type="number" step="0.1" min="0" max="512" value="${defaultMargin}"><div class="muted" style="font-size:12px;margin-top:5px">默认 100；数值越大，图标整体越小。</div></div><div id="batchPaddingNotice" class="notice error hidden"></div><div class="modal-footer"><button class="ant-btn" data-close>取消</button><button class="ant-btn ant-btn-primary" data-submit>应用</button></div></div>`);
  node.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeOverlay(node)));
  node.querySelector('[data-submit]').addEventListener('click', async () => {
    const notice = node.querySelector('#batchPaddingNotice');
    notice.classList.add('hidden');
    const margin = Number(node.querySelector('#transformMargin').value);
    if (!Number.isFinite(margin) || margin < 0 || margin > 512) {
      notice.textContent = '边距必须是 0 到 512 之间的数字';
      notice.classList.remove('hidden');
      return;
    }
    const button = node.querySelector('[data-submit]');
    button.disabled = true;
    try { await api(`/projects/${state.project.id}/icons/batch`, { method: 'POST', body: JSON.stringify({ iconIds: [...state.selected], operation: { type: 'fitMargin', margin } }) }); closeOverlay(node); state.selected.clear(); await loadProject(state.project.id); showToast('图标整体边距已更新', 'success'); } catch (error) { showToast(error.message, 'error'); button.disabled = false; }
  });
}

function inferBatchPrefix() {
  const selectedIcons = state.icons.filter((icon) => state.selected.has(Number(icon.id)));
  const heads = selectedIcons
    .map((icon) => String(icon.name || icon.slug || '').trim().split(/[-_\s/:.]+/)[0])
    .filter(Boolean);
  if (!heads.length) return '';
  const first = heads[0].toLowerCase();
  return heads.every((head) => head.toLowerCase() === first) ? heads[0] : '';
}

function openBatchStripPrefix() {
  const suggested = inferBatchPrefix();
  const node = overlay(`<div class="modal"><div class="modal-header"><h3>批量移除前缀</h3><button class="close-button" data-close>×</button></div><p class="muted">将从已选择的图标名称和 slug 开头移除指定前缀，并同时去掉后面的连接符。例如输入 <code>grace</code> 或 <code>grace-</code>，<code>grace-disk</code> 会变成 <code>disk</code>。</p><div class="form-item"><label for="stripPrefix">要移除的前缀</label><input id="stripPrefix" class="ant-input" value="${esc(suggested)}" placeholder="例如 grace 或 grace-"></div><div id="stripPrefixNotice" class="notice error hidden"></div><div class="modal-footer"><button class="ant-btn" data-close>取消</button><button class="ant-btn ant-btn-primary" data-submit>应用</button></div></div>`);
  node.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeOverlay(node)));
  node.querySelector('[data-submit]').addEventListener('click', async () => {
    const notice = node.querySelector('#stripPrefixNotice');
    notice.classList.add('hidden');
    const prefix = node.querySelector('#stripPrefix').value.trim();
    if (!prefix) {
      notice.textContent = '请输入要移除的前缀';
      notice.classList.remove('hidden');
      return;
    }
    const button = node.querySelector('[data-submit]');
    button.disabled = true;
    try {
      const result = await api(`/projects/${state.project.id}/icons/batch`, { method: 'POST', body: JSON.stringify({ iconIds: [...state.selected], operation: { type: 'stripPrefix', prefix } }) });
      closeOverlay(node);
      state.selected.clear();
      await loadProject(state.project.id);
      showToast(`已移除前缀，更新 ${result.changed ?? 0} 个图标`, 'success');
    } catch (error) {
      notice.textContent = error.message;
      notice.classList.remove('hidden');
      button.disabled = false;
    }
  });
  node.querySelector('#stripPrefix').focus();
}

function openBatchColor() {
  const node = overlay(`<div class="modal"><div class="modal-header"><h3>批量去色</h3><button class="close-button" data-close>×</button></div><p class="muted">将对已选择的 ${state.selected.size} 个图标应用颜色模式。</p><div class="form-item"><label>颜色模式</label><select id="colorMode" class="ant-select"><option value="currentColor">currentColor（推荐）</option><option value="custom">统一自定义颜色</option></select></div><div class="form-item hidden" id="customColorRow"><label>颜色</label><input id="customColor" class="ant-input" value="#1677ff" pattern="^#[0-9a-fA-F]{3,8}$"></div><div class="modal-footer"><button class="ant-btn" data-close>取消</button><button class="ant-btn ant-btn-primary" data-submit>应用</button></div></div>`);
  node.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeOverlay(node)));
  node.querySelector('#colorMode').addEventListener('change', (event) => node.querySelector('#customColorRow').classList.toggle('hidden', event.target.value !== 'custom'));
  node.querySelector('[data-submit]').addEventListener('click', async () => {
    try { await api(`/projects/${state.project.id}/icons/batch`, { method: 'POST', body: JSON.stringify({ iconIds: [...state.selected], operation: { type: 'color', mode: node.querySelector('#colorMode').value, color: node.querySelector('#customColor').value } }) }); closeOverlay(node); state.selected.clear(); await loadProject(state.project.id); showToast('颜色已批量更新', 'success'); } catch (error) { showToast(error.message, 'error'); }
  });
}

async function deleteSelected() {
  if (!state.selected.size || !confirm(`确认删除选中的 ${state.selected.size} 个图标？`)) return;
  try { await api(`/projects/${state.project.id}/icons/batch`, { method: 'POST', body: JSON.stringify({ iconIds: [...state.selected], operation: { type: 'delete' } }) }); state.selected.clear(); await loadProject(state.project.id); showToast('图标已删除', 'success'); } catch (error) { showToast(error.message, 'error'); }
}

async function buildCurrentProject() {
  const button = document.querySelector('#buildProject');
  if (!button) return;
  button.disabled = true;
  button.textContent = '构建中…';
  try { const result = await api(`/projects/${state.project.id}/build`, { method: 'POST', body: '{}' }); state.project.latestBuild = result.build; await loadProjects(); renderWorkspace(); showToast(`已生成 iconfont.js v${result.build.version}`, 'success'); } catch (error) { showToast(error.message, 'error'); } finally { if (document.querySelector('#buildProject')) { document.querySelector('#buildProject').disabled = false; document.querySelector('#buildProject').textContent = '⚡ 生成 iconfont.js'; } }
}

async function downloadBuild() {
  const button = document.querySelector('#downloadBuild');
  if (button) { button.disabled = true; button.textContent = '生成中…'; }
  try {
    const response = await fetch(`/api/projects/${state.project.id}/iconfont.js`);
    if (!response.ok) throw new Error('生成或下载 iconfont.js 失败');
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${state.project.prefix}-iconfont.js`;
    link.click();
    URL.revokeObjectURL(link.href);
    await loadProjects();
  } catch (error) { showToast(error.message, 'error'); }
  finally {
    const activeButton = document.querySelector('#downloadBuild');
    if (activeButton) { activeButton.disabled = false; activeButton.textContent = '⇩ 下载最新'; }
  }
}

async function copyPublicIconfontUrl() {
  if (!state.project) return;
  const url = new URL(`/api/projects/${state.project.id}/iconfont.js`, window.location.origin).toString();
  try {
    await copyText(url);
    showToast('iconfont.js URL 已复制', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function editorSnapshot(editor) {
  return { scale: editor.scale, tx: editor.tx, ty: editor.ty, rotation: editor.rotation, flipX: editor.flipX, flipY: editor.flipY, colorMode: editor.colorMode, name: editor.name, slug: editor.slug, codepoint: editor.codepoint };
}

function restoreEditorSnapshot(editor, snapshot) {
  Object.assign(editor, snapshot);
}

function pushEditorHistory(editor) {
  editor.history.push(editorSnapshot(editor));
  if (editor.history.length > 80) editor.history.shift();
  editor.future = [];
}

function editorTransformedSvg(editor) {
  const source = editor.baseSvg || '<svg viewBox="0 0 1024 1024"></svg>';
  const match = source.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg\s*>/i);
  if (!match) return source;
  // Keep all icon transforms anchored to the center of the 1024 x 1024
  // viewport.  A bare `scale(...)` uses (0, 0), which makes the artwork
  // appear to grow/shrink from the upper-left corner.  Nesting the center
  // translation makes scale/rotation/mirror operations preserve the visual
  // center; the user translation is applied afterwards.
  const transform = `translate(${Number(editor.tx.toFixed(3))} ${Number(editor.ty.toFixed(3))}) translate(512 512) rotate(${Number(editor.rotation.toFixed(3))}) scale(${Number((editor.scale * editor.flipX).toFixed(4))} ${Number((editor.scale * editor.flipY).toFixed(4))}) translate(-512 -512)`;
  const colorBody = editor.colorMode === 'currentColor' ? match[2].replace(/\s(fill|stroke)\s*=\s*(["'])((?!none\b)[^"']+)\2/gi, ' $1="currentColor"') : match[2];
  return `<svg viewBox="0 0 1024 1024"><g transform="${transform}">${colorBody}</g></svg>`;
}

function openEditor(icon) {
  const editor = {
    iconId: Number(icon.id),
    baseSvg: icon.svg,
    name: icon.name,
    slug: icon.slug,
    codepoint: icon.codepoint ?? '',
    colorMode: icon.color_mode || 'preserve',
    scale: 1,
    tx: 0,
    ty: 0,
    rotation: 0,
    flipX: 1,
    flipY: 1,
    zoom: 1,
    viewportX: 0,
    viewportY: 0,
    grid: true,
    activeTool: 'select',
    spaceDown: false,
    dirty: false,
    history: [],
    future: [],
  };
  state.editor = editor;
  const node = document.createElement('div');
  node.className = 'editor-overlay';
  const verticalLines = Array.from({ length: 9 }, (_, index) => `<i class="grid-v" style="left:${(index + 1) * 10}%"></i>`).join('');
  const horizontalLines = Array.from({ length: 9 }, (_, index) => `<i class="grid-h" style="top:${(index + 1) * 10}%"></i>`).join('');
  node.innerHTML = `<div class="editor-modal"><div class="editor-header"><div class="editor-title"><div class="ellipsis">${esc(icon.name)}</div><small class="muted">${esc(projectIconId(state.project, icon))}</small></div><div class="editor-header-actions"><button class="ant-btn" data-editor-undo>↶</button><button class="ant-btn" data-editor-redo>↷</button><button class="ant-btn" data-editor-reset>重置本次变换</button><button class="ant-btn" data-editor-close>关闭</button><button class="ant-btn ant-btn-primary" data-editor-save>保存并关闭</button></div></div><div class="editor-layout"><div class="editor-tools"><button class="editor-tool active" data-editor-tool="select" title="选择">↖</button><button class="editor-tool" data-editor-tool="pan" title="平移画布">✋</button><button class="editor-tool" data-editor-tool="grid" title="网格">▦</button><button class="editor-tool" data-editor-tool="fit" title="适应">⌗</button><button class="editor-tool" data-editor-tool="zoom-in" title="放大工作区">＋</button><button class="editor-tool" data-editor-tool="zoom-out" title="缩小工作区">−</button><button class="editor-tool" data-editor-tool="flip-x" title="水平镜像">↔</button><button class="editor-tool" data-editor-tool="flip-y" title="垂直镜像">↕</button></div><div id="editorCanvasWrap" class="editor-canvas-wrap"><div id="editorStage" class="editor-stage"><div id="editorCanvas" class="editor-canvas"></div><div id="editorGrid" class="editor-grid-lines">${verticalLines}${horizontalLines}</div></div></div><aside class="editor-inspector"><h4>图标属性</h4><div class="form-item"><label>名称</label><input id="editorName" class="ant-input" value="${esc(editor.name)}"></div><div class="form-item"><label>Slug / ID 后缀</label><input id="editorSlug" class="ant-input" value="${esc(editor.slug)}"></div><div class="form-item"><label>Unicode codepoint</label><input id="editorCodepoint" class="ant-input" value="${esc(editor.codepoint)}"></div><div class="form-item"><label>颜色模式</label><select id="editorColor" class="ant-select"><option value="preserve">保留原色</option><option value="currentColor">currentColor</option></select></div><h4 style="margin-top:22px">整体变换（相对 1024 × 1024 viewport）</h4><div class="editor-adjust-group"><div class="editor-adjust-row"><span>缩放</span><div class="editor-adjust-buttons"><button type="button" class="ant-btn ant-btn-sm" data-editor-adjust="scale" data-editor-delta="-1">缩小</button><button type="button" class="ant-btn ant-btn-sm" data-editor-adjust="scale" data-editor-delta="1">放大</button></div></div><div class="editor-adjust-row"><span>旋转</span><div class="editor-adjust-buttons"><button type="button" class="ant-btn ant-btn-sm" data-editor-adjust="rotation" data-editor-delta="-15">逆时针</button><button type="button" class="ant-btn ant-btn-sm" data-editor-adjust="rotation" data-editor-delta="15">顺时针</button></div></div><div class="editor-adjust-row"><span>水平</span><div class="editor-adjust-buttons"><button type="button" class="ant-btn ant-btn-sm" data-editor-adjust="tx" data-editor-delta="-1">左移</button><button type="button" class="ant-btn ant-btn-sm" data-editor-adjust="tx" data-editor-delta="1">右移</button></div></div><div class="editor-adjust-row"><span>垂直</span><div class="editor-adjust-buttons"><button type="button" class="ant-btn ant-btn-sm" data-editor-adjust="ty" data-editor-delta="-1">上移</button><button type="button" class="ant-btn ant-btn-sm" data-editor-adjust="ty" data-editor-delta="1">下移</button></div></div></div><p class="muted" style="font-size:12px;line-height:1.6">默认：缩放 0.01、平移 1；按住 Ctrl 分别为 0.05、10，按住 Shift 分别为 0.1、100。数值不会显示，结果会直接写入 SVG。</p></aside></div><div class="editor-status" id="editorStatus">未修改 · viewport 1024 × 1024 · 滚轮缩放整个工作区 · 9 × 9 网格线</div></div>`;
  document.body.append(node);
  const canvas = node.querySelector('#editorCanvas');
  const wrap = node.querySelector('#editorCanvasWrap');
  const stage = node.querySelector('#editorStage');
  const grid = node.querySelector('#editorGrid');
  const setDirty = () => { editor.dirty = true; node.querySelector('#editorStatus').textContent = '有未保存修改 · Ctrl/Cmd+S 保存并关闭 · 滚轮缩放整个工作区'; };
  const updateCanvas = () => {
    canvas.innerHTML = editorTransformedSvg(editor);
    stage.style.transform = `translate(${editor.viewportX}px, ${editor.viewportY}px) scale(${editor.zoom})`;
    stage.style.transformOrigin = 'center center';
    grid.classList.toggle('hidden', !editor.grid);
    node.querySelector('#editorColor').value = editor.colorMode;
    node.querySelector('#editorName').value = editor.name;
    node.querySelector('#editorSlug').value = editor.slug;
    node.querySelector('#editorCodepoint').value = editor.codepoint;
  };
  const mutate = (fn) => { pushEditorHistory(editor); fn(); setDirty(); updateCanvas(); };
  const viewMutate = (fn) => { fn(); updateCanvas(); };
  let editorKeys;
  const editorKeyUp = (event) => { if (event.code === 'Space') editor.spaceDown = false; };
  const disposeEditor = () => {
    window.removeEventListener('keydown', editorKeys);
    window.removeEventListener('keyup', editorKeyUp);
    node.remove();
    state.editor = null;
  };
  // Closing the editor is always immediate.  The explicit save action remains
  // available when changes should be persisted; mask/close buttons simply
  // dismiss the workspace without an additional confirmation dialog.
  const close = () => { disposeEditor(); };
  node.addEventListener('click', (event) => { if (event.target === node) disposeEditor(); });
  node.querySelector('[data-editor-close]').addEventListener('click', close);
  node.querySelector('[data-editor-save]').addEventListener('click', async () => {
    const saveButton = node.querySelector('[data-editor-save]');
    saveButton.disabled = true;
    try {
      const result = await api(`/projects/${state.project.id}/icons/${editor.iconId}`, { method: 'PATCH', body: JSON.stringify({ name: editor.name, slug: editor.slug, codepoint: editor.codepoint, colorMode: editor.colorMode, svg: editorTransformedSvg(editor) }) });
      const index = state.icons.findIndex((candidate) => Number(candidate.id) === editor.iconId);
      if (index >= 0) state.icons[index] = result.icon;
      editor.dirty = false;
      disposeEditor();
      renderWorkspace();
      showToast('图标已保存', 'success');
    } catch (error) { showToast(error.message, 'error'); saveButton.disabled = false; }
  });
  node.querySelector('[data-editor-reset]').addEventListener('click', () => mutate(() => { editor.scale = 1; editor.tx = 0; editor.ty = 0; editor.rotation = 0; editor.flipX = 1; editor.flipY = 1; }));
  node.querySelector('[data-editor-undo]').addEventListener('click', () => { const snapshot = editor.history.pop(); if (!snapshot) return; editor.future.push(editorSnapshot(editor)); restoreEditorSnapshot(editor, snapshot); setDirty(); updateCanvas(); });
  node.querySelector('[data-editor-redo]').addEventListener('click', () => { const snapshot = editor.future.pop(); if (!snapshot) return; editor.history.push(editorSnapshot(editor)); restoreEditorSnapshot(editor, snapshot); setDirty(); updateCanvas(); });
  node.querySelectorAll('[data-editor-tool]').forEach((button) => button.addEventListener('click', () => {
    const tool = button.dataset.editorTool;
    if (tool === 'grid') { editor.grid = !editor.grid; updateCanvas(); return; }
    if (tool === 'fit') viewMutate(() => { editor.zoom = 1; editor.viewportX = 0; editor.viewportY = 0; });
    if (tool === 'zoom-in') viewMutate(() => { editor.zoom = Math.min(4, editor.zoom + .1); });
    if (tool === 'zoom-out') viewMutate(() => { editor.zoom = Math.max(.2, editor.zoom - .1); });
    if (tool === 'flip-x') mutate(() => { editor.flipX *= -1; });
    if (tool === 'flip-y') mutate(() => { editor.flipY *= -1; });
    if (tool === 'select' || tool === 'pan') editor.activeTool = tool;
    node.querySelectorAll('[data-editor-tool]').forEach((item) => item.classList.toggle('active', item === button));
  }));
  node.querySelectorAll('[data-editor-adjust]').forEach((button) => button.addEventListener('click', (event) => mutate(() => {
    const key = button.dataset.editorAdjust;
    const direction = Number(button.dataset.editorDelta) || 0;
    const step = key === 'scale'
      ? (event.shiftKey ? 0.1 : event.ctrlKey ? 0.05 : 0.01)
      : (key === 'tx' || key === 'ty')
        ? (event.shiftKey ? 100 : event.ctrlKey ? 10 : 1)
        : 1;
    const delta = direction * step;
    if (key === 'scale') editor.scale = Math.max(0.01, Math.min(8, editor.scale + delta));
    else if (key === 'rotation') editor.rotation += delta;
    else if (key === 'tx') editor.tx += delta;
    else if (key === 'ty') editor.ty += delta;
  })));
  node.querySelector('#editorName').addEventListener('change', (event) => mutate(() => { editor.name = event.target.value.trim() || 'icon'; }));
  node.querySelector('#editorSlug').addEventListener('change', (event) => mutate(() => { editor.slug = event.target.value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'icon'; }));
  node.querySelector('#editorCodepoint').addEventListener('change', (event) => mutate(() => { editor.codepoint = event.target.value.trim(); }));
  node.querySelector('#editorColor').addEventListener('change', (event) => mutate(() => { editor.colorMode = event.target.value; }));
  let dragging = false; let lastX = 0; let lastY = 0;
  wrap.addEventListener('wheel', (event) => { event.preventDefault(); viewMutate(() => { editor.zoom = Math.max(.2, Math.min(4, editor.zoom + (event.deltaY < 0 ? .08 : -.08))); }); }, { passive: false });
  wrap.addEventListener('pointerdown', (event) => { if (event.button !== 0 || (editor.activeTool !== 'pan' && !editor.spaceDown)) return; dragging = true; lastX = event.clientX; lastY = event.clientY; wrap.setPointerCapture(event.pointerId); });
  wrap.addEventListener('pointermove', (event) => { if (!dragging) return; editor.viewportX += event.clientX - lastX; editor.viewportY += event.clientY - lastY; lastX = event.clientX; lastY = event.clientY; updateCanvas(); });
  wrap.addEventListener('pointerup', () => { dragging = false; });
  editorKeys = (event) => { if (!document.body.contains(node)) { disposeEditor(); return; } if (event.code === 'Space') { editor.spaceDown = true; event.preventDefault(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); node.querySelector('[data-editor-save]').click(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); node.querySelector('[data-editor-undo]').click(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); node.querySelector('[data-editor-redo]').click(); } if (event.key === 'Escape') close(); };
  window.addEventListener('keydown', editorKeys);
  window.addEventListener('keyup', editorKeyUp);
  updateCanvas();
}

async function init() {
  try { state.user = (await api('/auth/me')).user; await renderApp(); } catch { renderLogin(); }
}

init();
