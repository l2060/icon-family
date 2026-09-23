import { randomUUID } from 'node:crypto';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export function folderDescendants(folders, id) {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) if (ids.has(folder.parentId) && !ids.has(folder.id)) { ids.add(folder.id); changed = true; }
  }
  return ids;
}

export function manageFolders(store, projectId, method, id, body) {
  let result;
  store.transaction(() => {
    const project = store.projectById(projectId);
    const folders = project.settings.folders || [];
    const current = id ? folders.find(folder => folder.id === id) : undefined;
    if (id && !current) fail('目录已删除或不存在', 404);
    if (method === 'DELETE') {
      const removed = folderDescendants(folders, id);
      const icons = store.listIcons(projectId).filter(icon => removed.has(icon.folder_id));
      for (const icon of icons) store.softDeleteIcon(icon.id);
      store.setFolders(projectId, folders.filter(folder => !removed.has(folder.id)));
      result = { removedFolderIds: [...removed], removedIconIds: icons.map(icon => icon.id) };
      return;
    }
    const name = String(body.name ?? current?.name ?? '').trim();
    const parentId = body.parentId === undefined ? current?.parentId ?? null : body.parentId;
    if (!name || name.length > 80 || /[\u0000-\u001f/\\]/.test(name)) fail('目录名称需为 1–80 个字符，不能包含斜线或控制字符');
    if (parentId !== null && !folders.some(folder => folder.id === parentId)) fail('目标目录不存在', 404);
    if (id && folderDescendants(folders, id).has(parentId)) fail('不能移动到自身或下级目录');
    if (folders.some(folder => folder.id !== id && folder.parentId === parentId && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) fail('同级目录名称已存在', 409);
    const folder = { id: id || randomUUID(), parentId, name };
    store.setFolders(projectId, id ? folders.map(item => item.id === id ? folder : item) : [...folders, folder]);
    result = { folder };
  });
  return { ...result, project: store.projectById(projectId) };
}

export function moveFolderIcons(store, projectId, body) {
  let ids;
  const folderId = body.folderId ?? null;
  store.transaction(() => {
    const project = store.projectById(projectId);
    if (folderId !== null && !(project.settings.folders || []).some(folder => folder.id === folderId)) fail('目标目录不存在', 404);
    if (!Array.isArray(body.iconIds) || !body.iconIds.length || body.iconIds.some(id => !Number.isSafeInteger(id))) fail('请选择有效图标');
    ids = [...new Set(body.iconIds)];
    for (const id of ids) {
      const icon = store.iconById(id);
      if (!icon || Number(icon.project_id) !== Number(projectId) || icon.status !== 'active') fail('图标不存在或不属于当前项目', 404);
    }
    store.moveIcons(projectId, ids, folderId);
  });
  return { iconIds: ids, folderId };
}
