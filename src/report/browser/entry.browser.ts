import { DirectedGraph } from "graphology"
import Sigma from "sigma"
import { createEdgeArrowProgram } from "sigma/rendering"
import type { NodeDisplayData } from "sigma/types"
import type { ReportNode, ReportPresentation } from "../report-presentation.js"

declare global {
  interface Window {
    readonly showMePresentation: ReportPresentation
  }
}

const TOOLTIP_OFFSET = 14
const VIEWPORT_MARGIN = 10

type BrowserNodeAttributes = {
  readonly x: number
  readonly y: number
  readonly size: number
  readonly color: string
  readonly originalColor: string
}

const presentation = window.showMePresentation
const graphContainer = requiredElement("graph")
const tooltip = requiredElement("tooltip")
const selectedEmpty = requiredElement("selected-empty")
const selectedDetails = requiredElement("selected-details")
const selectedPath = requiredElement("selected-path")
const selectedLines = requiredElement("selected-lines")
const selectedImports = requiredElement("selected-imports")
const selectedConsumers = requiredElement("selected-consumers")
const selectedCoverage = requiredElement("selected-coverage")
const selectedImportedFiles = requiredElement("selected-imported-files")
const selectedConsumerFiles = requiredElement("selected-consumer-files")
const clearSelection = requiredElement("clear-selection")
const fileList = requiredElement("file-list")
const nodeById = new Map(presentation.nodes.map((node) => [node.id, node]))
const graph = new DirectedGraph<BrowserNodeAttributes>()

for (const node of presentation.nodes) {
  graph.addNode(node.id, {
    x: node.x,
    y: node.y,
    size: node.size,
    color: node.color,
    originalColor: node.color,
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
const renderer = new Sigma<BrowserNodeAttributes>(graph, graphContainer, {
  allowInvalidContainer: false,
  defaultEdgeType: "arrow",
  edgeProgramClasses: {
    arrow: createEdgeArrowProgram<BrowserNodeAttributes>(),
  },
  labelRenderedSizeThreshold: Number.POSITIVE_INFINITY,
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
  selectedLines.textContent = String(node.lines)
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
  metrics.append(metric("LOC", node.lines), metric("Imports", node.imports), metric("Consumers", node.consumers))
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

function metric(label: string, value: number): HTMLElement {
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
