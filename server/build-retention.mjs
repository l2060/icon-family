import fs from 'node:fs';
import path from 'node:path';

export const BUILD_HISTORY_LIMIT = 10;

export function pruneBuildHistory(store, artifactsRoot, projectId) {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new Error('Invalid project ID');
  const builds = store.listBuilds(projectId, null);
  const published = store.latestBuild(projectId);
  const keep = builds.slice(0, BUILD_HISTORY_LIMIT);
  // Keep the last working download even after repeated failed builds.
  if (published && !keep.some((build) => build.id === published.id)) {
    keep.pop();
    keep.push(published);
  }
  const ids = new Set(keep.map((build) => build.id));
  const filenames = new Set(keep.map((build) => `iconfont-v${build.version}.js`));
  const directory = path.join(path.resolve(artifactsRoot), String(projectId));
  try {
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Artifact directory must not be a symlink');
    for (const file of fs.readdirSync(directory, { withFileTypes: true })) {
      if (file.isFile() && /^iconfont-v\d+\.js$/.test(file.name) && !filenames.has(file.name)) {
        fs.unlinkSync(path.join(directory, file.name));
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  store.transaction(() => {
    for (const build of builds) if (!ids.has(build.id)) store.deleteBuild(projectId, build.id);
  });
}
