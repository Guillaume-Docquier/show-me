/** One visible project file that belongs to the browser-derived structure tree. */
export type ProjectStructureFile = {
  readonly id: string
  readonly path: string
}

/** One synthetic directory node in the browser graph. */
export type ProjectDirectoryNode = {
  readonly id: string
  readonly path: string
  readonly label: string
  readonly depth: number
}

/** One parent-to-child structural relationship. */
export type ProjectStructureEdge = {
  readonly id: string
  readonly source: string
  readonly target: string
}

/** Complete browser-derived project tree for the visible project files. */
export type ProjectStructure = {
  readonly directories: readonly ProjectDirectoryNode[]
  readonly edges: readonly ProjectStructureEdge[]
}

/**
 * Derive directory nodes and containment edges from visible project-file paths.
 *
 * The root directory exists even for an empty project. External packages never
 * enter this function, so they remain free-floating in the force layout.
 */
export function buildProjectStructure(files: readonly ProjectStructureFile[], projectName: string): ProjectStructure {
  const directoryPaths = new Set<string>([""])
  for (const file of files) {
    const segments = directorySegments(file.path)
    for (let depth = 1; depth <= segments.length; depth += 1) {
      directoryPaths.add(segments.slice(0, depth).join("/"))
    }
  }

  const directories = [...directoryPaths].sort(compareDirectoryPaths).map(
    (path): ProjectDirectoryNode => ({
      id: directoryNodeId(path),
      path,
      label: path === "" ? projectName : (path.split("/").at(-1) ?? path),
      depth: path === "" ? 0 : path.split("/").length,
    }),
  )
  const directoryEdges = directories
    .filter(({ path }) => path !== "")
    .map(
      (directory): ProjectStructureEdge => ({
        id: `structure-directory:${directory.path}`,
        source: directoryNodeId(parentDirectoryPath(directory.path)),
        target: directory.id,
      }),
    )
  const fileEdges = [...files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(
      (file): ProjectStructureEdge => ({
        id: `structure-file:${file.id}`,
        source: directoryNodeId(parentDirectoryPath(file.path)),
        target: file.id,
      }),
    )

  return { directories, edges: [...directoryEdges, ...fileEdges] }
}

function directorySegments(filePath: string): readonly string[] {
  return filePath.split("/").slice(0, -1)
}

function directoryNodeId(path: string): string {
  return `directory:${path === "" ? "." : path}`
}

function parentDirectoryPath(path: string): string {
  const separator = path.lastIndexOf("/")
  return separator === -1 ? "" : path.slice(0, separator)
}

function compareDirectoryPaths(left: string, right: string): number {
  const depthDifference = directoryDepth(left) - directoryDepth(right)
  return depthDifference === 0 ? left.localeCompare(right) : depthDifference
}

function directoryDepth(path: string): number {
  return path === "" ? 0 : path.split("/").length
}
