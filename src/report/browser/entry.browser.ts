/**
 * Browser bootstrap embedded in every self-contained report.
 *
 * The report builder creates the required DOM and assigns the language-neutral
 * analysis to `window.showMeAnalysis` before this prebuilt bundle runs. The browser
 * derives immutable presentation facts from that analysis; Graphology holds the
 * mutable visible projection, Sigma renders it and emits interactions, and the
 * layout libraries assign browser-only coordinates.
 */
import { DirectedGraph } from "graphology"
import { circular } from "graphology-layout"
import forceAtlas2 from "graphology-layout-forceatlas2"
import { Sigma } from "sigma"
import { createEdgeArrowProgram, drawDiscNodeHover, type NodeHoverDrawingFunction } from "sigma/rendering"
import type { EdgeDisplayData, NodeDisplayData } from "sigma/types"
import { type ProjectAnalysis } from "../../analysis/project-analysis.js"
import {
  fileLabelsAreVisible,
  selectVisibleDirectoryLabels,
  type DirectoryLabelCandidate,
  visibleDirectoryDepth,
} from "./directory-label-visibility.js"
import { buildProjectFileTree, type ProjectFileTreeEntry, type ProjectFileTreeFile } from "./project-file-tree.js"
import { buildProjectStructure, type ProjectStructureEdge } from "./project-structure.js"
import {
  activeLineCount,
  buildBrowserPresentation,
  COVERAGE_LEGEND_ENTRIES,
  coverageColor,
  nodeSizeForLines,
  REPORT_LINE_CATEGORIES,
  type ReportLineCategory,
  type ReportNode,
  type ReportProjectFileNode,
} from "./report-presentation.js"

declare global {
  interface Window {
    /** Internal handoff from the generated HTML shell, not a public browser API. */
    readonly showMeAnalysis: ProjectAnalysis
  }
}

const DIRECTORY_NODE_SIZE = 9
const ROOT_DIRECTORY_NODE_SIZE = 15
const STRUCTURE_EDGE_WEIGHT = 6
const DEPENDENCY_EDGE_WEIGHT = 0.25
const EXTERNAL_DEPENDENCY_EDGE_WEIGHT = 1.2
const DEPENDENCY_EDGE_COLOR = "rgba(98, 139, 181, 0.32)"
const EXTERNAL_DEPENDENCY_EDGE_COLOR = "rgba(154, 104, 193, 0.38)"
const LABEL_FONT = "ui-monospace, SFMono-Regular, Consolas, monospace"
const LABEL_SIZE = 11
const LABEL_WEIGHT = "500"
const LABEL_OFFSET = 3
const DIRECTORY_LABEL_COLLISION_PADDING = 4
const DIRECTORY_LABEL_HOVER_FOREGROUND = "#f5f9ff"
const DIRECTORY_LABEL_HOVER_BACKGROUND = "#111821"
const GRAPH_FIT_MARGIN = 1
const HOVERED_NODE_FOCUS_COLOR = "#f5f9ff"
const DEPENDENCY_FOCUS_COLOR = "#46d7c6"
const CONSUMER_FOCUS_COLOR = "#ff9b71"
const DEPENDENCY_FOCUS_EDGE_SIZE = 4.4
const CONSUMER_FOCUS_EDGE_SIZE = 5.2
const FOCUS_RING_OFFSET = 5
const FOCUS_RING_SEPARATION = 5
const FOCUS_RING_WIDTH = 3

type BrowserNodeAttributes = {
  readonly size: number
  readonly color: string
  readonly x: number
  readonly y: number
  readonly nodeKind: "project-file" | "external-package" | "directory"
  readonly label?: string
  readonly forceLabel?: boolean
  readonly directoryDepth?: number
  readonly descendantProjectFileCount?: number
}

type BrowserNodeHoverDrawingFunction = NodeHoverDrawingFunction<BrowserNodeAttributes, BrowserEdgeAttributes>

type BrowserEdgeAttributes = {
  readonly edgeKind: "structure" | "dependency"
  readonly weight: number
  readonly color?: string
  readonly hidden?: boolean
  readonly size?: number
  readonly type?: string
}

type GraphNodeCircle = {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly radius: number
}

type ReportViewState = {
  /** Always non-empty; these categories affect project-file size, not the metrics displayed in details. */
  readonly lineCategories: readonly ReportLineCategory[]
  /** Controls graph membership and therefore which relationships are visible. */
  readonly externalPackages: boolean
  /** Workspace packages whose owned project files participate in the visible graph. */
  readonly workspacePackages: ReadonlySet<string>
}

type EdgeVisibilityState = {
  /** Render-only visibility; structure edges remain layout inputs even while hidden. */
  readonly structureEdges: boolean
  /** Render-only visibility; dependency edges remain graph members even while hidden. */
  readonly dependencyEdges: boolean
}

type DependencyFocus = {
  readonly nodeId: string
  readonly dependencyNodeIds: ReadonlySet<string>
  readonly consumerNodeIds: ReadonlySet<string>
}

const analysis = window.showMeAnalysis
const presentation = buildBrowserPresentation(analysis)
const graphContainer = requiredElement("graph")
const projectName = requiredElement("project-name")
const projectFileCount = requiredElement("project-file-count")
const selectedHeading = requiredElement("selected-heading")
const selectedEmpty = requiredElement("selected-empty")
const selectedDetails = requiredElement("selected-details")
const selectedNodeType = requiredElement("selected-node-type")
const selectedPath = requiredElement("selected-path")
const selectedCodeLines = requiredElement("selected-code-lines")
const selectedCommentLines = requiredElement("selected-comment-lines")
const selectedBlankLines = requiredElement("selected-blank-lines")
const selectedDependencies = requiredElement("selected-dependencies")
const selectedConsumers = requiredElement("selected-consumers")
const selectedCoverage = requiredElement("selected-coverage")
const selectedDependencyNodes = requiredElement("selected-dependency-nodes")
const selectedConsumerNodes = requiredElement("selected-consumer-files")
const clearSelection = requiredElement("clear-selection")
const resetCameraButton = requiredButton("reset-camera")
const coverageLegend = requiredElement("coverage-legend")
const fileSearch = requiredSearchInput("file-search")
const fileTreeEmpty = requiredElement("file-tree-empty")
const fileList = requiredElement("file-list")
const externalPackageSection = requiredElement("external-package-section")
const externalPackageList = requiredElement("external-package-list")
const externalPackageToggle = requiredCheckbox("external-packages-toggle")
const structureEdgesToggle = requiredCheckbox("structure-edges-toggle")
const dependencyEdgesToggle = requiredCheckbox("dependency-edges-toggle")
const workspacePackageFieldset = requiredElement("workspace-package-fieldset")
const workspacePackageControls = requiredElement("workspace-package-controls")
const lineCategoryControls = REPORT_LINE_CATEGORIES.map((category) => ({
  category,
  input: requiredCheckbox("line-category-" + category),
}))
const projectFileDetailElements = document.querySelectorAll<HTMLElement>("[data-project-file-detail]")
document.title = `${presentation.projectName} · Show Me`
projectName.textContent = presentation.projectName
renderCoverageLegend()

// This index covers the complete derived presentation. The Graphology graph and
// visibleNodeIds below contain only the projection selected by the current view.
const nodeById = new Map(presentation.nodes.map((node) => [node.id, node]))
const graph = new DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes>()
let selectedNodeId: string | undefined
let hoveredNodeId: string | undefined
let hoveredDirectoryNodeId: string | undefined
let dependencyFocus: DependencyFocus | undefined
let visibleNodeIds = new Set<string>()
const collapsedDirectoryPaths = new Set<string>()
let viewState: ReportViewState = {
  lineCategories: ["code"],
  externalPackages: false,
  workspacePackages: new Set(presentation.workspacePackages.map((workspacePackage) => workspacePackage.path)),
}
let edgeVisibilityState: EdgeVisibilityState = {
  structureEdges: true,
  dependencyEdges: true,
}
let structureEdges: readonly ProjectStructureEdge[] = []
let maximumVisibleDirectoryDepth = visibleDirectoryDepth(1)
let showFileLabels = fileLabelsAreVisible(1)
let visibleDirectoryLabels: readonly DirectoryLabelCandidate[] = []
let visibleDirectoryLabelIds = new Set<string>()
let graphLabelVisibilityDirty = true
let cameraResetAwaitingSettledRender = false
const renderer = new Sigma<BrowserNodeAttributes, BrowserEdgeAttributes>(graph, graphContainer, {
  allowInvalidContainer: false,
  defaultEdgeType: "arrow",
  edgeProgramClasses: { arrow: createEdgeArrowProgram<BrowserNodeAttributes, BrowserEdgeAttributes>() },
  edgeReducer(edge, attributes): Partial<EdgeDisplayData> {
    if (attributes.edgeKind !== "dependency") {
      return attributes
    }
    if (attributes.hidden === true || !edgeVisibilityState.dependencyEdges) {
      return { ...attributes, hidden: true }
    }

    const relationship = focusedDependencyEdgeRelationship(edge)
    if (relationship === "dependency") {
      return { ...attributes, color: DEPENDENCY_FOCUS_COLOR, size: DEPENDENCY_FOCUS_EDGE_SIZE, zIndex: 1 }
    }
    if (relationship === "consumer") {
      return { ...attributes, color: CONSUMER_FOCUS_COLOR, size: CONSUMER_FOCUS_EDGE_SIZE, zIndex: 1 }
    }
    return attributes
  },
  labelColor: { color: "#aebdca" },
  defaultDrawNodeHover: drawNodeHover,
  labelFont: LABEL_FONT,
  labelRenderedSizeThreshold: 0,
  labelSize: LABEL_SIZE,
  labelWeight: LABEL_WEIGHT,
  // ForceAtlas2 and Sigma interpret node radii in the same graph-coordinate system.
  itemSizesReference: "positions",
  nodeReducer(node, attributes): Partial<NodeDisplayData> {
    const label =
      (attributes.nodeKind === "directory" && !visibleDirectoryLabelIds.has(node)) ||
      (attributes.nodeKind === "project-file" && !showFileLabels)
        ? { label: null, forceLabel: false }
        : {}
    return node === selectedNodeId
      ? { ...attributes, ...label, color: "#f4c66a", highlighted: true, zIndex: 1 }
      : { ...attributes, ...label }
  },
  zIndex: true,
})
const structureLayer = renderer.createCanvas("structure", {
  beforeLayer: "edges",
  style: { pointerEvents: "none" },
})
const structureContext = requiredCanvasContext(structureLayer)
const dependencyFocusLayer = renderer.createCanvas("dependency-focus", {
  afterLayer: "hoverNodes",
  style: { pointerEvents: "none" },
})
const dependencyFocusContext = requiredCanvasContext(dependencyFocusLayer)
const camera = renderer.getCamera()
maximumVisibleDirectoryDepth = visibleDirectoryDepth(camera.getState().ratio)
showFileLabels = fileLabelsAreVisible(camera.getState().ratio)
camera.on("updated", markGraphLabelVisibilityDirty)
renderer.resize(true)
// Sigma's window-resize path already schedules the full refresh that rebuilds
// its label grid. This listener only invalidates geometry for the new matrix.
renderer.on("resize", markGraphLabelVisibilityDirty)
renderer.on("afterRender", () => {
  renderStructureLinks()
  renderDependencyFocus()
  updateDependencyEdgeDiagnostics()
  const labelRefreshScheduled = synchronizeGraphLabelVisibilityAfterRender()
  updateCameraDiagnostics()
  if (!labelRefreshScheduled) {
    updateRenderedLabelDiagnostics()
    updateGraphNodeCircleDiagnostics()
    completePendingCameraReset()
  }
})

for (const control of lineCategoryControls) {
  control.input.addEventListener("change", () => {
    const lineCategories = selectedLineCategories()
    if (lineCategories.length === 0) {
      control.input.checked = true
      return
    }
    applyReportView({ ...viewState, lineCategories })
  })
}
externalPackageToggle.addEventListener("change", () => {
  applyReportView({ ...viewState, externalPackages: externalPackageToggle.checked })
})
structureEdgesToggle.addEventListener("change", () => {
  edgeVisibilityState = { ...edgeVisibilityState, structureEdges: structureEdgesToggle.checked }
  renderer.scheduleRender()
})
dependencyEdgesToggle.addEventListener("change", () => {
  edgeVisibilityState = { ...edgeVisibilityState, dependencyEdges: dependencyEdgesToggle.checked }
  renderer.refresh({
    partialGraph: { edges: dependencyEdgeIds() },
    schedule: true,
    skipIndexation: true,
  })
})
const workspacePackageInputs = presentation.workspacePackages.map((workspacePackage, index) => {
  const label = document.createElement("label")
  const input = document.createElement("input")
  input.id = `workspace-package-${index}`
  input.type = "checkbox"
  input.checked = true
  input.dataset.workspacePackage = workspacePackage.path
  input.addEventListener("change", () => {
    const visibleWorkspacePackages = new Set(viewState.workspacePackages)
    if (input.checked) {
      visibleWorkspacePackages.add(workspacePackage.path)
    } else {
      visibleWorkspacePackages.delete(workspacePackage.path)
    }
    applyReportView({ ...viewState, workspacePackages: visibleWorkspacePackages })
  })
  label.append(input, document.createTextNode(workspacePackage.name))
  workspacePackageControls.append(label)
  return input
})
workspacePackageFieldset.hidden = workspacePackageInputs.length === 0
fileSearch.addEventListener("input", () => {
  collapsedDirectoryPaths.clear()
  renderProjectFileList()
})

renderer.on("enterNode", ({ node }) => {
  const attributes = graph.getNodeAttributes(node)
  if (attributes.nodeKind === "directory") {
    hoveredDirectoryNodeId = node
    graphContainer.dataset.hoveredDirectoryLabel = node
    graphContainer.dataset.directoryLabelHoverForeground = DIRECTORY_LABEL_HOVER_FOREGROUND
    graphContainer.dataset.directoryLabelHoverBackground = DIRECTORY_LABEL_HOVER_BACKGROUND
    markGraphLabelVisibilityDirty()
    renderer.scheduleRender()
    return
  }

  const reportNode = nodeById.get(node)
  if (reportNode === undefined) {
    return
  }
  hoveredNodeId = node
  dependencyFocus = reportNode.kind === "project-file" ? dependencyFocusFor(reportNode) : undefined
  updateDependencyFocusDiagnostics()
  renderSelection()
  document.documentElement.dataset.hoveredNode = node
  refreshDependencyEdges()
})
renderer.on("leaveNode", clearHover)
renderer.on("clickNode", ({ node }) => {
  selectNode(node)
})
renderer.on("clickStage", () => {
  selectNode(undefined)
})
clearSelection.addEventListener("click", () => {
  selectNode(undefined)
})
resetCameraButton.addEventListener("click", () => {
  graphContainer.dataset.cameraReset = "pending"
  cameraResetAwaitingSettledRender = false
  void camera.animatedReset({ duration: 250 }).then(() => {
    cameraResetAwaitingSettledRender = true
    markGraphLabelVisibilityDirty()
    renderer.scheduleRender()
    return undefined
  })
})

applyReportView(viewState)
// The graph and interaction state are initialized synchronously. Sigma may still
// paint the resulting WebGL frame on the next animation frame.
document.documentElement.dataset.showMeReady = "true"

/**
 * Apply a graph-membership or node-sizing transition from presentation data derived from immutable analysis.
 *
 * Rebuilding the visible graph keeps line sizing and package visibility
 * composable and ensures hidden nodes and edges cannot affect layout,
 * relationship counts, hover, or selection. Render-only edge visibility is
 * intentionally managed separately so toggling it never rebuilds or lays out the graph.
 */
function applyReportView(nextState: ReportViewState): void {
  graph.clear()
  structureEdges = []
  hoveredDirectoryNodeId = undefined
  visibleDirectoryLabels = []
  visibleDirectoryLabelIds = new Set()
  delete graphContainer.dataset.hoveredDirectoryLabel
  delete graphContainer.dataset.directoryLabelHoverForeground
  delete graphContainer.dataset.directoryLabelHoverBackground
  viewState = nextState
  const visibleProjectNodeIds = new Set(
    presentation.nodes
      .filter(
        (node) =>
          node.kind === "project-file" && (node.workspacePackage === undefined || viewState.workspacePackages.has(node.workspacePackage)),
      )
      .map((node) => node.id),
  )
  const visibleExternalPackageNodeIds = new Set(
    viewState.externalPackages
      ? presentation.edges
          .filter((edge) => edge.kind === "external-package" && visibleProjectNodeIds.has(edge.source))
          .map((edge) => edge.target)
      : [],
  )
  const visibleNodes = presentation.nodes
    .filter(
      (node) =>
        (node.kind === "project-file" && visibleProjectNodeIds.has(node.id)) ||
        (node.kind === "external-package" && visibleExternalPackageNodeIds.has(node.id)),
    )
    .map((node) => ({
      id: node.id,
      color: node.color,
      size: node.kind === "project-file" ? nodeSizeForLines(activeLineCount(node.lineMetrics, viewState.lineCategories)) : node.size,
      reportNode: node,
    }))
  visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
  const visibleEdges = presentation.edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
  const projectStructure = buildProjectStructure(
    visibleNodes
      .filter(({ reportNode }) => reportNode.kind === "project-file")
      .map(({ id, reportNode }) => ({ id, path: reportNode.kind === "project-file" ? reportNode.path : "" })),
    presentation.projectName,
  )
  structureEdges = projectStructure.edges
  const visibleProjectFilePaths = visibleNodes.flatMap(({ reportNode }) => (reportNode.kind === "project-file" ? [reportNode.path] : []))

  for (const node of visibleNodes) {
    graph.addNode(node.id, {
      size: node.size,
      color: node.color,
      nodeKind: node.reportNode.kind,
      ...(node.reportNode.kind === "project-file" ? { label: projectFileLabel(node.reportNode.path) } : {}),
      x: 0,
      y: 0,
    })
  }
  for (const directory of projectStructure.directories) {
    graph.addNode(directory.id, {
      size: directory.depth === 0 ? ROOT_DIRECTORY_NODE_SIZE : DIRECTORY_NODE_SIZE,
      color: directory.depth === 0 ? "#79b8ff" : "#50677d",
      nodeKind: "directory",
      label: directory.label,
      forceLabel: true,
      directoryDepth: directory.depth,
      descendantProjectFileCount: visibleProjectFilePaths.filter((path) => isProjectFileInDirectory(path, directory.path)).length,
      x: 0,
      y: 0,
    })
  }
  for (const edge of structureEdges) {
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
      edgeKind: "structure",
      hidden: true,
      weight: STRUCTURE_EDGE_WEIGHT,
    })
  }
  for (const edge of visibleEdges) {
    const externalPackage = edge.kind === "external-package"
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
      edgeKind: "dependency",
      type: "arrow",
      color: externalPackage ? EXTERNAL_DEPENDENCY_EDGE_COLOR : DEPENDENCY_EDGE_COLOR,
      size: externalPackage ? 2 : 2.4,
      weight: externalPackage ? EXTERNAL_DEPENDENCY_EDGE_WEIGHT : DEPENDENCY_EDGE_WEIGHT,
    })
  }

  circular.assign(graph)
  forceAtlas2.assign(graph, {
    iterations: 5000,
    settings: {
      adjustSizes: true,
      barnesHutOptimize: false,
      edgeWeightInfluence: 1,
      gravity: 1,
      linLogMode: false,
      outboundAttractionDistribution: false,
      scalingRatio: 6,
      slowDown: 2,
      strongGravityMode: false,
    },
  })

  if (selectedNodeId !== undefined && !visibleNodeIds.has(selectedNodeId)) {
    selectedNodeId = undefined
  }
  if (hoveredNodeId !== undefined && !visibleNodeIds.has(hoveredNodeId)) {
    clearHover()
  } else if (hoveredNodeId !== undefined) {
    const hoveredNode = nodeById.get(hoveredNodeId)
    dependencyFocus = hoveredNode?.kind === "project-file" ? dependencyFocusFor(hoveredNode) : undefined
    updateDependencyFocusDiagnostics()
  }
  for (const control of lineCategoryControls) {
    control.input.disabled = viewState.lineCategories.length === 1 && control.input.checked
  }
  externalPackageToggle.checked = viewState.externalPackages
  for (const input of workspacePackageInputs) {
    input.checked = viewState.workspacePackages.has(input.dataset.workspacePackage ?? "")
  }
  const visibleProjectFileCount = visibleProjectNodeIds.size
  const projectFileNoun = analysis.files.length === 1 ? "project file" : "project files"
  projectFileCount.textContent = `${visibleProjectFileCount} / ${analysis.files.length} ${projectFileNoun}`
  renderProjectFileList()
  renderExternalPackageList()
  renderSelection()
  // Expose otherwise canvas-only state to black-box Playwright tests. Runtime behavior never reads these attributes.
  document.documentElement.dataset.activeLineCategories = viewState.lineCategories.join(",")
  document.documentElement.dataset.externalPackages = viewState.externalPackages ? "visible" : "hidden"
  document.documentElement.dataset.workspacePackages = JSON.stringify([...viewState.workspacePackages])
  graphContainer.dataset.visibleNodeCount = String(visibleNodes.length)
  graphContainer.dataset.visibleEdgeCount = String(visibleEdges.length)
  graphContainer.dataset.graphNodeCount = String(graph.order)
  graphContainer.dataset.directoryNodeCount = String(projectStructure.directories.length)
  graphContainer.dataset.structureEdgeCount = String(structureEdges.length)
  graphContainer.dataset.structureEdgeWeight = String(STRUCTURE_EDGE_WEIGHT)
  graphContainer.dataset.dependencyEdgeWeight = String(DEPENDENCY_EDGE_WEIGHT)
  graphContainer.dataset.externalDependencyEdgeWeight = String(EXTERNAL_DEPENDENCY_EDGE_WEIGHT)
  graphContainer.dataset.visibleNodeColors = JSON.stringify(visibleNodes.map(({ id, color }) => ({ id, color })))
  graphContainer.dataset.layoutSignature = layoutSignature(visibleNodes.map(({ id, size }) => ({ id, size })))
  markGraphLabelVisibilityDirty()
  renderer.refresh()
}

function markGraphLabelVisibilityDirty(): void {
  graphLabelVisibilityDirty = true
}

function synchronizeGraphLabelVisibilityAfterRender(): boolean {
  if (!graphLabelVisibilityDirty) {
    return false
  }
  graphLabelVisibilityDirty = false
  const ratio = camera.getState().ratio
  const nextMaximumDirectoryDepth = visibleDirectoryDepth(ratio)
  const nextShowFileLabels = fileLabelsAreVisible(ratio)
  const directoryLabelCandidatesForViewport = directoryLabelCandidates(nextMaximumDirectoryDepth)
  const nextDirectoryLabels = selectVisibleDirectoryLabels(directoryLabelCandidatesForViewport, renderer.getDimensions())
  const nextDirectoryLabelIds = new Set(nextDirectoryLabels.map(({ id }) => id))
  const directoryLabelsChanged = !setsEqual(visibleDirectoryLabelIds, nextDirectoryLabelIds)
  const fileLabelsChanged = showFileLabels !== nextShowFileLabels

  maximumVisibleDirectoryDepth = nextMaximumDirectoryDepth
  showFileLabels = nextShowFileLabels
  visibleDirectoryLabels = nextDirectoryLabels
  visibleDirectoryLabelIds = nextDirectoryLabelIds
  updateDirectoryLabelDiagnostics(directoryLabelCandidatesForViewport.length)

  if (fileLabelsChanged) {
    // A full refresh rebuilds Sigma's label grid when file labels cross their zoom threshold.
    renderer.scheduleRefresh()
    return true
  } else if (directoryLabelsChanged) {
    renderer.refresh({
      partialGraph: { nodes: graph.filterNodes((_node, attributes) => attributes.nodeKind === "directory") },
      schedule: true,
      skipIndexation: true,
    })
    return true
  }
  return false
}

function directoryLabelCandidates(maximumDepth: number): readonly DirectoryLabelCandidate[] {
  const dimensions = renderer.getDimensions()
  const candidates: DirectoryLabelCandidate[] = []
  structureContext.save()
  structureContext.font = `${LABEL_WEIGHT} ${LABEL_SIZE}px ${LABEL_FONT}`
  graph.forEachNode((id, attributes) => {
    if (
      attributes.nodeKind !== "directory" ||
      attributes.directoryDepth === undefined ||
      attributes.label === undefined ||
      (attributes.directoryDepth > maximumDepth && id !== hoveredDirectoryNodeId)
    ) {
      return
    }

    const node = renderer.graphToViewport(attributes)
    const nodeSize = renderer.scaleSize(attributes.size)
    const text = structureContext.measureText(attributes.label)
    const baseline = node.y + LABEL_SIZE / 3
    const bounds = {
      left: node.x + nodeSize + LABEL_OFFSET - DIRECTORY_LABEL_COLLISION_PADDING,
      top: baseline - Math.max(text.actualBoundingBoxAscent, LABEL_SIZE) - DIRECTORY_LABEL_COLLISION_PADDING,
      right: node.x + nodeSize + LABEL_OFFSET + text.width + DIRECTORY_LABEL_COLLISION_PADDING,
      bottom: baseline + Math.max(text.actualBoundingBoxDescent, 0) + DIRECTORY_LABEL_COLLISION_PADDING,
    }
    if (bounds.right <= 0 || bounds.bottom <= 0 || bounds.left >= dimensions.width || bounds.top >= dimensions.height) {
      return
    }
    candidates.push({
      id,
      label: attributes.label,
      depth: attributes.directoryDepth,
      descendantProjectFileCount: attributes.descendantProjectFileCount ?? 0,
      hovered: id === hoveredDirectoryNodeId,
      nodeX: node.x,
      nodeY: node.y,
      bounds,
    })
  })
  structureContext.restore()
  return candidates
}

function updateDirectoryLabelDiagnostics(candidateCount: number): void {
  graphContainer.dataset.visibleDirectoryLabelDepth = String(maximumVisibleDirectoryDepth)
  graphContainer.dataset.visibleDirectoryLabels = JSON.stringify(visibleDirectoryLabels.map(({ label }) => label))
  graphContainer.dataset.visibleDirectoryLabelRectangles = JSON.stringify(visibleDirectoryLabels)
  graphContainer.dataset.directoryLabelCandidateCount = String(candidateCount)
  graphContainer.dataset.suppressedDirectoryLabelCount = String(candidateCount - visibleDirectoryLabels.length)
}

function updateRenderedLabelDiagnostics(): void {
  const renderedFileLabels: string[] = []
  const renderedDirectoryLabels: string[] = []
  for (const id of renderer.getNodeDisplayedLabels()) {
    if (!graph.hasNode(id)) {
      continue
    }
    const attributes = graph.getNodeAttributes(id)
    if (attributes.label === undefined) {
      continue
    }
    if (attributes.nodeKind === "project-file") {
      renderedFileLabels.push(attributes.label)
    } else if (attributes.nodeKind === "directory") {
      renderedDirectoryLabels.push(attributes.label)
    }
  }
  graphContainer.dataset.renderedFileLabels = JSON.stringify(renderedFileLabels.toSorted())
  graphContainer.dataset.renderedDirectoryLabels = JSON.stringify(renderedDirectoryLabels.toSorted())
}

function updateCameraDiagnostics(): void {
  const state = camera.getState()
  graphContainer.dataset.cameraState = JSON.stringify(state)
  graphContainer.dataset.fileLabelVisibility = showFileLabels ? "visible" : "hidden"
}

function completePendingCameraReset(): void {
  if (!cameraResetAwaitingSettledRender || !fitCurrentGraphInViewport()) {
    return
  }
  cameraResetAwaitingSettledRender = false
  graphContainer.dataset.cameraReset = "complete"
}

function fitCurrentGraphInViewport(): boolean {
  const dimensions = renderer.getDimensions()
  const circles = graphNodeCircles()
  if (
    circles.every(
      ({ x, y, radius }) =>
        x - radius >= GRAPH_FIT_MARGIN &&
        x + radius <= dimensions.width - GRAPH_FIT_MARGIN &&
        y - radius >= GRAPH_FIT_MARGIN &&
        y + radius <= dimensions.height - GRAPH_FIT_MARGIN,
    )
  ) {
    return true
  }

  let ratioMultiplier = 1
  for (const { x, y, radius } of circles) {
    const horizontalHalfExtent = dimensions.width / 2 - GRAPH_FIT_MARGIN
    const verticalHalfExtent = dimensions.height / 2 - GRAPH_FIT_MARGIN
    if (horizontalHalfExtent <= 0 || verticalHalfExtent <= 0) {
      throw new Error("The graph viewport has no drawable area.")
    }
    ratioMultiplier = Math.max(
      ratioMultiplier,
      graphFitRatioMultiplier(Math.abs(x - dimensions.width / 2), radius, horizontalHalfExtent),
      graphFitRatioMultiplier(Math.abs(y - dimensions.height / 2), radius, verticalHalfExtent),
    )
  }
  const state = camera.getState()
  camera.setState({ x: 0.5, y: 0.5, angle: 0, ratio: state.ratio * Math.max(1.01, ratioMultiplier * 1.01) })
  return false
}

function graphFitRatioMultiplier(centerDisplacement: number, radius: number, viewportHalfExtent: number): number {
  // With position-referenced item sizes, a ratio multiplier m scales center
  // displacement by 1/m and radius by 1/sqrt(m). Solve
  // displacement/m + radius/sqrt(m) <= viewportHalfExtent for m.
  const squareRootMultiplier =
    (radius + Math.sqrt(radius * radius + 4 * viewportHalfExtent * centerDisplacement)) / (2 * viewportHalfExtent)
  return squareRootMultiplier * squareRootMultiplier
}

function renderStructureLinks(): void {
  const { width, height } = renderer.getDimensions()
  const pixelRatio = window.devicePixelRatio
  const pixelWidth = Math.max(1, Math.round(width * pixelRatio))
  const pixelHeight = Math.max(1, Math.round(height * pixelRatio))
  if (structureLayer.width !== pixelWidth || structureLayer.height !== pixelHeight) {
    structureLayer.width = pixelWidth
    structureLayer.height = pixelHeight
  }
  structureContext.setTransform(1, 0, 0, 1, 0, 0)
  structureContext.clearRect(0, 0, structureLayer.width, structureLayer.height)
  structureContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  structureContext.beginPath()
  let renderedEdgeCount = 0
  if (edgeVisibilityState.structureEdges) {
    for (const edge of structureEdges) {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) {
        continue
      }
      const source = graph.getNodeAttributes(edge.source)
      const target = graph.getNodeAttributes(edge.target)
      const sourceViewport = renderer.graphToViewport(source)
      const targetViewport = renderer.graphToViewport(target)
      structureContext.moveTo(sourceViewport.x, sourceViewport.y)
      structureContext.lineTo(targetViewport.x, targetViewport.y)
      renderedEdgeCount += 1
    }
  }

  structureContext.setLineDash([2, 4])
  structureContext.lineWidth = 2
  structureContext.strokeStyle = "rgba(111, 130, 149, 0.68)"
  structureContext.stroke()
  structureContext.setLineDash([])
  graphContainer.dataset.structureEdges = edgeVisibilityState.structureEdges ? "visible" : "hidden"
  graphContainer.dataset.renderedStructureEdgeCount = String(renderedEdgeCount)
}

function renderDependencyFocus(): void {
  const { width, height } = renderer.getDimensions()
  const pixelRatio = window.devicePixelRatio
  const pixelWidth = Math.max(1, Math.round(width * pixelRatio))
  const pixelHeight = Math.max(1, Math.round(height * pixelRatio))
  if (dependencyFocusLayer.width !== pixelWidth || dependencyFocusLayer.height !== pixelHeight) {
    dependencyFocusLayer.width = pixelWidth
    dependencyFocusLayer.height = pixelHeight
  }
  dependencyFocusContext.setTransform(1, 0, 0, 1, 0, 0)
  dependencyFocusContext.clearRect(0, 0, dependencyFocusLayer.width, dependencyFocusLayer.height)
  dependencyFocusContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

  let renderedRingCount = 0
  if (dependencyFocus !== undefined) {
    renderedRingCount += drawDependencyFocusRing(dependencyFocus.nodeId, HOVERED_NODE_FOCUS_COLOR, FOCUS_RING_OFFSET, [])
    const neighborNodeIds = new Set([...dependencyFocus.dependencyNodeIds, ...dependencyFocus.consumerNodeIds])
    for (const nodeId of neighborNodeIds) {
      const dependency = dependencyFocus.dependencyNodeIds.has(nodeId)
      const consumer = dependencyFocus.consumerNodeIds.has(nodeId)
      if (dependency) {
        renderedRingCount += drawDependencyFocusRing(nodeId, DEPENDENCY_FOCUS_COLOR, FOCUS_RING_OFFSET, [])
      }
      if (consumer) {
        renderedRingCount += drawDependencyFocusRing(
          nodeId,
          CONSUMER_FOCUS_COLOR,
          FOCUS_RING_OFFSET + (dependency ? FOCUS_RING_SEPARATION : 0),
          [4, 3],
        )
      }
    }
  }
  dependencyFocusContext.setLineDash([])
  graphContainer.dataset.renderedDependencyFocusRingCount = String(renderedRingCount)
}

function drawDependencyFocusRing(nodeId: string, color: string, offset: number, lineDash: readonly number[]): number {
  if (!graph.hasNode(nodeId)) {
    return 0
  }
  const attributes = graph.getNodeAttributes(nodeId)
  const node = renderer.graphToViewport(attributes)
  const radius = renderer.scaleSize(attributes.size) + offset
  dependencyFocusContext.beginPath()
  dependencyFocusContext.setLineDash([...lineDash])
  dependencyFocusContext.lineCap = "round"
  dependencyFocusContext.lineWidth = FOCUS_RING_WIDTH
  dependencyFocusContext.strokeStyle = color
  dependencyFocusContext.arc(node.x, node.y, radius, 0, Math.PI * 2)
  dependencyFocusContext.stroke()
  return 1
}

function updateDependencyEdgeDiagnostics(): void {
  const renderedEdges = dependencyEdgeIds().flatMap((edge) => {
    const displayData = renderer.getEdgeDisplayData(edge)
    return displayData === undefined || displayData.hidden ? [] : [{ id: edge, color: displayData.color, size: displayData.size }]
  })
  graphContainer.dataset.dependencyEdges = edgeVisibilityState.dependencyEdges ? "visible" : "hidden"
  graphContainer.dataset.renderedDependencyEdgeCount = String(renderedEdges.length)
  graphContainer.dataset.renderedDependencyEdges = JSON.stringify(renderedEdges)
}

function dependencyEdgeIds(): string[] {
  return graph.filterEdges((_edge, attributes) => attributes.edgeKind === "dependency")
}

function focusedDependencyEdgeRelationship(edge: string): "dependency" | "consumer" | undefined {
  if (dependencyFocus === undefined) {
    return undefined
  }
  const source = graph.source(edge)
  const target = graph.target(edge)
  if (source === dependencyFocus.nodeId && dependencyFocus.dependencyNodeIds.has(target)) {
    return "dependency"
  }
  if (target === dependencyFocus.nodeId && dependencyFocus.consumerNodeIds.has(source)) {
    return "consumer"
  }
  return undefined
}

function dependencyFocusFor(node: ReportProjectFileNode): DependencyFocus {
  return {
    nodeId: node.id,
    dependencyNodeIds: new Set(visibleRelationships(node.dependencyNodeIds).filter((nodeId) => nodeId !== node.id)),
    consumerNodeIds: new Set(visibleRelationships(node.consumerNodeIds).filter((nodeId) => nodeId !== node.id)),
  }
}

function updateDependencyFocusDiagnostics(): void {
  if (dependencyFocus === undefined) {
    delete graphContainer.dataset.dependencyFocus
    return
  }
  graphContainer.dataset.dependencyFocus = JSON.stringify({
    nodeId: dependencyFocus.nodeId,
    dependencyNodeIds: [...dependencyFocus.dependencyNodeIds],
    consumerNodeIds: [...dependencyFocus.consumerNodeIds],
  })
}

function refreshDependencyEdges(): void {
  renderer.refresh({
    partialGraph: { edges: dependencyEdgeIds() },
    schedule: true,
    skipIndexation: true,
  })
}

function drawNodeHover(
  context: Parameters<BrowserNodeHoverDrawingFunction>[0],
  data: Parameters<BrowserNodeHoverDrawingFunction>[1],
  settings: Parameters<BrowserNodeHoverDrawingFunction>[2],
): void {
  if (typeof data.key !== "string" || !data.key.startsWith("directory:")) {
    drawDiscNodeHover(context, data, settings)
    return
  }

  context.save()
  context.strokeStyle = DIRECTORY_LABEL_HOVER_FOREGROUND
  context.lineWidth = 2
  context.beginPath()
  context.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2)
  context.stroke()

  if (typeof data.label === "string") {
    context.font = `${settings.labelWeight} ${settings.labelSize}px ${settings.labelFont}`
    const labelX = data.x + data.size + LABEL_OFFSET
    const labelBaseline = data.y + settings.labelSize / 3
    const labelWidth = context.measureText(data.label).width
    context.fillStyle = DIRECTORY_LABEL_HOVER_BACKGROUND
    context.fillRect(
      labelX - DIRECTORY_LABEL_COLLISION_PADDING,
      labelBaseline - settings.labelSize - DIRECTORY_LABEL_COLLISION_PADDING,
      labelWidth + DIRECTORY_LABEL_COLLISION_PADDING * 2,
      settings.labelSize + DIRECTORY_LABEL_COLLISION_PADDING * 2,
    )
    context.fillStyle = DIRECTORY_LABEL_HOVER_FOREGROUND
    context.fillText(data.label, labelX, labelBaseline)
  }
  context.restore()
}

function requiredCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d")
  if (context === null) {
    throw new Error("Could not create the project structure canvas.")
  }
  return context
}

function renderProjectFileList(): void {
  fileList.replaceChildren()
  const visibleProjectFiles = presentation.nodes.filter(
    (node): node is ReportProjectFileNode => node.kind === "project-file" && visibleNodeIds.has(node.id),
  )
  const tree = buildProjectFileTree(visibleProjectFiles, fileSearch.value)
  fileList.append(...tree.map(projectFileTreeItem))

  const emptyMessage = projectFileTreeEmptyMessage(visibleProjectFiles.length, tree.length)
  fileTreeEmpty.hidden = emptyMessage === undefined
  fileList.hidden = emptyMessage !== undefined
  if (emptyMessage !== undefined) {
    fileTreeEmpty.textContent = emptyMessage
  }
}

function projectFileTreeItem(entry: ProjectFileTreeEntry): HTMLLIElement {
  if (entry.kind === "file") {
    return projectFileTreeFileItem(entry)
  }

  const item = document.createElement("li")
  item.className = "file-tree-directory"
  const button = document.createElement("button")
  button.type = "button"
  button.className = "file-tree-directory-toggle"
  button.textContent = entry.name
  button.title = entry.path
  button.dataset.directoryPath = entry.path
  const children = document.createElement("ol")
  children.className = "file-tree-children"
  children.append(...entry.children.map(projectFileTreeItem))
  const expanded = !collapsedDirectoryPaths.has(entry.path)
  button.setAttribute("aria-expanded", String(expanded))
  children.hidden = !expanded
  button.addEventListener("click", () => {
    if (collapsedDirectoryPaths.has(entry.path)) {
      collapsedDirectoryPaths.delete(entry.path)
    } else {
      collapsedDirectoryPaths.add(entry.path)
    }
    renderProjectFileList()
  })
  item.append(button, children)
  return item
}

function projectFileTreeFileItem(entry: ProjectFileTreeFile): HTMLLIElement {
  const node = nodeById.get(entry.id)
  if (node === undefined || node.kind !== "project-file") {
    throw new Error(`Files tree references missing project node ${entry.id}.`)
  }

  const item = document.createElement("li")
  item.className = "file-tree-file"
  const button = nodeListButton(node, entry.name)
  button.setAttribute("aria-label", node.displayName)
  button.addEventListener("pointerenter", () => {
    bringNodeIntoView(node.id)
  })
  item.append(button)
  return item
}

function projectFileTreeEmptyMessage(visibleFileCount: number, treeEntryCount: number): string | undefined {
  if (visibleFileCount === 0) {
    return analysis.files.length === 0
      ? "This report contains no project files."
      : "No project files are visible. Select a workspace package to show files."
  }
  if (treeEntryCount === 0) {
    return "No project files match this search."
  }
  return undefined
}

function selectNode(nodeId: string | undefined): void {
  selectedNodeId = nodeId === undefined || visibleNodeIds.has(nodeId) ? nodeId : undefined
  renderSelection()
  renderer.refresh()
}

function renderSelection(): void {
  for (const button of document.querySelectorAll<HTMLElement>(".node-list button[data-node-id]")) {
    button.setAttribute("aria-current", button.dataset.nodeId === selectedNodeId ? "true" : "false")
  }

  const selectedNode = selectedNodeId === undefined ? undefined : nodeById.get(selectedNodeId)
  clearSelection.hidden = selectedNode === undefined
  if (selectedNode === undefined) {
    delete document.documentElement.dataset.selectedNode
  } else {
    document.documentElement.dataset.selectedNode = selectedNode.id
  }

  const nodeIdToDisplay = hoveredNodeId ?? selectedNodeId
  const node = nodeIdToDisplay === undefined ? undefined : nodeById.get(nodeIdToDisplay)
  selectedEmpty.hidden = node !== undefined
  selectedDetails.hidden = node === undefined
  if (node === undefined) {
    selectedHeading.textContent = "Selected node"
    return
  }

  const projectFile = node.kind === "project-file"
  const interaction = hoveredNodeId === undefined ? "Selected" : "Hovered"
  selectedHeading.textContent = `${interaction} ${projectFile ? "project file" : "external package"}`
  selectedNodeType.textContent = projectFile ? "Project file" : "External package"
  selectedPath.textContent = node.displayName
  for (const element of projectFileDetailElements) {
    element.hidden = !projectFile
  }
  if (projectFile) {
    showProjectFileDetails(node)
  }
  const dependencyNodeIds = visibleRelationships(node.dependencyNodeIds)
  const consumerNodeIds = visibleRelationships(node.consumerNodeIds)
  selectedDependencies.textContent = String(dependencyNodeIds.length)
  selectedConsumers.textContent = String(consumerNodeIds.length)
  renderRelatedNodes(selectedDependencyNodes, dependencyNodeIds)
  renderRelatedNodes(selectedConsumerNodes, consumerNodeIds)
}

function showProjectFileDetails(node: ReportProjectFileNode): void {
  selectedCodeLines.textContent = String(node.lineMetrics.code)
  selectedCommentLines.textContent = String(node.lineMetrics.comment)
  selectedBlankLines.textContent = String(node.lineMetrics.blank)
  selectedCoverage.textContent = coverageLabel(node.coverage)
}

function renderRelatedNodes(container: HTMLElement, relatedNodeIds: readonly string[]): void {
  container.replaceChildren()
  if (relatedNodeIds.length === 0) {
    const empty = document.createElement("li")
    empty.className = "relationship-empty"
    empty.textContent = "None"
    container.append(empty)
    return
  }
  for (const nodeId of relatedNodeIds) {
    const node = nodeById.get(nodeId)
    if (node !== undefined) {
      container.append(nodeListItem(node))
    }
  }
}

function renderExternalPackageList(): void {
  externalPackageList.replaceChildren()
  externalPackageSection.hidden = !viewState.externalPackages
  if (!viewState.externalPackages) {
    return
  }
  for (const node of presentation.nodes) {
    if (node.kind === "external-package" && visibleNodeIds.has(node.id)) {
      externalPackageList.append(nodeListItem(node))
    }
  }
}

function nodeListItem(node: ReportNode): HTMLLIElement {
  // DOM list buttons are keyboard-accessible navigation counterparts to the WebGL nodes.
  const item = document.createElement("li")
  item.append(nodeListButton(node, node.displayName))
  return item
}

function nodeListButton(node: ReportNode, label: string): HTMLButtonElement {
  const button = document.createElement("button")
  button.type = "button"
  button.append(document.createTextNode(label))
  if (node.kind === "external-package") {
    const kind = document.createElement("span")
    kind.className = "node-kind-label"
    kind.textContent = "External package"
    button.append(kind)
  }
  button.title = node.displayName
  button.dataset.nodeId = node.id
  button.setAttribute("aria-current", node.id === selectedNodeId ? "true" : "false")
  button.addEventListener("click", () => {
    selectNode(node.id)
  })
  return button
}

function bringNodeIntoView(nodeId: string): void {
  const node = renderer.getNodeDisplayData(nodeId)
  if (node === undefined) {
    return
  }

  delete graphContainer.dataset.cameraFocusedNode
  camera.animate({ x: node.x, y: node.y }, { duration: 250 }, () => {
    graphContainer.dataset.cameraFocusedNode = nodeId
  })
}

function updateGraphNodeCircleDiagnostics(): void {
  graphContainer.dataset.visibleNodePositions = JSON.stringify(graphNodeCircles())
}

function graphNodeCircles(): readonly GraphNodeCircle[] {
  return graph.nodes().map((id) => {
    const attributes = graph.getNodeAttributes(id)
    return {
      id,
      ...renderer.graphToViewport(attributes),
      radius: renderer.scaleSize(attributes.size),
    }
  })
}

function renderCoverageLegend(): void {
  coverageLegend.replaceChildren()
  const title = document.createElement("span")
  title.className = "coverage-legend-title"
  title.textContent = "Line coverage"
  const scale = document.createElement("span")
  scale.className = "coverage-legend-scale"
  const gradient = document.createElement("i")
  gradient.className = "coverage-legend-gradient"
  gradient.setAttribute("aria-hidden", "true")
  const coverageGradientColors = COVERAGE_LEGEND_ENTRIES.filter(({ coverage }) => coverage !== undefined).map(({ coverage }) =>
    coverageColor(coverage),
  )
  gradient.style.backgroundImage = `linear-gradient(to right, ${coverageGradientColors.join(", ")})`
  scale.append(gradient)
  coverageLegend.append(title, scale)

  for (const entry of COVERAGE_LEGEND_ENTRIES) {
    const label = document.createElement("span")
    label.className = "coverage-legend-entry"
    label.dataset.coverageLegendEntry = entry.id
    const swatch = document.createElement("i")
    swatch.className = "coverage-legend-swatch"
    swatch.setAttribute("aria-hidden", "true")
    swatch.style.backgroundColor = coverageColor(entry.coverage)
    label.append(swatch, document.createTextNode(entry.label))
    coverageLegend.append(label)
  }
}

function visibleRelationships(nodeIds: readonly string[]): readonly string[] {
  // Relationship facts cover the complete presentation, but counts and navigation describe the current visible subgraph.
  return nodeIds.filter((nodeId) => visibleNodeIds.has(nodeId))
}

function clearHover(): void {
  const directoryLabelVisibilityChanged = hoveredDirectoryNodeId !== undefined
  const dependencyFocusChanged = dependencyFocus !== undefined
  hoveredNodeId = undefined
  hoveredDirectoryNodeId = undefined
  dependencyFocus = undefined
  delete document.documentElement.dataset.hoveredNode
  delete graphContainer.dataset.hoveredDirectoryLabel
  delete graphContainer.dataset.directoryLabelHoverForeground
  delete graphContainer.dataset.directoryLabelHoverBackground
  updateDependencyFocusDiagnostics()
  renderSelection()
  if (dependencyFocusChanged) {
    refreshDependencyEdges()
  }
  if (directoryLabelVisibilityChanged) {
    markGraphLabelVisibilityDirty()
    renderer.scheduleRender()
  }
}

function coverageLabel(coverage: number | undefined): string {
  return coverage === undefined ? "Not available" : `${coverage}%`
}

function selectedLineCategories(): readonly ReportLineCategory[] {
  return lineCategoryControls.filter(({ input }) => input.checked).map(({ category }) => category)
}

function projectFileLabel(path: string): string {
  return path.split("/").at(-1) ?? path
}

function isProjectFileInDirectory(filePath: string, directoryPath: string): boolean {
  return directoryPath === "" || filePath.startsWith(`${directoryPath}/`)
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value))
}

function requiredElement(id: string): HTMLElement {
  // A missing element means the generated HTML shell and embedded browser bundle are incompatible, so fail during boot.
  const element = document.getElementById(id)
  if (element === null) {
    throw new Error(`Static report is missing #${id}.`)
  }
  return element
}

function requiredCheckbox(id: string): HTMLInputElement {
  const element = requiredElement(id)
  if (!(element instanceof HTMLInputElement) || element.type !== "checkbox") {
    throw new Error("Static report #" + id + " is not a checkbox.")
  }
  return element
}

function requiredButton(id: string): HTMLButtonElement {
  const element = requiredElement(id)
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error("Static report #" + id + " is not a button.")
  }
  return element
}

function requiredSearchInput(id: string): HTMLInputElement {
  const element = requiredElement(id)
  if (!(element instanceof HTMLInputElement) || element.type !== "search") {
    throw new Error("Static report #" + id + " is not a search input.")
  }
  return element
}

/**
 * Fingerprint the ordered visible-node descriptors for Playwright assertions.
 *
 * This non-cryptographic signature proves that layout inputs changed or were
 * restored. It is not a signature of the ForceAtlas2 output and does not verify
 * final coordinates or collision behavior.
 */
function layoutSignature(nodes: ReadonlyArray<{ readonly id: string; readonly size: number }>): string {
  let hash = 2_166_136_261
  for (const character of JSON.stringify(nodes)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(16)
}
