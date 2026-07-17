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

const presentation = window.showMePresentation
const graphContainer = requiredElement("graph")
const tooltip = requiredElement("tooltip")
const selectedEmpty = requiredElement("selected-empty")
const selectedDetails = requiredElement("selected-details")
const selectedPath = requiredElement("selected-path")
const selectedCodeLines = requiredElement("selected-code-lines")
const selectedCommentLines = requiredElement("selected-comment-lines")
const selectedBlankLines = requiredElement("selected-blank-lines")
const selectedImports = requiredElement("selected-imports")
const selectedConsumers = requiredElement("selected-consumers")
const selectedCoverage = requiredElement("selected-coverage")
const selectedImportedFiles = requiredElement("selected-imported-files")
const selectedConsumerFiles = requiredElement("selected-consumer-files")
const clearSelection = requiredElement("clear-selection")
const fileList = requiredElement("file-list")
const lineCategoryControls = REPORT_LINE_CATEGORIES.map((category) => ({
  category,
  input: requiredCheckbox("line-category-" + category),
}))
const nodeById = new Map(presentation.nodes.map((node) => [node.id, node]))
const graph = new DirectedGraph<BrowserNodeAttributes>()

for (const node of presentation.nodes) {
  graph.addNode(node.id, {
    x: node.x,
    y: node.y,
    size: node.size,
    color: node.color,
  })
}
for (const edge of presentation.edges) {
  graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
    type: "arrow",
    color: "#405267",
    size: 1,
  })
}

let selectedNodeId: string | undefined
let hoveredNodeId: string | undefined
let viewState: ReportViewState = { lineCategories: ["code"] }
const renderer = new Sigma<BrowserNodeAttributes>(graph, graphContainer, {
  allowInvalidContainer: false,
  defaultEdgeType: "arrow",
  edgeProgramClasses: {
    arrow: createEdgeArrowProgram<BrowserNodeAttributes>(),
  },
  labelRenderedSizeThreshold: Number.POSITIVE_INFINITY,
  itemSizesReference: "positions",
  nodeReducer(node, attributes): Partial<NodeDisplayData> {
    if (node !== selectedNodeId) {
      return attributes
    }
    return {
      ...attributes,
      color: "#f4c66a",
      highlighted: true,
      zIndex: 1,
    }
  },
  zIndex: true,
})
renderer.setCustomBBox(layoutBounds(presentation.nodes))

for (const control of lineCategoryControls) {
  control.input.addEventListener("change", () => {
    const lineCategories = selectedLineCategories()
    if (lineCategories.length === 0) {
      control.input.checked = true
      return
    }
    applyReportView({ lineCategories })
  })
}
applyReportView(viewState)

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
renderer.on("leaveNode", () => {
  hoveredNodeId = undefined
  tooltip.hidden = true
  delete document.documentElement.dataset.hoveredNode
})
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
  const item = document.createElement("li")
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = node.path
  button.title = node.path
  button.dataset.nodeId = node.id
  button.addEventListener("click", () => {
    selectNode(node.id)
  })
  item.append(button)
  fileList.append(item)
}

document.documentElement.dataset.showMeReady = "true"

function selectNode(nodeId: string | undefined): void {
  selectedNodeId = nodeId

  for (const button of fileList.querySelectorAll("button")) {
    button.setAttribute("aria-current", button.dataset.nodeId === nodeId ? "true" : "false")
  }

  clearSelection.hidden = true
  if (nodeId === undefined) {
    selectedEmpty.hidden = false
    selectedDetails.hidden = true
    delete document.documentElement.dataset.selectedNode
    renderer.refresh()
    return
  }

  const node = nodeById.get(nodeId)
  if (node === undefined) {
    return
  }

  clearSelection.hidden = false
  selectedEmpty.hidden = true
  selectedDetails.hidden = false
  selectedPath.textContent = node.path
  selectedCodeLines.textContent = String(node.lineMetrics.code)
  selectedCommentLines.textContent = String(node.lineMetrics.comment)
  selectedBlankLines.textContent = String(node.lineMetrics.blank)
  selectedImports.textContent = String(node.imports)
  selectedConsumers.textContent = String(node.consumers)
  selectedCoverage.textContent = node.coverage === undefined ? "Not available" : `${node.coverage}%`
  renderRelatedFiles(selectedImportedFiles, node.importedFiles)
  renderRelatedFiles(selectedConsumerFiles, node.consumerFiles)
  document.documentElement.dataset.selectedNode = nodeId
  renderer.refresh()
}

function renderRelatedFiles(container: HTMLElement, relatedNodeIds: readonly string[]): void {
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
    if (node === undefined) {
      continue
    }
    const item = document.createElement("li")
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = node.path
    button.title = node.path
    button.addEventListener("click", () => {
      selectNode(node.id)
    })
    item.append(button)
    container.append(item)
  }
}

function showTooltip(node: ReportNode): void {
  tooltip.replaceChildren()

  const path = document.createElement("strong")
  path.textContent = node.tooltipPath
  path.title = node.path
  tooltip.append(path)

  const metrics = document.createElement("div")
  metrics.className = "tooltip-metrics"
  const metricElements = [
    metric("Code", node.lineMetrics.code),
    metric("Comments", node.lineMetrics.comment),
    metric("Blank", node.lineMetrics.blank),
    metric("Imports", node.imports),
    metric("Consumers", node.consumers),
  ]
  if (node.coverage !== undefined) {
    metricElements.push(metric("Coverage", `${node.coverage}%`))
  }
  metrics.append(...metricElements)
  tooltip.append(metrics)
  tooltip.hidden = false
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

type ReportViewState = {
  readonly lineCategories: readonly ReportLineCategory[]
}

function selectedLineCategories(): readonly ReportLineCategory[] {
  return lineCategoryControls.filter(({ input }) => input.checked).map(({ category }) => category)
}

function applyReportView(nextState: ReportViewState): void {
  viewState = nextState
  const layout = layoutReportGraph(
    presentation.nodes.map((node) => ({
      id: node.id,
      size: nodeSizeForLines(activeLineCount(node.lineMetrics, viewState.lineCategories)),
    })),
    presentation.edges,
  )

  for (const node of layout) {
    graph.mergeNodeAttributes(node.id, { x: node.x, y: node.y, size: node.size })
  }
  for (const control of lineCategoryControls) {
    control.input.disabled = viewState.lineCategories.length === 1 && control.input.checked
  }
  document.documentElement.dataset.activeLineCategories = viewState.lineCategories.join(",")
  graphContainer.dataset.layoutSignature = layoutSignature(layout)
  renderer.setCustomBBox(layoutBounds(layout))
  renderer.refresh()
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

  return {
    x: centeredExtent(minimumX, maximumX),
    y: centeredExtent(minimumY, maximumY),
  }
}

function centeredExtent(minimum: number, maximum: number): Extent {
  const center = (minimum + maximum) / 2
  const halfSpan = Math.max(maximum - minimum, MINIMUM_LAYOUT_SPAN) / 2
  return [center - halfSpan, center + halfSpan]
}
