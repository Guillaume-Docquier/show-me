import { buildProjectStructure, type ProjectDirectoryNode, type ProjectStructureEdge } from "./project-structure.js"
import {
  activeLineCount,
  nodeSizeForLines,
  type BrowserPresentation,
  type ReportEdge,
  type ReportLineCategory,
  type ReportNode,
} from "./report-presentation.js"

/** User-controlled dimensions that change graph membership or node sizing. */
export type ReportViewState = {
  /** Always non-empty; these categories affect project-file size, not the metrics displayed in details. */
  readonly lineCategories: readonly ReportLineCategory[]
  /** Controls graph membership and therefore which relationships are visible. */
  readonly externalPackages: boolean
  /** Whether explicitly type-only relationships participate in the visible graph. */
  readonly typeOnlyDependencies: boolean
  /** Workspace packages whose owned project files participate in the visible graph. */
  readonly workspacePackages: ReadonlySet<string>
}

/** One presentation node prepared for the current graph projection. */
export type ReportViewNode = {
  readonly id: string
  readonly color: string
  readonly size: number
  readonly reportNode: ReportNode
}

/** One synthetic directory enriched with information used by label prioritization. */
export type ReportViewDirectory = ProjectDirectoryNode & {
  readonly descendantProjectFileCount: number
}

/** Complete visible projection derived from immutable browser presentation. */
export type ReportView = {
  readonly state: ReportViewState
  readonly nodes: readonly ReportViewNode[]
  readonly nodeIds: ReadonlySet<string>
  readonly graphNodeIds: ReadonlySet<string>
  readonly dependencyEdges: readonly ReportEdge[]
  readonly directories: readonly ReportViewDirectory[]
  readonly structureEdges: readonly ProjectStructureEdge[]
  readonly visibleProjectFileCount: number
}

/** Create the default report view selected by the generated HTML controls. */
export function initialReportViewState(presentation: BrowserPresentation): ReportViewState {
  return {
    lineCategories: ["code"],
    externalPackages: false,
    typeOnlyDependencies: true,
    workspacePackages: new Set(presentation.workspacePackages.map(({ path }) => path)),
  }
}

/**
 * Derive the visible, sized report graph from immutable presentation facts.
 *
 * This is the single transition for every control that changes layout inputs.
 * Render-only edge visibility intentionally does not participate.
 */
export function buildReportView(presentation: BrowserPresentation, state: ReportViewState): ReportView {
  const visibleProjectNodeIds = new Set(
    presentation.nodes
      .filter(
        (node) =>
          node.kind === "project-file" && (node.workspacePackage === undefined || state.workspacePackages.has(node.workspacePackage)),
      )
      .map(({ id }) => id),
  )
  const visiblePresentationEdges = presentation.edges.filter(
    ({ dependencyKind }) => dependencyKind === "runtime" || state.typeOnlyDependencies,
  )
  const visibleExternalPackageNodeIds = new Set(
    state.externalPackages
      ? visiblePresentationEdges
          .filter((edge) => edge.targetKind === "external-package" && visibleProjectNodeIds.has(edge.source))
          .map(({ target }) => target)
      : [],
  )
  const nodes = presentation.nodes
    .filter(
      (node) =>
        (node.kind === "project-file" && visibleProjectNodeIds.has(node.id)) ||
        (node.kind === "external-package" && visibleExternalPackageNodeIds.has(node.id)),
    )
    .map(
      (reportNode): ReportViewNode => ({
        id: reportNode.id,
        color: reportNode.color,
        size:
          reportNode.kind === "project-file"
            ? nodeSizeForLines(activeLineCount(reportNode.lineMetrics, state.lineCategories))
            : reportNode.size,
        reportNode,
      }),
    )
  const nodeIds = new Set(nodes.map(({ id }) => id))
  const dependencyEdges = visiblePresentationEdges.filter(({ source, target }) => nodeIds.has(source) && nodeIds.has(target))
  const visibleProjectFiles = nodes.flatMap(({ id, reportNode }) =>
    reportNode.kind === "project-file" ? [{ id, path: reportNode.path }] : [],
  )
  const structure = buildProjectStructure(visibleProjectFiles, presentation.projectName)
  const directories = structure.directories.map(
    (directory): ReportViewDirectory => ({
      ...directory,
      descendantProjectFileCount: visibleProjectFiles.filter(({ path }) => isProjectFileInDirectory(path, directory.path)).length,
    }),
  )
  const graphNodeIds = new Set([...nodeIds, ...directories.map(({ id }) => id)])

  return {
    state,
    nodes,
    nodeIds,
    graphNodeIds,
    dependencyEdges,
    directories,
    structureEdges: structure.edges,
    visibleProjectFileCount: visibleProjectNodeIds.size,
  }
}

/** One currently visible relationship from the inspected node's perspective. */
export type VisibleRelationship = {
  readonly nodeId: string
  readonly kind: ReportEdge["dependencyKind"]
}

/** Derive visible relationship details from the current edge projection. */
export function visibleRelationships(
  view: ReportView,
  nodeId: string,
  direction: "dependency" | "consumer",
): readonly VisibleRelationship[] {
  return view.dependencyEdges.flatMap((edge) => {
    if (direction === "dependency" && edge.source === nodeId) {
      return [{ nodeId: edge.target, kind: edge.dependencyKind }]
    }
    if (direction === "consumer" && edge.target === nodeId) {
      return [{ nodeId: edge.source, kind: edge.dependencyKind }]
    }
    return []
  })
}

/**
 * Fingerprint the ordered layout inputs for black-box browser assertions.
 *
 * This is not a signature of ForceAtlas2 output; it only proves that visible
 * node identities or sizes changed and can later be restored.
 */
export function reportViewLayoutSignature(view: ReportView): string {
  let hash = 2_166_136_261
  const layoutInputs = {
    nodes: view.nodes.map(({ id, size }) => ({ id, size })),
    edges: view.dependencyEdges.map(({ id }) => id),
  }
  for (const character of JSON.stringify(layoutInputs)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(16)
}

function isProjectFileInDirectory(filePath: string, directoryPath: string): boolean {
  return directoryPath === "" || filePath.startsWith(`${directoryPath}/`)
}
