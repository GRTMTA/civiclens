import type { ProjectReference } from "./community-contract"

/** Resolves the composer's initial optional project without loading project details. */
export function initialProjectSelection(
  defaultProject: ProjectReference | null,
  defaultProjectId: string | null,
): ProjectReference | null {
  if (defaultProject?.id.trim()) return defaultProject
  const id = defaultProjectId?.trim()
  return id ? { id, name: id } : null
}

/** Keeps the current selection visible while server-side search results change. */
export function projectOptionsWithSelection(
  projects: readonly ProjectReference[],
  selectedProject: ProjectReference | null,
): ProjectReference[] {
  if (!selectedProject || projects.some((project) => project.id === selectedProject.id)) {
    return [...projects]
  }
  return [selectedProject, ...projects]
}
