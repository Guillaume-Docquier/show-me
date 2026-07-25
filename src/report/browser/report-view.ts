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
  const visibleExternalPackageNodeIds = new Set(
    state.externalPackages
      ? presentation.edges
          .filter((edge) => edge.kind === "external-package" && visibleProjectNodeIds.has(edge.source))
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
  const dependencyEdges = presentation.edges.filter(({ source, target }) => nodeIds.has(source) && nodeIds.has(target))
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

  return {
    state,
    nodes,
    nodeIds,
    dependencyEdges,
    directories,
    structureEdges: structure.edges,
    visibleProjectFileCount: visibleProjectNodeIds.size,
  }
}

/** Return only relationships whose other endpoint participates in this view. */
export function visibleRelationships(view: ReportView, nodeIds: readonly string[]): readonly string[] {
  return nodeIds.filter((nodeId) => view.nodeIds.has(nodeId))
}

/**
 * Fingerprint the ordered layout inputs for black-box browser assertions.
 *
 * This is not a signature of ForceAtlas2 output; it only proves that visible
 * node identities or sizes changed and can later be restored.
 */
export function reportViewLayoutSignature(view: ReportView): string {
  let hash = 2_166_136_261
  for (const character of JSON.stringify(view.nodes.map(({ id, size }) => ({ id, size })))) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(16)
}

function isProjectFileInDirectory(filePath: string, directoryPath: string): boolean {
  return directoryPath === "" || filePath.startsWith(`${directoryPath}/`)
}
