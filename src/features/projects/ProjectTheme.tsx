import { createContext } from 'react';
import type { Project } from '../../types';

export const ProjectThemeContext = createContext<string | undefined>(undefined);
export const projectColor = (project: Project) =>
  /^#[0-9a-f]{6}$/i.test(project.settings.themeColor || '')
    ? project.settings.themeColor!
    : '#1677ff';
export function ProjectColorBar({ project }: { project: Project }) {
  return (
    <span className="project-color-bar" title={projectColor(project)}
      style={{ backgroundColor: projectColor(project) }} aria-hidden="true" />
  );
}
