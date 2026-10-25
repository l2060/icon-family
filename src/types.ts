export type IconFormat = 'js' | 'ttf';

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'member';
  status: string;
}
export interface ProjectFolder {
  id: string;
  parentId: string | null;
  name: string;
}
export interface Project {
  owner_id?: number;
  id: number;
  name: string;
  prefix: string;
  description: string;
  icon_count?: number;
  settings: {
    folders?: ProjectFolder[];
    themeColor?: string;
    jsFilename?: string;
    collaboratorIds?: number[];
    everyoneCanEdit?: boolean;
    margin?: number;
    emSize?: number;
    codepointStart?: number;
    [key: string]: unknown;
  };
  latestBuild?: { version: number };
}
export interface Icon {
  folder_id?: string | null;
  id: number;
  name: string;
  slug: string;
  svg: string;
  codepoint: string | number | null;
  color_mode: string;
  revision: number;
  created_at: string;
}
export interface RemoteIcon {
  remoteId: string;
  name: string;
  svg: string;
  fontClass?: string;
  unicode?: string;
}
export interface CartItem extends RemoteIcon {
  id: number;
  createdAt: string;
}
export interface CheckoutResult {
  items: CartItem[];
  removedIds: number[];
  results: {
    projectId: number;
    name: string;
    succeeded: number;
    skipped: number;
    failed: number;
  }[];
  failures: {
    itemId: number;
    name: string;
    projectId: number;
    projectName: string;
    reason: string;
  }[];
}
export interface ImportJob {
  succeeded: number;
  skipped: number;
  failed: number;
}
export interface ProjectDetail {
  project: Project;
  icons: Icon[];
}
