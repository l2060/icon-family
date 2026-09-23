import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { api } from '../api';
import type { Icon, Project, ProjectDetail } from '../types';
import {
  isLoginRoute,
  readAllRoute,
  readFolderRoute,
  readProjectRoute,
  writeProjectRoute,
} from './projectRoute';
import { usePreferences } from '../preferences';

export function useProjects() {
  const { t } = usePreferences();
  const { message } = App.useApp();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<number>();
  const [folderId, setFolderId] = useState<string>();
  const [showAll, setShowAll] = useState(false);
  const [detail, setDetail] = useState<ProjectDetail>();
  const [loading, setLoading] = useState(false);
  const currentId = useRef<number | undefined>(undefined);
  const request = useRef(0);
  const available = useRef<Project[]>([]);
  const ready = useRef(false);
  const select = useCallback(
    async (id?: number, replaceRoute = false, folder?: string, all = false) => {
      writeProjectRoute(id, replaceRoute, folder, all);
      setShowAll(all);
      setFolderId(folder);
      const version = ++request.current;
      currentId.current = id;
      setActiveId(id);
      if (!id) {
        setDetail(undefined);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const result = await api<ProjectDetail>(`/projects/${id}?view=workspace`);
        if (request.current === version) setDetail(result);
      } catch (e) {
        if (request.current === version) {
          setDetail(undefined);
          message.error((e as Error).message);
        }
      } finally {
        if (request.current === version) setLoading(false);
      }
    },
    [message],
  );
  const refresh = useCallback(
    async (preferred?: number) => {
      const version = request.current;
      const result = await api<{ projects: Project[] }>('/projects');
      if (version !== request.current) return;
      setProjects(result.projects);
      available.current = result.projects;
      ready.current = true;
      const desired = preferred ?? readProjectRoute() ?? currentId.current;
      const id = result.projects.some((p) => p.id === desired) ? desired : result.projects[0]?.id;
      await select(
        id,
        true,
        id === readProjectRoute() ? readFolderRoute() : undefined,
        id === readProjectRoute() && readAllRoute(),
      );
    },
    [select],
  );
  useEffect(() => {
    const navigate = () => {
      if (!ready.current || isLoginRoute()) return;
      const desired = readProjectRoute();
      const id = available.current.some((project) => project.id === desired)
        ? desired
        : available.current[0]?.id;
      const folder = id === desired ? readFolderRoute() : undefined;
      const all = id === desired && readAllRoute();
      writeProjectRoute(id, true, folder, all);
      setShowAll(all);
      setFolderId(folder);
      if (id !== currentId.current) void select(id, true, folder, all);
    };
    window.addEventListener('hashchange', navigate);
    void refresh().catch((e) => message.error(e.message));
    return () => {
      window.removeEventListener('hashchange', navigate);
      ready.current = false;
      request.current++;
    };
  }, [refresh, select, message]);
  useEffect(() => {
    if (
      folderId &&
      !loading &&
      detail &&
      detail.project.id === activeId &&
      !(detail.project.settings.folders || []).some((folder) => folder.id === folderId)
    ) {
      setFolderId(undefined);
      setShowAll(true);
      writeProjectRoute(activeId, true, undefined, true);
      message.info(
        t(
          '目录已删除或不存在，已返回项目全部视图',
          'Folder no longer exists. Showing all project icons.',
        ),
      );
    }
  }, [folderId, loading, detail, activeId, message, t]);
  const selectFolder = useCallback((folder?: string) => {
    writeProjectRoute(currentId.current, false, folder);
    setFolderId(folder);
    setShowAll(false);
  }, []);
  const selectView = useCallback((all: boolean) => {
    writeProjectRoute(currentId.current, false, undefined, all);
    setFolderId(undefined);
    setShowAll(all);
  }, []);
  const updateOrganization = useCallback(
    (
      project: Project,
      removedIds: number[] = [],
      moved?: { iconIds: number[]; folderId: string | null },
    ) => {
      setProjects((previous) => {
        const next = previous.map((item) => (item.id === project.id ? project : item));
        available.current = next;
        return next;
      });
      const removed = new Set(removedIds),
        movedIds = new Set(moved?.iconIds);
      setDetail((previous) =>
        previous?.project.id === project.id
          ? {
              project,
              icons: previous.icons
                .filter((icon) => !removed.has(icon.id))
                .map((icon) =>
                  movedIds.has(icon.id) ? { ...icon, folder_id: moved!.folderId } : icon,
                ),
            }
          : previous,
      );
    },
    [],
  );
  const updateIcon = useCallback((projectId: number, updated: Icon) => {
    setDetail((previous) => {
      if (!previous || previous.project.id !== projectId) return previous;
      return {
        ...previous,
        icons: previous.icons.map((icon) => (icon.id === updated.id ? updated : icon)),
      };
    });
  }, []);
  return {
    projects,
    activeId,
    folderId,
    showAll,
    selectView,
    selectFolder,
    updateOrganization,
    detail,
    loading,
    select,
    refresh,
    updateIcon,
  };
}
