import { DirectedGraph } from "graphology"
import Sigma from "sigma"
import { createEdgeArrowProgram } from "sigma/rendering"
import type { Extent, NodeDisplayData } from "sigma/types"
import { layoutReportGraph } from "../report-layout.js"
import {
  activeLineCount,
  nodeSizeForLines,
  REPORT_LINE_CATEGORIES,
  type ReportLineCategory,
  type ReportNode,
  type ReportPresentation,
  type ReportProjectFileNode,
} from "../report-presentation.js"

declare global {
  interface Window {
    readonly showMePresentation: ReportPresentation
  }
}

const TOOLTIP_OFFSET = 14
const VIEWPORT_MARGIN = 10
const MINIMUM_LAYOUT_SPAN = 600

type BrowserNodeAttributes = {
  readonly x: number
  readonly y: number
  readonly size: number
  readonly color: string
}

type ReportViewState = {
  readonly lineCategories: readonly ReportLineCategory[]
  readonly externalPackages: boolean
}

const presentation = window.showMePresentation
const graphContainer = requiredElement("graph")
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
const lineCategoryControls = REPORT_LINE_CATEGORIES.map((category) => ({
  category,
  input: requiredCheckbox("line-category-" + category),
}))
const projectFileDetailElements = document.querySelectorAll<HTMLElement>("[data-project-file-detail]")
const nodeById = new Map(presentation.nodes.map((node) => [node.id, node]))
const graph = new DirectedGraph<BrowserNodeAttributes>()
let selectedNodeId: string | undefined
let hoveredNodeId: string | undefined
let visibleNodeIds = new Set<string>()
let viewState: ReportViewState = { lineCategories: ["code"], externalPackages: false }
const renderer = new Sigma<BrowserNodeAttributes>(graph, graphContainer, {
  allowInvalidContainer: false,
  defaultEdgeType: "arrow",
  edgeProgramClasses: { arrow: createEdgeArrowProgram<BrowserNodeAttributes>() },
  labelRenderedSizeThreshold: Number.POSITIVE_INFINITY,
  itemSizesReference: "positions",
  nodeReducer(node, attributes): Partial<NodeDisplayData> {
    return node === selectedNodeId ? { ...attributes, color: "#f4c66a", highlighted: true, zIndex: 1 } : attributes
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

for (const node of presentation.nodes) {
  if (node.kind === "project-file") {
    fileList.append(nodeListItem(node))
  }
}
applyReportView(viewState)
document.documentElement.dataset.showMeReady = "true"

function applyReportView(nextState: ReportViewState): void {
  viewState = nextState
  const visibleNodes = presentation.nodes.filter((node) => node.kind === "project-file" || viewState.externalPackages)
  visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
  const visibleEdges = presentation.edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
  const layout = layoutReportGraph(
    visibleNodes.map((node) => ({
      id: node.id,
      size: node.kind === "project-file" ? nodeSizeForLines(activeLineCount(node.lineMetrics, viewState.lineCategories)) : node.size,
    })),
    visibleEdges,
  )
  const layoutByNodeId = new Map(layout.map((node) => [node.id, node]))

  graph.clear()
  for (const node of visibleNodes) {
    const nodeLayout = layoutByNodeId.get(node.id)
    if (nodeLayout === undefined) {
      throw new Error("Report layout omitted visible node " + node.id + ".")
    }
    graph.addNode(node.id, { x: nodeLayout.x, y: nodeLayout.y, size: nodeLayout.size, color: node.color })
  }
  for (const edge of visibleEdges) {
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
      type: "arrow",
      color: edge.kind === "external-package" ? "#7c4aa5" : "#405267",
      size: 1,
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
  renderExternalPackageList()
  renderSelection()
  document.documentElement.dataset.activeLineCategories = viewState.lineCategories.join(",")
  document.documentElement.dataset.externalPackages = viewState.externalPackages ? "visible" : "hidden"
  graphContainer.dataset.visibleNodeCount = String(visibleNodes.length)
  graphContainer.dataset.layoutSignature = layoutSignature(layout)
  renderer.setCustomBBox(layoutBounds(layout))
  renderer.refresh()
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
    if (node.kind === "external-package") {
      externalPackageList.append(nodeListItem(node))
    }
  }
}

function nodeListItem(node: ReportNode): HTMLLIElement {
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
  return nodeIds.filter((nodeId) => visibleNodeIds.has(nodeId))
}

function clearHover(): void {
  hoveredNodeId = undefined
  tooltip.hidden = true
  delete document.documentElement.dataset.hoveredNode
}

function positionTooltip(pointerX: number, pointerY: number): void {
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

function layoutSignature(
  nodes: ReadonlyArray<{ readonly id: string; readonly x: number; readonly y: number; readonly size: number }>,
): string {
  let hash = 2_166_136_261
  for (const character of JSON.stringify(nodes)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(16)
}

function layoutBounds(nodes: ReadonlyArray<{ readonly x: number; readonly y: number; readonly size: number }>): {
  readonly x: Extent
  readonly y: Extent
} {
  if (nodes.length === 0) {
    const halfSpan = MINIMUM_LAYOUT_SPAN / 2
    return { x: [-halfSpan, halfSpan], y: [-halfSpan, halfSpan] }
  }
  const minimumX = Math.min(...nodes.map((node) => node.x - node.size))
  const maximumX = Math.max(...nodes.map((node) => node.x + node.size))
  const minimumY = Math.min(...nodes.map((node) => node.y - node.size))
  const maximumY = Math.max(...nodes.map((node) => node.y + node.size))
  return { x: centeredExtent(minimumX, maximumX), y: centeredExtent(minimumY, maximumY) }
}

function centeredExtent(minimum: number, maximum: number): Extent {
  const center = (minimum + maximum) / 2
  const halfSpan = Math.max(maximum - minimum, MINIMUM_LAYOUT_SPAN) / 2
  return [center - halfSpan, center + halfSpan]
}
