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
import Sigma from "sigma"
import { createEdgeArrowProgram } from "sigma/rendering"
import type { NodeDisplayData } from "sigma/types"
import { PROJECT_ANALYSIS_SCHEMA_VERSION, type ProjectAnalysis } from "../../analysis/project-analysis.js"
import { visibleDirectoryDepth } from "./directory-label-visibility.js"
import { buildProjectStructure, type ProjectStructureEdge } from "./project-structure.js"
import {
  activeLineCount,
  buildBrowserPresentation,
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

const TOOLTIP_OFFSET = 14
const VIEWPORT_MARGIN = 10
const DIRECTORY_NODE_SIZE = 9
const ROOT_DIRECTORY_NODE_SIZE = 15
const STRUCTURE_EDGE_WEIGHT = 6
const DEPENDENCY_EDGE_WEIGHT = 0.25
const EXTERNAL_DEPENDENCY_EDGE_WEIGHT = 1.2

type BrowserNodeAttributes = {
  readonly size: number
  readonly color: string
  readonly x: number
  readonly y: number
  readonly label?: string
  readonly forceLabel?: boolean
  readonly directoryDepth?: number
}

type ReportViewState = {
  /** Always non-empty; these categories affect project-file size, not the metrics displayed in details. */
  readonly lineCategories: readonly ReportLineCategory[]
  /** Controls graph membership and therefore which relationships are visible. */
  readonly externalPackages: boolean
  /** Workspace packages whose owned project files participate in the visible graph. */
  readonly workspacePackages: ReadonlySet<string>
}

const analysis = window.showMeAnalysis
if (Number(analysis.schemaVersion) !== PROJECT_ANALYSIS_SCHEMA_VERSION) {
  throw new Error("Unsupported project analysis schema version: " + String(analysis.schemaVersion) + ".")
}
const presentation = buildBrowserPresentation(analysis)
const graphContainer = requiredElement("graph")
const projectName = requiredElement("project-name")
const projectFileCount = requiredElement("project-file-count")
const tooltip = requiredElement("tooltip")
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
const fileList = requiredElement("file-list")
const externalPackageSection = requiredElement("external-package-section")
const externalPackageList = requiredElement("external-package-list")
const externalPackageToggle = requiredCheckbox("external-packages-toggle")
const workspacePackageFieldset = requiredElement("workspace-package-fieldset")
const workspacePackageControls = requiredElement("workspace-package-controls")
const lineCategoryControls = REPORT_LINE_CATEGORIES.map((category) => ({
  category,
  input: requiredCheckbox("line-category-" + category),
}))
const projectFileDetailElements = document.querySelectorAll<HTMLElement>("[data-project-file-detail]")
document.title = `${presentation.projectName} · Show Me`
projectName.textContent = presentation.projectName
projectFileCount.textContent = `${analysis.files.length} project files`

// This index covers the complete derived presentation. The Graphology graph and
// visibleNodeIds below contain only the projection selected by the current view.
const nodeById = new Map(presentation.nodes.map((node) => [node.id, node]))
const graph = new DirectedGraph<BrowserNodeAttributes>()
let selectedNodeId: string | undefined
let hoveredNodeId: string | undefined
let visibleNodeIds = new Set<string>()
let viewState: ReportViewState = {
  lineCategories: ["code"],
  externalPackages: false,
  workspacePackages: new Set(presentation.workspacePackages.map((workspacePackage) => workspacePackage.path)),
}
let structureEdges: readonly ProjectStructureEdge[] = []
let maximumVisibleDirectoryDepth = visibleDirectoryDepth(1)
const renderer = new Sigma<BrowserNodeAttributes>(graph, graphContainer, {
  allowInvalidContainer: false,
  defaultEdgeType: "arrow",
  edgeProgramClasses: { arrow: createEdgeArrowProgram<BrowserNodeAttributes>() },
  labelColor: { color: "#aebdca" },
  labelFont: "ui-monospace, SFMono-Regular, Consolas, monospace",
  labelRenderedSizeThreshold: Number.POSITIVE_INFINITY,
  labelSize: 11,
  labelWeight: "500",
  // ForceAtlas2 and Sigma interpret node radii in the same graph-coordinate system.
  itemSizesReference: "positions",
  nodeReducer(node, attributes): Partial<NodeDisplayData> {
    const directoryLabel =
      attributes.directoryDepth === undefined || attributes.directoryDepth <= maximumVisibleDirectoryDepth
        ? {}
        : { label: null, forceLabel: false }
    return node === selectedNodeId
      ? { ...attributes, ...directoryLabel, color: "#f4c66a", highlighted: true, zIndex: 1 }
      : { ...attributes, ...directoryLabel }
  },
  zIndex: true,
})
const structureLayer = renderer.createCanvas("structure", {
  beforeLayer: "edges",
  style: { pointerEvents: "none" },
})
const structureContext = requiredCanvasContext(structureLayer)
const camera = renderer.getCamera()
maximumVisibleDirectoryDepth = visibleDirectoryDepth(camera.getState().ratio)
camera.on("updated", ({ ratio }) => {
  const nextVisibleDepth = visibleDirectoryDepth(ratio)
  if (nextVisibleDepth === maximumVisibleDirectoryDepth) {
    return
  }
  maximumVisibleDirectoryDepth = nextVisibleDepth
  updateDirectoryLabelDiagnostics()
  renderer.refresh({
    partialGraph: { nodes: graph.filterNodes((_node, attributes) => attributes.directoryDepth !== undefined) },
    skipIndexation: true,
  })
})
renderer.resize(true)
renderer.on("afterRender", renderStructureLinks)

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

renderer.on("enterNode", ({ node, event }) => {
  const reportNode = nodeById.get(node)
  if (reportNode === undefined) {
    return
  }
  hoveredNodeId = node
  showTooltip(reportNode)
  positionTooltip(event.x, event.y)
  document.documentElement.dataset.hoveredNode = node
})
renderer.on("moveBody", ({ event }) => {
  if (hoveredNodeId !== undefined) {
    positionTooltip(event.x, event.y)
  }
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

applyReportView(viewState)
// The graph and interaction state are initialized synchronously. Sigma may still
// paint the resulting WebGL frame on the next animation frame.
document.documentElement.dataset.showMeReady = "true"

/**
 * Apply the complete browser view transition from presentation data derived from immutable analysis.
 *
 * Rebuilding the visible graph keeps line sizing and package visibility
 * composable and ensures hidden nodes and edges cannot affect layout,
 * relationship counts, hover, or selection.
 */
function applyReportView(nextState: ReportViewState): void {
  graph.clear()
  structureEdges = []
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

  for (const node of visibleNodes) {
    graph.addNode(node.id, { size: node.size, color: node.color, x: 0, y: 0 })
  }
  for (const directory of projectStructure.directories) {
    graph.addNode(directory.id, {
      size: directory.depth === 0 ? ROOT_DIRECTORY_NODE_SIZE : DIRECTORY_NODE_SIZE,
      color: directory.depth === 0 ? "#79b8ff" : "#50677d",
      label: directory.label,
      forceLabel: true,
      directoryDepth: directory.depth,
      x: 0,
      y: 0,
    })
  }
  for (const edge of structureEdges) {
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
      hidden: true,
      weight: STRUCTURE_EDGE_WEIGHT,
    })
  }
  for (const edge of visibleEdges) {
    const externalPackage = edge.kind === "external-package"
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
      type: "arrow",
      color: externalPackage ? "#9a68c1" : "#628bb5",
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
  }
  for (const control of lineCategoryControls) {
    control.input.disabled = viewState.lineCategories.length === 1 && control.input.checked
  }
  externalPackageToggle.checked = viewState.externalPackages
  for (const input of workspacePackageInputs) {
    input.checked = viewState.workspacePackages.has(input.dataset.workspacePackage ?? "")
  }
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
  updateDirectoryLabelDiagnostics()
  graphContainer.dataset.visibleNodeColors = JSON.stringify(visibleNodes.map(({ id, color }) => ({ id, color })))
  graphContainer.dataset.layoutSignature = layoutSignature(visibleNodes.map(({ id, size }) => ({ id, size })))
  renderer.refresh()
  graphContainer.dataset.visibleNodePositions = JSON.stringify(
    visibleNodes.map(({ id }) => ({ id, ...renderer.graphToViewport(graph.getNodeAttributes(id)) })),
  )
}

function updateDirectoryLabelDiagnostics(): void {
  const visibleDirectoryLabels: string[] = []
  graph.forEachNode((_node, attributes) => {
    if (
      attributes.directoryDepth !== undefined &&
      attributes.directoryDepth <= maximumVisibleDirectoryDepth &&
      attributes.label !== undefined
    ) {
      visibleDirectoryLabels.push(attributes.label)
    }
  })
  graphContainer.dataset.visibleDirectoryLabelDepth = String(maximumVisibleDirectoryDepth)
  graphContainer.dataset.visibleDirectoryLabels = JSON.stringify(visibleDirectoryLabels)
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
  }

  structureContext.setLineDash([2, 4])
  structureContext.lineWidth = 2
  structureContext.strokeStyle = "rgba(111, 130, 149, 0.68)"
  structureContext.stroke()
  structureContext.setLineDash([])
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
  for (const node of presentation.nodes) {
    if (node.kind === "project-file" && visibleNodeIds.has(node.id)) {
      fileList.append(nodeListItem(node))
    }
  }
}

function selectNode(nodeId: string | undefined): void {
  selectedNodeId = nodeId === undefined || visibleNodeIds.has(nodeId) ? nodeId : undefined
  renderSelection()
  renderer.refresh()
}

function renderSelection(): void {
  for (const button of document.querySelectorAll<HTMLElement>(".node-list button")) {
    button.setAttribute("aria-current", button.dataset.nodeId === selectedNodeId ? "true" : "false")
  }

  const node = selectedNodeId === undefined ? undefined : nodeById.get(selectedNodeId)
  clearSelection.hidden = node === undefined
  selectedEmpty.hidden = node !== undefined
  selectedDetails.hidden = node === undefined
  if (node === undefined) {
    selectedHeading.textContent = "Selected node"
    delete document.documentElement.dataset.selectedNode
    return
  }

  const projectFile = node.kind === "project-file"
  selectedHeading.textContent = projectFile ? "Selected project file" : "Selected external package"
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
  document.documentElement.dataset.selectedNode = node.id
}

function showProjectFileDetails(node: ReportProjectFileNode): void {
  selectedCodeLines.textContent = String(node.lineMetrics.code)
  selectedCommentLines.textContent = String(node.lineMetrics.comment)
  selectedBlankLines.textContent = String(node.lineMetrics.blank)
  selectedCoverage.textContent = node.coverage === undefined ? "Not available" : `${node.coverage}%`
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
  const button = document.createElement("button")
  button.type = "button"
  button.append(document.createTextNode(node.displayName))
  if (node.kind === "external-package") {
    const kind = document.createElement("span")
    kind.className = "node-kind-label"
    kind.textContent = "External package"
    button.append(kind)
  }
  button.title = node.displayName
  button.dataset.nodeId = node.id
  button.addEventListener("click", () => {
    selectNode(node.id)
  })
  item.append(button)
  return item
}

function showTooltip(node: ReportNode): void {
  tooltip.replaceChildren()
  const kind = document.createElement("span")
  kind.className = "tooltip-node-kind"
  kind.textContent = node.kind === "project-file" ? "Project file" : "External package"
  const name = document.createElement("strong")
  name.textContent = node.tooltipName
  name.title = node.displayName
  const dependencyNodeIds = visibleRelationships(node.dependencyNodeIds)
  const consumerNodeIds = visibleRelationships(node.consumerNodeIds)
  const metricElements = []
  if (node.kind === "project-file") {
    metricElements.push(
      metric("Code", node.lineMetrics.code),
      metric("Comments", node.lineMetrics.comment),
      metric("Blank", node.lineMetrics.blank),
    )
  }
  metricElements.push(metric("Dependencies", dependencyNodeIds.length), metric("Consumers", consumerNodeIds.length))
  if (node.kind === "project-file" && node.coverage !== undefined) {
    metricElements.push(metric("Coverage", `${node.coverage}%`))
  }
  const metrics = document.createElement("div")
  metrics.className = "tooltip-metrics"
  metrics.append(...metricElements)
  tooltip.append(kind, name, metrics)
  tooltip.hidden = false
}

function visibleRelationships(nodeIds: readonly string[]): readonly string[] {
  // Relationship facts cover the complete presentation, but counts and navigation describe the current visible subgraph.
  return nodeIds.filter((nodeId) => visibleNodeIds.has(nodeId))
}

function clearHover(): void {
  hoveredNodeId = undefined
  tooltip.hidden = true
  delete document.documentElement.dataset.hoveredNode
}

function positionTooltip(pointerX: number, pointerY: number): void {
  // Sigma reports pointer coordinates relative to its container while the fixed
  // tooltip uses viewport coordinates. Convert before flipping and clamping.
  const graphBounds = graphContainer.getBoundingClientRect()
  const tooltipBounds = tooltip.getBoundingClientRect()
  const pointerViewportX = graphBounds.left + pointerX
  const pointerViewportY = graphBounds.top + pointerY
  let left = pointerViewportX + TOOLTIP_OFFSET
  if (left + tooltipBounds.width > window.innerWidth - VIEWPORT_MARGIN) {
    left = pointerViewportX - tooltipBounds.width - TOOLTIP_OFFSET
  }
  let top = pointerViewportY + TOOLTIP_OFFSET
  if (top + tooltipBounds.height > window.innerHeight - VIEWPORT_MARGIN) {
    top = pointerViewportY - tooltipBounds.height - TOOLTIP_OFFSET
  }
  tooltip.style.left = `${Math.max(VIEWPORT_MARGIN, left)}px`
  tooltip.style.top = `${Math.max(VIEWPORT_MARGIN, top)}px`
}

function metric(label: string, value: number | string): HTMLElement {
  const container = document.createElement("div")
  const number = document.createElement("span")
  number.textContent = String(value)
  container.append(number, label)
  return container
}

function selectedLineCategories(): readonly ReportLineCategory[] {
  return lineCategoryControls.filter(({ input }) => input.checked).map(({ category }) => category)
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
