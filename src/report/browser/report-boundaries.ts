import type { ReportScopeState } from "./report-lens.js"
import type { BrowserPresentation, ReportEdge, ReportProjectFileNode } from "./report-presentation.js"

export const ROOT_FILES_BOUNDARY_LABEL = "(root files)"

/** Relationship kinds that participate in the derived boundary matrix. */
export type BoundaryFilterState = {
  readonly runtimeDependencies: boolean
  readonly typeOnlyDependencies: boolean
}

/** One deterministic grouping of visible project files. */
export type ReportBoundary = {
  readonly id: string
  readonly label: string
  readonly kind: "workspace" | "directory" | "root-files"
  readonly fileNodeIds: readonly string[]
}

/** One exact project-file relationship represented by an aggregate matrix cell. */
export type BoundaryRelationship = {
  readonly edgeId: string
  readonly sourceNodeId: string
  readonly sourcePath: string
  readonly targetNodeId: string
  readonly targetPath: string
  readonly kind: ReportEdge["dependencyKind"]
}

/** One directed source-row to target-column matrix cell. */
export type BoundaryCell = {
  readonly id: string
  readonly sourceBoundaryId: string
  readonly sourceLabel: string
  readonly targetBoundaryId: string
  readonly targetLabel: string
  readonly runtimeCount: number
  readonly typeOnlyCount: number
  readonly relationships: readonly BoundaryRelationship[]
}

/** Complete boundary aggregation for the current scope and relationship filters. */
export type BoundaryLensResults = {
  readonly boundaries: readonly ReportBoundary[]
  readonly cells: readonly BoundaryCell[]
  readonly boundaryById: ReadonlyMap<string, ReportBoundary>
  readonly cellById: ReadonlyMap<string, BoundaryCell>
  readonly relationshipCount: number
  readonly runtimeCount: number
  readonly typeOnlyCount: number
}

/** A selected boundary or directed boundary pair. */
export type BoundarySelection =
  | { readonly kind: "boundary"; readonly boundaryId: string }
  | { readonly kind: "pair"; readonly sourceBoundaryId: string; readonly targetBoundaryId: string }

/** Exact graph and inspector facts represented by one selection. */
export type BoundaryDrillDown = {
  readonly id: string
  readonly kind: BoundarySelection["kind"]
  readonly sourceLabel: string
  readonly targetLabel: string
  readonly fileNodeIds: readonly string[]
  readonly relationships: readonly BoundaryRelationship[]
}

/** Derive deterministic browser-owned boundaries and their directed dependency matrix. */
export function deriveBoundaryLensResults(
  presentation: BrowserPresentation,
  scope: ReportScopeState,
  filters: BoundaryFilterState,
): BoundaryLensResults {
  const visibleFiles = presentation.nodes
    .filter(
      (node): node is ReportProjectFileNode =>
        node.kind === "project-file" && (node.workspacePackage === undefined || scope.workspacePackages.has(node.workspacePackage)),
    )
    .toSorted((left, right) => left.path.localeCompare(right.path))
  const visibleFileById = new Map(visibleFiles.map((file) => [file.id, file]))
  const selectedWorkspacePaths = presentation.workspacePackages.map(({ path }) => path).filter((path) => scope.workspacePackages.has(path))
  const useWorkspaceBoundaries = presentation.workspacePackages.length > 1 && selectedWorkspacePaths.length !== 1
  const selectedWorkspacePath = selectedWorkspacePaths.length === 1 ? selectedWorkspacePaths[0] : undefined
  const workspaceNameByPath = new Map(presentation.workspacePackages.map(({ name, path }) => [path, name]))
  const mutableBoundaries = new Map<string, { label: string; kind: ReportBoundary["kind"]; fileNodeIds: string[] }>()
  const boundaryIdByNodeId = new Map<string, string>()

  for (const file of visibleFiles) {
    const identity = boundaryIdentity(file, useWorkspaceBoundaries, selectedWorkspacePath, workspaceNameByPath)
    const boundary = mutableBoundaries.get(identity.id) ?? { label: identity.label, kind: identity.kind, fileNodeIds: [] }
    boundary.fileNodeIds.push(file.id)
    mutableBoundaries.set(identity.id, boundary)
    boundaryIdByNodeId.set(file.id, identity.id)
  }

  const boundaries = [...mutableBoundaries]
    .map(
      ([id, boundary]): ReportBoundary => ({
        id,
        label: boundary.label,
        kind: boundary.kind,
        fileNodeIds: boundary.fileNodeIds,
      }),
    )
    .toSorted(compareBoundaries)
  const relationshipsByPair = new Map<string, BoundaryRelationship[]>()

  for (const edge of presentation.edges) {
    if (
      edge.targetKind !== "project-file" ||
      (edge.dependencyKind === "runtime" ? !filters.runtimeDependencies : !filters.typeOnlyDependencies)
    ) {
      continue
    }
    const source = visibleFileById.get(edge.source)
    const target = visibleFileById.get(edge.target)
    const sourceBoundaryId = boundaryIdByNodeId.get(edge.source)
    const targetBoundaryId = boundaryIdByNodeId.get(edge.target)
    if (source === undefined || target === undefined || sourceBoundaryId === undefined || targetBoundaryId === undefined) {
      continue
    }
    const pairId = boundaryCellId(sourceBoundaryId, targetBoundaryId)
    const relationships = relationshipsByPair.get(pairId) ?? []
    relationships.push({
      edgeId: edge.id,
      sourceNodeId: source.id,
      sourcePath: source.path,
      targetNodeId: target.id,
      targetPath: target.path,
      kind: edge.dependencyKind,
    })
    relationshipsByPair.set(pairId, relationships)
  }

  const cells = boundaries.flatMap((source) =>
    boundaries.map((target): BoundaryCell => {
      const relationships = (relationshipsByPair.get(boundaryCellId(source.id, target.id)) ?? []).toSorted(compareRelationships)
      return {
        id: boundaryCellId(source.id, target.id),
        sourceBoundaryId: source.id,
        sourceLabel: source.label,
        targetBoundaryId: target.id,
        targetLabel: target.label,
        runtimeCount: relationships.filter(({ kind }) => kind === "runtime").length,
        typeOnlyCount: relationships.filter(({ kind }) => kind === "type-only").length,
        relationships,
      }
    }),
  )

  return {
    boundaries,
    cells,
    boundaryById: new Map(boundaries.map((boundary) => [boundary.id, boundary])),
    cellById: new Map(cells.map((cell) => [cell.id, cell])),
    relationshipCount: cells.reduce((total, { relationships }) => total + relationships.length, 0),
    runtimeCount: cells.reduce((total, { runtimeCount }) => total + runtimeCount, 0),
    typeOnlyCount: cells.reduce((total, { typeOnlyCount }) => total + typeOnlyCount, 0),
  }
}

/** Resolve one aggregate selection to the exact files and relationships it represents. */
export function deriveBoundaryDrillDown(results: BoundaryLensResults, selection: BoundarySelection): BoundaryDrillDown | undefined {
  if (selection.kind === "boundary") {
    const boundary = results.boundaryById.get(selection.boundaryId)
    if (boundary === undefined) {
      return undefined
    }
    const cell = results.cellById.get(boundaryCellId(boundary.id, boundary.id))
    return {
      id: boundary.id,
      kind: "boundary",
      sourceLabel: boundary.label,
      targetLabel: boundary.label,
      fileNodeIds: boundary.fileNodeIds,
      relationships: cell?.relationships ?? [],
    }
  }

  const cell = results.cellById.get(boundaryCellId(selection.sourceBoundaryId, selection.targetBoundaryId))
  if (cell === undefined) {
    return undefined
  }
  return {
    id: cell.id,
    kind: "pair",
    sourceLabel: cell.sourceLabel,
    targetLabel: cell.targetLabel,
    fileNodeIds: [...new Set(cell.relationships.flatMap(({ sourceNodeId, targetNodeId }) => [sourceNodeId, targetNodeId]))],
    relationships: cell.relationships,
  }
}

export function boundaryCellId(sourceBoundaryId: string, targetBoundaryId: string): string {
  return `${sourceBoundaryId}->${targetBoundaryId}`
}

function boundaryIdentity(
  file: ReportProjectFileNode,
  useWorkspaceBoundaries: boolean,
  selectedWorkspacePath: string | undefined,
  workspaceNameByPath: ReadonlyMap<string, string>,
): Pick<ReportBoundary, "id" | "label" | "kind"> {
  if (firstDirectorySegment(file.path) === undefined) {
    return { id: "root-files", label: ROOT_FILES_BOUNDARY_LABEL, kind: "root-files" }
  }
  if (useWorkspaceBoundaries && file.workspacePackage !== undefined) {
    return {
      id: `workspace:${file.workspacePackage}`,
      label: workspaceNameByPath.get(file.workspacePackage) ?? file.workspacePackage,
      kind: "workspace",
    }
  }
  if (file.workspacePackage === undefined) {
    const rootSegment = firstDirectorySegment(file.path)
    if (rootSegment === undefined) {
      throw new Error(`Expected a directory segment for ${file.path}.`)
    }
    return { id: `directory:${rootSegment}`, label: rootSegment, kind: "directory" }
  }
  const relativePath =
    selectedWorkspacePath === file.workspacePackage && file.workspacePackage !== "."
      ? file.path.slice(file.workspacePackage.length).replace(/^\/+/, "")
      : file.path
  const segment = firstDirectorySegment(relativePath)
  return segment === undefined
    ? { id: `root-files:${file.workspacePackage}`, label: ROOT_FILES_BOUNDARY_LABEL, kind: "root-files" }
    : { id: `directory:${file.workspacePackage}:${segment}`, label: segment, kind: "directory" }
}

function firstDirectorySegment(path: string): string | undefined {
  const segments = path.split("/")
  return segments.length > 1 ? segments[0] : undefined
}

function compareBoundaries(left: ReportBoundary, right: ReportBoundary): number {
  if (left.kind === "root-files" && right.kind !== "root-files") {
    return 1
  }
  if (right.kind === "root-files" && left.kind !== "root-files") {
    return -1
  }
  const labelComparison = left.label.localeCompare(right.label)
  return labelComparison === 0 ? left.id.localeCompare(right.id) : labelComparison
}

function compareRelationships(left: BoundaryRelationship, right: BoundaryRelationship): number {
  const comparisons = [
    left.sourcePath.localeCompare(right.sourcePath),
    left.targetPath.localeCompare(right.targetPath),
    left.kind.localeCompare(right.kind),
    left.edgeId.localeCompare(right.edgeId),
  ]
  return comparisons.find((comparison) => comparison !== 0) ?? 0
}
