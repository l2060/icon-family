import type { ProjectFolder } from '../../types';
export interface FolderNode {
  key: string;
  value: string;
  title: string;
  children: FolderNode[];
}
export function folderNodes(
  folders: ProjectFolder[],
  parentId: string | null = null,
): FolderNode[] {
  return folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((folder) => ({
      key: folder.id,
      value: folder.id,
      title: folder.name,
      children: folderNodes(folders, folder.id),
    }));
}
export function folderPath(folders: ProjectFolder[], id?: string): ProjectFolder[] {
  const path: ProjectFolder[] = [],
    seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const folder = folders.find((folder) => folder.id === id);
    if (!folder) break;
    path.unshift(folder);
    id = folder.parentId ?? undefined;
  }
  return path;
}
export function descendantIds(folders: ProjectFolder[], id: string) {
  return new Set(
    folders
      .filter((folder) => folderPath(folders, folder.id).some((parent) => parent.id === id))
      .map((folder) => folder.id),
  );
}
