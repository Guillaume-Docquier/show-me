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

type BrowserNodeAttributes = {
  readonly size: number
  readonly color: string
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
const selectedImports = requiredElement("selected-imports")
const selectedConsumers = requiredElement("selected-consumers")
const selectedCoverage = requiredElement("selected-coverage")
const selectedImportedNodes = requiredElement("selected-imported-files")
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
const renderer = new Sigma<BrowserNodeAttributes>(graph, graphContainer, {
  allowInvalidContainer: false,
  defaultEdgeType: "arrow",
  edgeProgramClasses: { arrow: createEdgeArrowProgram<BrowserNodeAttributes>() },
  // Node names live in the accessible DOM lists, tooltip, and details panel rather than on the WebGL canvas.
  labelRenderedSizeThreshold: Number.POSITIVE_INFINITY,
  // ForceAtlas2 and Sigma must interpret node radii in the same coordinate system for adjustSizes to prevent overlap.
  itemSizesReference: "positions",
  nodeReducer(node, attributes): Partial<NodeDisplayData> {
    // Graphology announces new nodes before the layout assigns x/y. Temporary
    // coordinates keep Sigma's display data valid; the spread lets real layout
    // coordinates override them once present.
    return node === selectedNodeId
      ? { x: 0, y: 0, ...attributes, color: "#f4c66a", highlighted: true, zIndex: 1 }
      : { x: 0, y: 0, ...attributes }
  },
  zIndex: true,
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
    }))
  visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
  const visibleEdges = presentation.edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))

  for (const node of visibleNodes) {
    graph.addNode(node.id, { size: node.size, color: node.color })
  }
  for (const edge of visibleEdges) {
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
      type: "arrow",
      color: edge.kind === "external-package" ? "#7c4aa5" : "#405267",
      size: 2,
    })
  }

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
  graphContainer.dataset.visibleNodeColors = JSON.stringify(visibleNodes.map(({ id, color }) => ({ id, color })))
  graphContainer.dataset.layoutSignature = layoutSignature(visibleNodes)
  // Index the rebuilt graph while nodeReducer supplies temporary coordinates.
  // The layout mutations below cause Sigma to schedule the final repaint.
  renderer.refresh()

  // ForceAtlas2 requires non-degenerate starting coordinates. Circular layout is
  // deterministic for the presentation's stable insertion order, then the
  // synchronous ForceAtlas2 pass refines the visible graph before this transition returns.
  circular.assign(graph)
  forceAtlas2.assign(graph, {
    iterations: 5000,
    settings: {
      adjustSizes: true,
      // ForceAtlas2's Barnes-Hut branch does not include node radii in its repulsion calculation.
      barnesHutOptimize: false,
      gravity: 3,
      scalingRatio: 6,
      slowDown: 1.5,
      outboundAttractionDistribution: true,
    },
  })
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
  const importedNodeIds = visibleRelationships(node.importedNodeIds)
  const consumerNodeIds = visibleRelationships(node.consumerNodeIds)
  selectedImports.textContent = String(importedNodeIds.length)
  selectedConsumers.textContent = String(consumerNodeIds.length)
  renderRelatedNodes(selectedImportedNodes, importedNodeIds)
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
  const importedNodeIds = visibleRelationships(node.importedNodeIds)
  const consumerNodeIds = visibleRelationships(node.consumerNodeIds)
  const metricElements = []
  if (node.kind === "project-file") {
    metricElements.push(
      metric("Code", node.lineMetrics.code),
      metric("Comments", node.lineMetrics.comment),
      metric("Blank", node.lineMetrics.blank),
    )
  }
  metricElements.push(metric("Imports", importedNodeIds.length), metric("Consumers", consumerNodeIds.length))
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
