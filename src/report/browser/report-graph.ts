import { DirectedGraph } from "graphology"
import { circular } from "graphology-layout"
import forceAtlas2 from "graphology-layout-forceatlas2"
import { Sigma } from "sigma"
import { createEdgeArrowProgram } from "sigma/rendering"
import type { EdgeDisplayData, NodeDisplayData } from "sigma/types"
import type { EdgeVisibilityState } from "./report-controls.js"
import { ReportGraphDiagnostics } from "./report-graph-diagnostics.js"
import { ReportGraphLabelVisibility } from "./report-graph-label-visibility.js"
import { drawNodeHover, drawNodeLabel, LABEL_COLOR, LABEL_FONT, LABEL_SIZE, LABEL_WEIGHT } from "./report-graph-labels.js"
import { CONSUMER_FOCUS_COLOR, DEPENDENCY_FOCUS_COLOR, ReportGraphOverlays, type DependencyFocus } from "./report-graph-overlays.js"
import type { BrowserEdgeAttributes, BrowserNodeAttributes } from "./report-graph-types.js"
import type { ReportInteractionState } from "./report-interaction.js"
import type { BrowserPresentation, ReportNode, ReportProjectFileNode } from "./report-presentation.js"
import { visibleRelationships, type ReportView } from "./report-view.js"

const DIRECTORY_NODE_SIZE = 9
const ROOT_DIRECTORY_NODE_SIZE = 15
const STRUCTURE_EDGE_WEIGHT = 6
const DEPENDENCY_EDGE_WEIGHT = 0.25
const EXTERNAL_DEPENDENCY_EDGE_WEIGHT = 1.2
const DEPENDENCY_EDGE_COLOR = "rgba(98, 139, 181, 0.32)"
const EXTERNAL_DEPENDENCY_EDGE_COLOR = "rgba(154, 104, 193, 0.38)"
const GRAPH_FIT_MARGIN = 1
const DEPENDENCY_FOCUS_EDGE_SIZE = 4.4
const CONSUMER_FOCUS_EDGE_SIZE = 5.2

export type ReportGraphEvents = {
  readonly onInteractionChange: (interaction: ReportInteractionState) => void
}

/**
 * Owns the mutable Graphology projection, Sigma renderer, layout, and graph interactions.
 *
 * Application controls provide complete immutable views. This controller keeps
 * renderer-only state private and reports only selection/hover changes back to
 * the DOM navigation shell.
 */
export class ReportGraph {
  readonly #root: HTMLElement
  readonly #container: HTMLElement
  readonly #nodeById: ReadonlyMap<string, ReportNode>
  readonly #events: ReportGraphEvents
  readonly #graph = new DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes>()
  readonly #renderer: Sigma<BrowserNodeAttributes, BrowserEdgeAttributes>
  readonly #camera
  readonly #overlays: ReportGraphOverlays
  readonly #diagnostics: ReportGraphDiagnostics
  readonly #labelVisibility: ReportGraphLabelVisibility
  #view: ReportView | undefined
  #interaction: ReportInteractionState
  #edgeVisibility: EdgeVisibilityState
  #dependencyFocus: DependencyFocus | undefined
  #cameraResetAwaitingSettledRender = false

  public constructor({
    root,
    container,
    presentation,
    initialInteraction,
    initialEdgeVisibility,
    events,
  }: {
    readonly root: HTMLElement
    readonly container: HTMLElement
    readonly presentation: BrowserPresentation
    readonly initialInteraction: ReportInteractionState
    readonly initialEdgeVisibility: EdgeVisibilityState
    readonly events: ReportGraphEvents
  }) {
    this.#root = root
    this.#container = container
    this.#nodeById = new Map(presentation.nodes.map((node) => [node.id, node]))
    this.#interaction = initialInteraction
    this.#edgeVisibility = initialEdgeVisibility
    this.#events = events
    this.#renderer = new Sigma<BrowserNodeAttributes, BrowserEdgeAttributes>(this.#graph, container, {
      allowInvalidContainer: false,
      defaultEdgeType: "arrow",
      edgeProgramClasses: { arrow: createEdgeArrowProgram<BrowserNodeAttributes, BrowserEdgeAttributes>() },
      edgeReducer: (edge, attributes): Partial<EdgeDisplayData> => this.#reduceEdge(edge, attributes),
      labelColor: { color: LABEL_COLOR },
      defaultDrawNodeLabel: drawNodeLabel,
      defaultDrawNodeHover: drawNodeHover,
      labelFont: LABEL_FONT,
      labelRenderedSizeThreshold: 0,
      labelSize: LABEL_SIZE,
      labelWeight: LABEL_WEIGHT,
      // ForceAtlas2 and Sigma interpret node radii in the same graph-coordinate system.
      itemSizesReference: "positions",
      nodeReducer: (node, attributes): Partial<NodeDisplayData> => this.#reduceNode(node, attributes),
      zIndex: true,
    })
    this.#overlays = new ReportGraphOverlays({ graph: this.#graph, renderer: this.#renderer, container })
    this.#diagnostics = new ReportGraphDiagnostics({
      graph: this.#graph,
      renderer: this.#renderer,
      container,
      measurementContext: this.#overlays.measurementContext,
    })
    this.#labelVisibility = new ReportGraphLabelVisibility({
      graph: this.#graph,
      renderer: this.#renderer,
      container,
      measurementContext: this.#overlays.measurementContext,
      diagnostics: this.#diagnostics,
    })
    this.#camera = this.#renderer.getCamera()
    this.#bindRendererEvents()
  }

  /** Rebuild, lay out, and render the visible graph projection. */
  public applyView(view: ReportView): void {
    this.#view = view
    this.#graph.clear()
    this.#labelVisibility.reset()

    for (const node of view.nodes) {
      this.#graph.addNode(node.id, {
        size: node.size,
        color: node.color,
        nodeKind: node.reportNode.kind,
        ...(node.reportNode.kind === "project-file" ? { label: projectFileLabel(node.reportNode.path) } : {}),
        x: 0,
        y: 0,
      })
    }
    for (const directory of view.directories) {
      this.#graph.addNode(directory.id, {
        size: directory.depth === 0 ? ROOT_DIRECTORY_NODE_SIZE : DIRECTORY_NODE_SIZE,
        color: directory.depth === 0 ? "#79b8ff" : "#50677d",
        nodeKind: "directory",
        label: directory.label,
        forceLabel: true,
        directoryDepth: directory.depth,
        descendantProjectFileCount: directory.descendantProjectFileCount,
        x: 0,
        y: 0,
      })
    }
    for (const edge of view.structureEdges) {
      this.#graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
        edgeKind: "structure",
        hidden: true,
        weight: STRUCTURE_EDGE_WEIGHT,
      })
    }
    for (const edge of view.dependencyEdges) {
      const externalPackage = edge.kind === "external-package"
      this.#graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
        edgeKind: "dependency",
        type: "arrow",
        color: externalPackage ? EXTERNAL_DEPENDENCY_EDGE_COLOR : DEPENDENCY_EDGE_COLOR,
        size: externalPackage ? 2 : 2.4,
        weight: externalPackage ? EXTERNAL_DEPENDENCY_EDGE_WEIGHT : DEPENDENCY_EDGE_WEIGHT,
      })
    }

    circular.assign(this.#graph)
    forceAtlas2.assign(this.#graph, {
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

    if (this.#interaction.selectedNodeId !== undefined && !view.nodeIds.has(this.#interaction.selectedNodeId)) {
      this.#interaction = { ...this.#interaction, selectedNodeId: undefined }
    }
    if (this.#interaction.hoveredNodeId !== undefined && !view.nodeIds.has(this.#interaction.hoveredNodeId)) {
      this.clearHover()
    } else if (this.#interaction.hoveredNodeId !== undefined) {
      const hoveredNode = this.#nodeById.get(this.#interaction.hoveredNodeId)
      this.#dependencyFocus = hoveredNode?.kind === "project-file" ? this.#dependencyFocusFor(hoveredNode) : undefined
      this.#diagnostics.writeDependencyFocus(this.#dependencyFocus)
    }
    this.#updateViewDiagnostics()
    this.#emitInteraction()
    this.#renderer.refresh()
  }

  /** Change only edge rendering; graph membership, positions, and layout remain untouched. */
  public setEdgeVisibility(edgeVisibility: EdgeVisibilityState): void {
    const structureEdgesChanged = edgeVisibility.structureEdges !== this.#edgeVisibility.structureEdges
    const dependencyEdgesChanged = edgeVisibility.dependencyEdges !== this.#edgeVisibility.dependencyEdges
    this.#edgeVisibility = edgeVisibility
    if (structureEdgesChanged) {
      this.#renderer.scheduleRender()
    }
    if (dependencyEdgesChanged) {
      this.#refreshDependencyEdges()
    }
  }

  /** Select a visible graph node, or clear selection when called without an identity. */
  public selectNode(nodeId: string | undefined): void {
    const visibleNodeId = nodeId === undefined || this.#graph.hasNode(nodeId) ? nodeId : undefined
    this.#interaction = { ...this.#interaction, selectedNodeId: visibleNodeId }
    this.#emitInteraction()
    this.#renderer.refresh()
  }

  /** Apply hover focus to a visible presentation node. */
  public focusNode(nodeId: string): void {
    const node = this.#nodeById.get(nodeId)
    if (node === undefined || this.#view?.nodeIds.has(nodeId) !== true) {
      return
    }
    this.#interaction = { ...this.#interaction, hoveredNodeId: node.id }
    this.#dependencyFocus = node.kind === "project-file" ? this.#dependencyFocusFor(node) : undefined
    this.#diagnostics.writeDependencyFocus(this.#dependencyFocus)
    this.#emitInteraction()
    this.#refreshDependencyEdges()
  }

  /** Clear node and directory hover effects. */
  public clearHover(): void {
    const dependencyFocusChanged = this.#dependencyFocus !== undefined
    this.#interaction = { ...this.#interaction, hoveredNodeId: undefined }
    this.#dependencyFocus = undefined
    this.#labelVisibility.clearDirectoryHover()
    this.#diagnostics.writeDependencyFocus(this.#dependencyFocus)
    this.#emitInteraction()
    if (dependencyFocusChanged) {
      this.#refreshDependencyEdges()
    }
  }

  /** Animate the camera center to one visible node. */
  public centerNode(nodeId: string): void {
    const node = this.#renderer.getNodeDisplayData(nodeId)
    if (node === undefined) {
      return
    }

    delete this.#container.dataset.cameraFocusedNode
    this.#camera.animate({ x: node.x, y: node.y }, { duration: 250 }, () => {
      this.#container.dataset.cameraFocusedNode = nodeId
    })
  }

  /** Reset and then enlarge the camera view until every rendered circle fits. */
  public resetCamera(): void {
    this.#container.dataset.cameraReset = "pending"
    this.#cameraResetAwaitingSettledRender = false
    void this.#camera.animatedReset({ duration: 250 }).then(() => {
      this.#cameraResetAwaitingSettledRender = true
      this.#labelVisibility.markDirty()
      this.#renderer.scheduleRender()
      return undefined
    })
  }

  #bindRendererEvents(): void {
    this.#camera.on("updated", () => {
      this.#labelVisibility.markDirty()
    })
    this.#renderer.resize(true)
    // Sigma's window-resize path schedules the full refresh that rebuilds its
    // label grid. This listener only invalidates geometry for the new matrix.
    this.#renderer.on("resize", () => {
      this.#labelVisibility.markDirty()
    })
    this.#renderer.on("afterRender", () => {
      this.#overlays.renderStructureLinks(this.#view?.structureEdges ?? [], this.#edgeVisibility.structureEdges)
      this.#overlays.renderDependencyFocus(this.#dependencyFocus)
      this.#diagnostics.writeDependencyEdges(this.#dependencyEdgeIds(), this.#edgeVisibility.dependencyEdges)
      const labelRefreshScheduled = this.#labelVisibility.synchronizeAfterRender()
      this.#diagnostics.writeCamera(this.#labelVisibility.fileLabelsAreVisible, this.#camera.getState())
      if (!labelRefreshScheduled) {
        this.#diagnostics.writeRenderedLabels()
        this.#diagnostics.writeNodeCircles()
        this.#completePendingCameraReset()
      }
    })
    this.#renderer.on("enterNode", ({ node }) => {
      const attributes = this.#graph.getNodeAttributes(node)
      if (attributes.nodeKind === "directory") {
        this.#labelVisibility.hoverDirectory(node)
        return
      }
      this.focusNode(node)
    })
    this.#renderer.on("leaveNode", () => {
      this.clearHover()
    })
    this.#renderer.on("clickNode", ({ node }) => {
      this.selectNode(node)
    })
    this.#renderer.on("clickStage", () => {
      this.selectNode(undefined)
    })
  }

  #reduceEdge(edge: string, attributes: BrowserEdgeAttributes): Partial<EdgeDisplayData> {
    if (attributes.edgeKind !== "dependency") {
      return attributes
    }
    if (attributes.hidden === true || !this.#edgeVisibility.dependencyEdges) {
      return { ...attributes, hidden: true }
    }

    const relationship = this.#focusedDependencyEdgeRelationship(edge)
    if (relationship === "dependency") {
      return { ...attributes, color: DEPENDENCY_FOCUS_COLOR, size: DEPENDENCY_FOCUS_EDGE_SIZE, zIndex: 1 }
    }
    if (relationship === "consumer") {
      return { ...attributes, color: CONSUMER_FOCUS_COLOR, size: CONSUMER_FOCUS_EDGE_SIZE, zIndex: 1 }
    }
    return attributes
  }

  #reduceNode(node: string, attributes: BrowserNodeAttributes): Partial<NodeDisplayData> {
    const label =
      (attributes.nodeKind === "directory" && !this.#labelVisibility.directoryLabelIsVisible(node)) ||
      (attributes.nodeKind === "project-file" && !this.#labelVisibility.fileLabelsAreVisible)
        ? { label: null, forceLabel: false }
        : {}
    return node === this.#interaction.selectedNodeId
      ? { ...attributes, ...label, color: "#f4c66a", highlighted: true, zIndex: 1 }
      : { ...attributes, ...label }
  }

  #emitInteraction(): void {
    const selectedNode = this.#interaction.selectedNodeId === undefined ? undefined : this.#nodeById.get(this.#interaction.selectedNodeId)
    if (selectedNode === undefined) {
      delete this.#root.dataset.selectedNode
    } else {
      this.#root.dataset.selectedNode = selectedNode.id
    }
    if (this.#interaction.hoveredNodeId === undefined) {
      delete this.#root.dataset.hoveredNode
    } else {
      this.#root.dataset.hoveredNode = this.#interaction.hoveredNodeId
    }
    this.#events.onInteractionChange(this.#interaction)
  }

  #updateViewDiagnostics(): void {
    const view = this.#view
    if (view === undefined) {
      return
    }
    this.#root.dataset.activeLineCategories = view.state.lineCategories.join(",")
    this.#root.dataset.externalPackages = view.state.externalPackages ? "visible" : "hidden"
    this.#root.dataset.workspacePackages = JSON.stringify([...view.state.workspacePackages])
    this.#diagnostics.writeView(view)
    this.#diagnostics.writeGraphWeights({
      structure: STRUCTURE_EDGE_WEIGHT,
      dependency: DEPENDENCY_EDGE_WEIGHT,
      externalDependency: EXTERNAL_DEPENDENCY_EDGE_WEIGHT,
    })
  }

  #completePendingCameraReset(): void {
    if (!this.#cameraResetAwaitingSettledRender || !this.#fitCurrentGraphInViewport()) {
      return
    }
    this.#cameraResetAwaitingSettledRender = false
    this.#container.dataset.cameraReset = "complete"
  }

  #fitCurrentGraphInViewport(): boolean {
    const dimensions = this.#renderer.getDimensions()
    const circles = this.#diagnostics.graphNodeCircles()
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
    const state = this.#camera.getState()
    this.#camera.setState({ x: 0.5, y: 0.5, angle: 0, ratio: state.ratio * Math.max(1.01, ratioMultiplier * 1.01) })
    return false
  }

  #dependencyEdgeIds(): string[] {
    return this.#graph.filterEdges((_edge, attributes) => attributes.edgeKind === "dependency")
  }

  #focusedDependencyEdgeRelationship(edge: string): "dependency" | "consumer" | undefined {
    if (this.#dependencyFocus === undefined) {
      return undefined
    }
    const source = this.#graph.source(edge)
    const target = this.#graph.target(edge)
    if (source === this.#dependencyFocus.nodeId && this.#dependencyFocus.dependencyNodeIds.has(target)) {
      return "dependency"
    }
    if (target === this.#dependencyFocus.nodeId && this.#dependencyFocus.consumerNodeIds.has(source)) {
      return "consumer"
    }
    return undefined
  }

  #dependencyFocusFor(node: ReportProjectFileNode): DependencyFocus {
    const view = this.#view
    if (view === undefined) {
      return { nodeId: node.id, dependencyNodeIds: new Set(), consumerNodeIds: new Set() }
    }
    return {
      nodeId: node.id,
      dependencyNodeIds: new Set(visibleRelationships(view, node.dependencyNodeIds).filter((nodeId) => nodeId !== node.id)),
      consumerNodeIds: new Set(visibleRelationships(view, node.consumerNodeIds).filter((nodeId) => nodeId !== node.id)),
    }
  }

  #refreshDependencyEdges(): void {
    this.#renderer.refresh({
      partialGraph: { edges: this.#dependencyEdgeIds() },
      schedule: true,
      skipIndexation: true,
    })
  }
}

function projectFileLabel(path: string): string {
  return path.split("/").at(-1) ?? path
}

function graphFitRatioMultiplier(centerDisplacement: number, radius: number, viewportHalfExtent: number): number {
  // With position-referenced item sizes, a ratio multiplier m scales center
  // displacement by 1/m and radius by 1/sqrt(m). Solve
  // displacement/m + radius/sqrt(m) <= viewportHalfExtent for m.
  const squareRootMultiplier =
    (radius + Math.sqrt(radius * radius + 4 * viewportHalfExtent * centerDisplacement)) / (2 * viewportHalfExtent)
  return squareRootMultiplier * squareRootMultiplier
}
