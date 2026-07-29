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

/** Search-aware project tree derived from the current visible files. */
export type ProjectFileTree = {
  readonly entries: readonly ProjectFileTreeEntry[]
  readonly matchCount: number | undefined
}

type MutableDirectory = {
  readonly directories: Map<string, MutableDirectory>
  readonly files: ProjectFileTreeFile[]
}

/**
 * Build a deterministic directory hierarchy from visible project files.
 *
 * Search is case-insensitive and matches complete project-relative file and
 * directory paths. Matching entries retain their ancestry so the result stays
 * navigable without changing graph membership.
 *
 * @param files - Project files visible under the current workspace filters.
 * @param searchQuery - Text used to filter project-relative paths.
 * @returns Top-level entries and the exact direct-match count when searching.
 */
export function buildProjectFileTree(files: readonly ProjectFileTreeInput[], searchQuery: string): ProjectFileTree {
  const root: MutableDirectory = { directories: new Map(), files: [] }

  for (const file of files) {
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

  const entries = treeEntries(root, "")
  const normalizedQuery = searchQuery.trim().toLowerCase()
  if (normalizedQuery.length === 0) {
    return { entries, matchCount: undefined }
  }

  const filtered = filterTreeEntries(entries, normalizedQuery)
  return { entries: filtered.entries, matchCount: filtered.matchCount }
}

function filterTreeEntries(
  entries: readonly ProjectFileTreeEntry[],
  normalizedQuery: string,
): { readonly entries: readonly ProjectFileTreeEntry[]; readonly matchCount: number } {
  const filteredEntries: ProjectFileTreeEntry[] = []
  let matchCount = 0
  for (const entry of entries) {
    const matches = entry.path.toLowerCase().includes(normalizedQuery)
    matchCount += matches ? 1 : 0
    if (entry.kind === "file") {
      if (matches) {
        filteredEntries.push(entry)
      }
      continue
    }

    const filteredChildren = filterTreeEntries(entry.children, normalizedQuery)
    matchCount += filteredChildren.matchCount
    if (matches || filteredChildren.entries.length > 0) {
      filteredEntries.push({ ...entry, children: filteredChildren.entries })
    }
  }
  return { entries: filteredEntries, matchCount }
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
