import { sanitizeSvg } from './core.mjs';

// Each user's mutations are serialized while a checkout writes multiple projects.
// GET always reads the stored SVG snapshot; it never contacts iconfont.
export function createCartHandler({
  store,
  requireUser,
  readBody,
  json,
  errorResponse,
  resolveRemoteSvg,
  importItems,
  canAccessProject,
}) {
  const busyUsers = new Set();
  return async function handleCart(req, res, parts, method) {
    const user = requireUser(req, res);
    if (!user) return;
    if (parts.length === 1 && method === 'GET')
      return json(res, 200, { items: store.listCart(user.id) });
    if (busyUsers.has(user.id)) return errorResponse(res, 409, '购物车正在处理，请稍后重试');
    busyUsers.add(user.id);
    try {
      if (parts.length === 1 && method === 'POST') {
        const { item } = await readBody(req);
        if (
          !item ||
          typeof item.remoteId !== 'string' ||
          !item.remoteId.trim() ||
          item.remoteId.length > 200
        )
          return errorResponse(res, 400, '图标 ID 无效');
        const existing = store.listCart(user.id).find((row) => row.remoteId === item.remoteId);
        if (existing) return json(res, 200, { item: existing });
        const remote = await resolveRemoteSvg(item);
        if (remote.svg.length > 2 * 1024 * 1024)
          return errorResponse(res, 400, 'SVG 文件为空或超过 2 MB 限制');
        const svg = sanitizeSvg(remote.svg).svg;
        const saved = store.addCartItem(user.id, {
          remoteId: item.remoteId,
          name: String(item.name || item.remoteId).slice(0, 200),
          slug: String(item.slug || item.fontClass || item.name || item.remoteId).slice(0, 200),
          fontClass: String(item.fontClass || '').slice(0, 200),
          unicode: item.unicode == null ? null : String(item.unicode).slice(0, 40),
          svg,
          sourceUrl: remote.sourceUrl,
          sourceMeta: { provider: 'iconfont', remoteId: item.remoteId },
        });
        return json(res, 201, { item: saved });
      }
      if ((parts[1] === 'remove' || parts[1] === 'checkout') && method === 'POST') {
        const body = await readBody(req);
        if (
          !Array.isArray(body.itemIds) ||
          !body.itemIds.length ||
          body.itemIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
        )
          return errorResponse(res, 400, '请选择购物车图标');
        const ids = [...new Set(body.itemIds)];
        const cart = store.listCart(user.id);
        const items = ids.map((id) => cart.find((item) => item.id === id));
        if (items.some((item) => !item))
          return errorResponse(res, 409, '购物车已更新，请刷新后重试');
        if (parts[1] === 'remove') {
          store.removeCartItems(user.id, ids);
          return json(res, 200, { items: store.listCart(user.id) });
        }
        if (
          !Array.isArray(body.projectIds) ||
          !body.projectIds.length ||
          body.projectIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
        )
          return errorResponse(res, 400, '请选择目标项目');
        const projects = [...new Set(body.projectIds)].map((id) => store.projectById(id));
        // Validate every destination before importing into any project.
        if (projects.some((project) => !project || !canAccessProject({ user }, project, true)))
          return errorResponse(res, 403, '没有权限访问目标项目');
        const remaining = new Set();
        const results = [];
        const failures = [];
        for (const project of projects) {
          try {
            const job = await importItems(project, items, 'iconfont');
            results.push({
              projectId: project.id,
              name: project.name,
              succeeded: job.succeeded,
              skipped: job.skipped,
              failed: job.failed,
            });
            items.forEach((item, index) => {
              const entry = job.report[index];
              if (!entry || entry.status === 'failed') {
                remaining.add(item.id);
                failures.push({
                  itemId: item.id,
                  name: item.name,
                  projectId: project.id,
                  projectName: project.name,
                  reason: entry?.reason || '导入失败',
                });
              }
            });
          } catch (error) {
            results.push({
              projectId: project.id,
              name: project.name,
              succeeded: 0,
              skipped: 0,
              failed: items.length,
            });
            for (const item of items) {
              remaining.add(item.id);
              failures.push({
                itemId: item.id,
                name: item.name,
                projectId: project.id,
                projectName: project.name,
                reason: error.message,
              });
            }
          }
        }
        const removedIds = ids.filter((id) => !remaining.has(id));
        if (removedIds.length) store.removeCartItems(user.id, removedIds);
        return json(res, 200, { items: store.listCart(user.id), removedIds, results, failures });
      }
      return errorResponse(res, 404, '接口不存在');
    } catch (error) {
      return errorResponse(res, 400, error.message);
    } finally {
      busyUsers.delete(user.id);
    }
  };
}
