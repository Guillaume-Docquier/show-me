import type { DirectedGraph } from "graphology"
import type { Sigma } from "sigma"
import { centeredNodeLabelGeometry, LABEL_FONT, LABEL_SIZE, LABEL_WEIGHT } from "./report-graph-labels.js"
import type { DependencyFocus } from "./report-graph-overlays.js"
import type { BrowserEdgeAttributes, BrowserNodeAttributes, GraphNodeCircle } from "./report-graph-types.js"
import { reportViewLayoutSignature, type ReportView } from "./report-view.js"

/** Isolates browser-test observability from production graph decisions. */
export class ReportGraphDiagnostics {
  readonly #container: HTMLElement
  readonly #graph: DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes>
  readonly #renderer: Sigma<BrowserNodeAttributes, BrowserEdgeAttributes>
  readonly #measurementContext: CanvasRenderingContext2D

  public constructor({
    container,
    graph,
    renderer,
    measurementContext,
  }: {
    readonly container: HTMLElement
    readonly graph: DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes>
    readonly renderer: Sigma<BrowserNodeAttributes, BrowserEdgeAttributes>
    readonly measurementContext: CanvasRenderingContext2D
  }) {
    this.#container = container
    this.#graph = graph
    this.#renderer = renderer
    this.#measurementContext = measurementContext
  }

  public writeView(view: ReportView): void {
    this.#container.dataset.visibleNodeCount = String(view.nodes.length)
    this.#container.dataset.visibleEdgeCount = String(view.dependencyEdges.length)
    this.#container.dataset.graphNodeCount = String(this.#graph.order)
    this.#container.dataset.directoryNodeCount = String(view.directories.length)
    this.#container.dataset.structureEdgeCount = String(view.structureEdges.length)
    this.#container.dataset.visibleNodeColors = JSON.stringify(view.nodes.map(({ id, color }) => ({ id, color })))
    this.#container.dataset.layoutSignature = reportViewLayoutSignature(view)
  }

  public writeGraphWeights({
    structure,
    dependency,
    externalDependency,
  }: {
    readonly structure: number
    readonly dependency: number
    readonly externalDependency: number
  }): void {
    this.#container.dataset.structureEdgeWeight = String(structure)
    this.#container.dataset.dependencyEdgeWeight = String(dependency)
    this.#container.dataset.externalDependencyEdgeWeight = String(externalDependency)
  }

  public writeDirectoryLabels({
    maximumDepth,
    visibleLabels,
    candidateCount,
  }: {
    readonly maximumDepth: number
    readonly visibleLabels: ReadonlyArray<{
      readonly label: string
    }>
    readonly candidateCount: number
  }): void {
    this.#container.dataset.visibleDirectoryLabelDepth = String(maximumDepth)
    this.#container.dataset.visibleDirectoryLabels = JSON.stringify(visibleLabels.map(({ label }) => label))
    this.#container.dataset.visibleDirectoryLabelRectangles = JSON.stringify(visibleLabels)
    this.#container.dataset.directoryLabelCandidateCount = String(candidateCount)
    this.#container.dataset.suppressedDirectoryLabelCount = String(candidateCount - visibleLabels.length)
  }

  public writeRenderedLabels(): void {
    const renderedFileLabels: string[] = []
    const renderedDirectoryLabels: string[] = []
    const renderedNodeLabelRectangles: Array<{
      readonly id: string
      readonly label: string
      readonly nodeKind: "project-file" | "directory"
      readonly nodeX: number
      readonly nodeY: number
      readonly nodeSize: number
      readonly bounds: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
    }> = []
    this.#measurementContext.save()
    this.#measurementContext.font = `${LABEL_WEIGHT} ${LABEL_SIZE}px ${LABEL_FONT}`
    for (const id of this.#renderer.getNodeDisplayedLabels()) {
      if (!this.#graph.hasNode(id)) {
        continue
      }
      const attributes = this.#graph.getNodeAttributes(id)
      if (attributes.label === undefined) {
        continue
      }
      if (attributes.nodeKind === "project-file") {
        renderedFileLabels.push(attributes.label)
      } else if (attributes.nodeKind === "directory") {
        renderedDirectoryLabels.push(attributes.label)
      } else {
        continue
      }
      const node = this.#renderer.graphToViewport(attributes)
      const nodeSize = this.#renderer.scaleSize(attributes.size)
      renderedNodeLabelRectangles.push({
        id,
        label: attributes.label,
        nodeKind: attributes.nodeKind,
        nodeX: node.x,
        nodeY: node.y,
        nodeSize,
        bounds: centeredNodeLabelGeometry(this.#measurementContext, attributes.label, node.x, node.y, nodeSize, LABEL_SIZE, 0).bounds,
      })
    }
    this.#measurementContext.restore()
    this.#container.dataset.renderedFileLabels = JSON.stringify(renderedFileLabels.toSorted())
    this.#container.dataset.renderedDirectoryLabels = JSON.stringify(renderedDirectoryLabels.toSorted())
    this.#container.dataset.renderedNodeLabelRectangles = JSON.stringify(
      renderedNodeLabelRectangles.toSorted((left, right) => left.id.localeCompare(right.id)),
    )
  }

  public writeCamera(showFileLabels: boolean, cameraState: unknown): void {
    this.#container.dataset.cameraState = JSON.stringify(cameraState)
    this.#container.dataset.fileLabelVisibility = showFileLabels ? "visible" : "hidden"
  }

  public writeDependencyEdges(edgeIds: readonly string[], visible: boolean): void {
    const renderedEdges = edgeIds.flatMap((edge) => {
      const displayData = this.#renderer.getEdgeDisplayData(edge)
      return displayData === undefined || displayData.hidden ? [] : [{ id: edge, color: displayData.color, size: displayData.size }]
    })
    this.#container.dataset.dependencyEdges = visible ? "visible" : "hidden"
    this.#container.dataset.renderedDependencyEdgeCount = String(renderedEdges.length)
    this.#container.dataset.renderedDependencyEdges = JSON.stringify(renderedEdges)
  }

  public writeDependencyFocus(focus: DependencyFocus | undefined): void {
    if (focus === undefined) {
      delete this.#container.dataset.dependencyFocus
      return
    }
    this.#container.dataset.dependencyFocus = JSON.stringify({
      nodeId: focus.nodeId,
      dependencyNodeIds: [...focus.dependencyNodeIds],
      consumerNodeIds: [...focus.consumerNodeIds],
    })
  }

  public writeNodeCircles(): void {
    this.#container.dataset.visibleNodePositions = JSON.stringify(this.graphNodeCircles())
  }

  public graphNodeCircles(): readonly GraphNodeCircle[] {
    return this.#graph.nodes().map((id) => {
      const attributes = this.#graph.getNodeAttributes(id)
      return {
        id,
        ...this.#renderer.graphToViewport(attributes),
        radius: this.#renderer.scaleSize(attributes.size),
      }
    })
  }
}
