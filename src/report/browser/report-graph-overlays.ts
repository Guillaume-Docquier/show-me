import type { DirectedGraph } from "graphology"
import type { Sigma } from "sigma"
import type { ProjectStructureEdge } from "./project-structure.js"
import { drawHoveredNodeLabel } from "./report-graph-labels.js"
import type { BrowserEdgeAttributes, BrowserNodeAttributes } from "./report-graph-types.js"

export const DEPENDENCY_FOCUS_COLOR = "#46d7c6"
export const CONSUMER_FOCUS_COLOR = "#ff9b71"

const HOVERED_NODE_FOCUS_COLOR = "#f5f9ff"
const STRUCTURE_EDGE_COLOR = "rgba(111, 130, 149, 0.68)"
const DIMMED_STRUCTURE_EDGE_COLOR = "rgba(111, 130, 149, 0.38)"
const FOCUSED_STRUCTURE_EDGE_COLOR = "rgba(121, 184, 255, 0.95)"
const FOCUS_RING_OFFSET = 5
const FOCUS_RING_SEPARATION = 5
const FOCUS_RING_WIDTH = 3

export type DependencyFocus = {
  readonly nodeId: string
  readonly dependencyNodeIds: ReadonlySet<string>
  readonly consumerNodeIds: ReadonlySet<string>
}

/** Owns the custom Canvas layers rendered around Sigma's WebGL layers. */
export class ReportGraphOverlays {
  readonly #graph: DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes>
  readonly #renderer: Sigma<BrowserNodeAttributes, BrowserEdgeAttributes>
  readonly #container: HTMLElement
  readonly #structureLayer: HTMLCanvasElement
  readonly #structureContext: CanvasRenderingContext2D
  readonly #dependencyFocusLayer: HTMLCanvasElement
  readonly #dependencyFocusContext: CanvasRenderingContext2D
  readonly #hoverLabelLayer: HTMLCanvasElement
  readonly #hoverLabelContext: CanvasRenderingContext2D

  public constructor({
    graph,
    renderer,
    container,
  }: {
    readonly graph: DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes>
    readonly renderer: Sigma<BrowserNodeAttributes, BrowserEdgeAttributes>
    readonly container: HTMLElement
  }) {
    this.#graph = graph
    this.#renderer = renderer
    this.#container = container
    this.#structureLayer = renderer.createCanvas("structure", {
      beforeLayer: "edges",
      style: { pointerEvents: "none" },
    })
    this.#structureContext = requiredCanvasContext(this.#structureLayer)
    this.#dependencyFocusLayer = renderer.createCanvas("dependency-focus", {
      afterLayer: "hoverNodes",
      style: { pointerEvents: "none" },
    })
    this.#dependencyFocusContext = requiredCanvasContext(this.#dependencyFocusLayer)
    this.#hoverLabelLayer = renderer.createCanvas("hover-label", {
      afterLayer: "dependency-focus",
      style: { pointerEvents: "none" },
    })
    this.#hoverLabelContext = requiredCanvasContext(this.#hoverLabelLayer)
  }

  /** A correctly configured 2D context for label measurement. */
  public get measurementContext(): CanvasRenderingContext2D {
    return this.#structureContext
  }

  /** Draw or clear the project structure layer without changing graph inputs. */
  public renderStructureLinks(
    edges: readonly ProjectStructureEdge[],
    visible: boolean,
    dimmed: boolean,
    focusedDirectoryNodeId: string | undefined,
  ): void {
    this.#resizeCanvas(this.#structureLayer)
    const pixelRatio = this.#devicePixelRatio()
    this.#structureContext.setTransform(1, 0, 0, 1, 0, 0)
    this.#structureContext.clearRect(0, 0, this.#structureLayer.width, this.#structureLayer.height)
    this.#structureContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    const renderableEdges = visible ? edges.filter(({ source, target }) => this.#graph.hasNode(source) && this.#graph.hasNode(target)) : []
    const focusedEdges =
      focusedDirectoryNodeId === undefined
        ? []
        : renderableEdges.filter(({ source, target }) => source === focusedDirectoryNodeId || target === focusedDirectoryNodeId)
    const unfocusedEdges =
      focusedDirectoryNodeId === undefined
        ? renderableEdges
        : renderableEdges.filter(({ source, target }) => source !== focusedDirectoryNodeId && target !== focusedDirectoryNodeId)

    this.#strokeStructureEdges(
      unfocusedEdges,
      focusedDirectoryNodeId !== undefined || dimmed ? DIMMED_STRUCTURE_EDGE_COLOR : STRUCTURE_EDGE_COLOR,
      2,
    )
    this.#strokeStructureEdges(focusedEdges, FOCUSED_STRUCTURE_EDGE_COLOR, 3.2)
    this.#structureContext.setLineDash([])
    this.#container.dataset.structureEdges = visible ? "visible" : "hidden"
    this.#container.dataset.renderedStructureEdgeCount = String(renderableEdges.length)
    this.#container.dataset.focusedStructureEdgeCount = String(focusedEdges.length)
    if (focusedDirectoryNodeId === undefined) {
      delete this.#container.dataset.structureFocus
    } else {
      this.#container.dataset.structureFocus = focusedDirectoryNodeId
    }
  }

  /** Draw direct dependency-neighborhood rings without replacing node colors. */
  public renderDependencyFocus(focus: DependencyFocus | undefined): void {
    this.#resizeCanvas(this.#dependencyFocusLayer)
    const pixelRatio = this.#devicePixelRatio()
    this.#dependencyFocusContext.setTransform(1, 0, 0, 1, 0, 0)
    this.#dependencyFocusContext.clearRect(0, 0, this.#dependencyFocusLayer.width, this.#dependencyFocusLayer.height)
    this.#dependencyFocusContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

    let renderedRingCount = 0
    if (focus !== undefined) {
      renderedRingCount += this.#drawFocusRing(focus.nodeId, HOVERED_NODE_FOCUS_COLOR, FOCUS_RING_OFFSET, [])
      const neighborNodeIds = new Set([...focus.dependencyNodeIds, ...focus.consumerNodeIds])
      for (const nodeId of neighborNodeIds) {
        const dependency = focus.dependencyNodeIds.has(nodeId)
        const consumer = focus.consumerNodeIds.has(nodeId)
        if (dependency) {
          renderedRingCount += this.#drawFocusRing(nodeId, DEPENDENCY_FOCUS_COLOR, FOCUS_RING_OFFSET, [])
        }
        if (consumer) {
          renderedRingCount += this.#drawFocusRing(
            nodeId,
            CONSUMER_FOCUS_COLOR,
            FOCUS_RING_OFFSET + (dependency ? FOCUS_RING_SEPARATION : 0),
            [4, 3],
          )
        }
      }
    }
    this.#dependencyFocusContext.setLineDash([])
    this.#container.dataset.renderedDependencyFocusRingCount = String(renderedRingCount)
  }

  /** Draw the hovered node label after every node and focus decoration. */
  public renderHoveredNodeLabel(nodeId: string | undefined): void {
    this.#resizeCanvas(this.#hoverLabelLayer)
    const pixelRatio = this.#devicePixelRatio()
    this.#hoverLabelContext.setTransform(1, 0, 0, 1, 0, 0)
    this.#hoverLabelContext.clearRect(0, 0, this.#hoverLabelLayer.width, this.#hoverLabelLayer.height)
    this.#hoverLabelContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    if (nodeId === undefined || !this.#graph.hasNode(nodeId)) {
      return
    }
    const displayData = this.#renderer.getNodeDisplayData(nodeId)
    if (typeof displayData?.label !== "string") {
      return
    }
    const attributes = this.#graph.getNodeAttributes(nodeId)
    const node = this.#renderer.graphToViewport(attributes)
    drawHoveredNodeLabel(this.#hoverLabelContext, {
      label: displayData.label,
      x: node.x,
      y: node.y,
      size: this.#renderer.scaleSize(attributes.size),
    })
  }

  #drawFocusRing(nodeId: string, color: string, offset: number, lineDash: readonly number[]): number {
    if (!this.#graph.hasNode(nodeId)) {
      return 0
    }
    const attributes = this.#graph.getNodeAttributes(nodeId)
    const node = this.#renderer.graphToViewport(attributes)
    const radius = this.#renderer.scaleSize(attributes.size) + offset
    this.#dependencyFocusContext.beginPath()
    this.#dependencyFocusContext.setLineDash([...lineDash])
    this.#dependencyFocusContext.lineCap = "round"
    this.#dependencyFocusContext.lineWidth = FOCUS_RING_WIDTH
    this.#dependencyFocusContext.strokeStyle = color
    this.#dependencyFocusContext.arc(node.x, node.y, radius, 0, Math.PI * 2)
    this.#dependencyFocusContext.stroke()
    return 1
  }

  #strokeStructureEdges(edges: readonly ProjectStructureEdge[], color: string, lineWidth: number): void {
    this.#structureContext.beginPath()
    for (const edge of edges) {
      const sourceViewport = this.#renderer.graphToViewport(this.#graph.getNodeAttributes(edge.source))
      const targetViewport = this.#renderer.graphToViewport(this.#graph.getNodeAttributes(edge.target))
      this.#structureContext.moveTo(sourceViewport.x, sourceViewport.y)
      this.#structureContext.lineTo(targetViewport.x, targetViewport.y)
    }
    this.#structureContext.setLineDash([2, 4])
    this.#structureContext.lineWidth = lineWidth
    this.#structureContext.strokeStyle = color
    this.#structureContext.stroke()
  }

  #resizeCanvas(canvas: HTMLCanvasElement): void {
    const { width, height } = this.#renderer.getDimensions()
    const pixelRatio = this.#devicePixelRatio()
    const pixelWidth = Math.max(1, Math.round(width * pixelRatio))
    const pixelHeight = Math.max(1, Math.round(height * pixelRatio))
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }
  }

  #devicePixelRatio(): number {
    const reportWindow = this.#container.ownerDocument.defaultView
    if (reportWindow === null) {
      throw new Error("Static report is not attached to a browser window.")
    }
    return reportWindow.devicePixelRatio
  }
}

function requiredCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d")
  if (context === null) {
    throw new Error("Could not create a report graph canvas.")
  }
  return context
}
