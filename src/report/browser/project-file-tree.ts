/**
 * One project file rendered in the browser-owned files tree.
 */
export type ProjectFileTreeFile = {
  readonly kind: "file"
  readonly id: string
  readonly name: string
  readonly path: string
}

/**
 * One directory derived from the project-file paths visible in the current report view.
 */
export type ProjectFileTreeDirectory = {
  readonly kind: "directory"
  readonly name: string
  readonly path: string
  readonly children: readonly ProjectFileTreeEntry[]
}

/**
 * One directory or project-file entry in the browser-owned files tree.
 */
export type ProjectFileTreeEntry = ProjectFileTreeDirectory | ProjectFileTreeFile

/**
 * Minimal project-file identity needed to derive the files tree.
 */
export type ProjectFileTreeInput = {
  readonly id: string
  readonly path: string
}

type MutableDirectory = {
  readonly directories: Map<string, MutableDirectory>
  readonly files: ProjectFileTreeFile[]
}

/**
 * Build a deterministic directory hierarchy from visible project files.
 *
 * Search is case-insensitive and matches the complete project-relative path, so
 * matching a directory keeps its matching descendant files in context.
 *
 * @param files - Project files visible under the current workspace filters.
 * @param searchQuery - Text used to filter project-relative paths.
 * @returns Top-level directory and file entries without a synthetic root entry.
 */
export function buildProjectFileTree(files: readonly ProjectFileTreeInput[], searchQuery: string): readonly ProjectFileTreeEntry[] {
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const root: MutableDirectory = { directories: new Map(), files: [] }

  for (const file of files) {
    if (normalizedQuery.length > 0 && !file.path.toLowerCase().includes(normalizedQuery)) {
      continue
    }

    const segments = file.path.split("/")
    const fileName = segments.at(-1)
    if (fileName === undefined) {
      continue
    }

    let directory = root
    for (const segment of segments.slice(0, -1)) {
      let child = directory.directories.get(segment)
      if (child === undefined) {
        child = { directories: new Map(), files: [] }
        directory.directories.set(segment, child)
      }
      directory = child
    }
    directory.files.push({ kind: "file", id: file.id, name: fileName, path: file.path })
  }

  return treeEntries(root, "")
}

function treeEntries(directory: MutableDirectory, parentPath: string): readonly ProjectFileTreeEntry[] {
  const entries: ProjectFileTreeEntry[] = []
  for (const [name, child] of directory.directories) {
    const path = parentPath.length === 0 ? name : `${parentPath}/${name}`
    entries.push({ kind: "directory", name, path, children: treeEntries(child, path) })
  }
  entries.push(...directory.files)
  entries.sort(compareTreeEntries)
  return entries
}

function compareTreeEntries(left: ProjectFileTreeEntry, right: ProjectFileTreeEntry): number {
  if (left.name === right.name) {
    return left.kind === right.kind ? 0 : left.kind === "directory" ? -1 : 1
  }
  return left.name < right.name ? -1 : 1
}
