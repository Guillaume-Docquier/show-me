import { DirectedGraph } from "graphology"
import { Sigma } from "sigma"
import { createEdgeArrowProgram } from "sigma/rendering"
import type { EdgeDisplayData, NodeDisplayData } from "sigma/types"
import type { PerformanceProfiler } from "../../performance/performance-profiler.js"
import type { CouplingCycle } from "./report-coupling.js"
import { ReportGraphDiagnostics } from "./report-graph-diagnostics.js"
import { ReportGraphLabelVisibility } from "./report-graph-label-visibility.js"
import { drawNodeHover, drawNodeLabel, LABEL_COLOR, LABEL_FONT, LABEL_SIZE, LABEL_WEIGHT } from "./report-graph-labels.js"
import { CONSUMER_FOCUS_COLOR, DEPENDENCY_FOCUS_COLOR, ReportGraphOverlays, type DependencyFocus } from "./report-graph-overlays.js"
import type { BrowserEdgeAttributes, BrowserNodeAttributes } from "./report-graph-types.js"
import type { ReportInteractionState } from "./report-interaction.js"
import { layoutReportGraph } from "./report-layout.js"
import type { ReportLensSettings } from "./report-lens.js"
import type { ReportNode } from "./report-presentation.js"
import { visibleRelationships, type ReportView } from "./report-view.js"

const DIRECTORY_NODE_SIZE = 9
const ROOT_DIRECTORY_NODE_SIZE = 15
const STRUCTURE_EDGE_WEIGHT = 6
const DEPENDENCY_EDGE_WEIGHT = 0.25
const EXTERNAL_DEPENDENCY_EDGE_WEIGHT = 1.2
const TYPE_ONLY_DEPENDENCY_EDGE_WEIGHT = 0.18
// Sigma's WebGL layer uses premultiplied-alpha blending. These opaque colors
// are the intended rgba edge colors composited over the fixed #0d1117 graph
// background, so changing focus visibly changes both arrow bodies and heads.
const DEPENDENCY_EDGE_COLOR = "#628bb5"
const EXTERNAL_DEPENDENCY_EDGE_COLOR = "#9a68c1"
const TYPE_ONLY_DEPENDENCY_EDGE_COLOR = "#a3e635"
const DIMMED_DEPENDENCY_EDGE_COLOR = "#1c2733"
const DIMMED_EXTERNAL_DEPENDENCY_EDGE_COLOR = "#2b233b"
const DIMMED_TYPE_ONLY_DEPENDENCY_EDGE_COLOR = "#31441e"
const GRAPH_FIT_MARGIN = 1
const DEPENDENCY_FOCUS_EDGE_SIZE = 4.4
const CONSUMER_FOCUS_EDGE_SIZE = 5.2

export type ReportGraphEvents = {
  readonly onActivateNode: (nodeId: string) => void
  readonly onClearSelection: () => void
  readonly onPreviewNode: (nodeId: string) => void
  readonly onClearPreview: (nodeId: string) => void
}

/**
 * Owns the mutable Graphology projection, Sigma renderer, layout, and graph interactions.
 *
 * Application controls provide complete immutable views. This controller keeps
 * renderer-only state private and reports graph gestures to the browser-owned
 * navigation controller.
 */
export class ReportGraph {
  readonly #root: HTMLElement
  readonly #container: HTMLElement
  readonly #events: ReportGraphEvents
  readonly #performanceProfiler: PerformanceProfiler
  readonly #graph = new DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes>()
  readonly #renderer: Sigma<BrowserNodeAttributes, BrowserEdgeAttributes>
  readonly #camera
  readonly #overlays: ReportGraphOverlays
  readonly #diagnostics: ReportGraphDiagnostics
  readonly #labelVisibility: ReportGraphLabelVisibility
  #view: ReportView | undefined
  #interaction: ReportInteractionState = {
    selectedNodeId: undefined,
    hoveredNodeId: undefined,
  }
  #lensSettings: ReportLensSettings
  #dependencyFocus: DependencyFocus | undefined
  #diagnosticEmphasisNodeIds: ReadonlySet<string> | undefined
  #couplingCycleFocus: CouplingCycle | undefined
  #structureFocusNodeId: string | undefined
  #cameraResetAwaitingSettledRender = false
  #cameraAnimationGeneration = 0

  public constructor({
    root,
    container,
    initialLensSettings,
    performanceProfiler,
    events,
  }: {
    readonly root: HTMLElement
    readonly container: HTMLElement
    readonly initialLensSettings: ReportLensSettings
    readonly performanceProfiler: PerformanceProfiler
    readonly events: ReportGraphEvents
  }) {
    this.#root = root
    this.#container = container
    this.#lensSettings = initialLensSettings
    this.#events = events
    this.#performanceProfiler = performanceProfiler
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
    this.#cancelCameraAnimation()
    this.#view = view
    this.#graph.clear()
    this.#labelVisibility.reset()

    for (const node of view.nodes) {
      this.#graph.addNode(node.id, {
        size: node.size,
        color: node.color,
        nodeKind: "report-node",
        reportNodeKind: node.reportNode.kind,
        label: reportNodeLabel(node.reportNode),
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
      const externalPackage = edge.targetKind === "external-package"
      const typeOnly = edge.dependencyKind === "type-only"
      this.#graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
        edgeKind: "dependency",
        dependencyTargetKind: edge.targetKind,
        dependencyKind: edge.dependencyKind,
        type: "arrow",
        color: typeOnly ? TYPE_ONLY_DEPENDENCY_EDGE_COLOR : externalPackage ? EXTERNAL_DEPENDENCY_EDGE_COLOR : DEPENDENCY_EDGE_COLOR,
        size: 3,
        weight: typeOnly ? TYPE_ONLY_DEPENDENCY_EDGE_WEIGHT : externalPackage ? EXTERNAL_DEPENDENCY_EDGE_WEIGHT : DEPENDENCY_EDGE_WEIGHT,
      })
    }

    const layoutMetrics = this.#performanceProfiler.measure("browser-layout", () => layoutReportGraph(this.#graph))
    this.#diagnostics.writeLayout(layoutMetrics)

    this.#synchronizeEdgeFocus()
    this.#updateViewDiagnostics()
    this.#writeInteractionDiagnostics()
    this.#renderer.refresh()
  }

  /** Change render-only lens settings without rebuilding layout inputs. */
  public setLensSettings(lensSettings: ReportLensSettings): void {
    const structureEdgesChanged = lensSettings.structureEdges !== this.#lensSettings.structureEdges
    const dependencyEdgesChanged = lensSettings.dependencyDisplay !== this.#lensSettings.dependencyDisplay
    this.#lensSettings = lensSettings
    this.#synchronizeEdgeFocus()
    if (structureEdgesChanged) {
      this.#renderer.scheduleRender()
    }
    if (dependencyEdgesChanged) {
      this.#refreshDependencyEdges()
    }
  }

  /** Emphasize diagnostic result nodes without changing their metric-driven fill. */
  public setDiagnosticEmphasis(nodeIds: ReadonlySet<string> | undefined): void {
    this.#diagnosticEmphasisNodeIds = nodeIds
    this.#root.dataset.diagnosticEmphasisNodeIds = JSON.stringify([...(nodeIds ?? [])])
    this.#renderer.scheduleRender()
  }

  /** Focus every member and internal edge of one selected Coupling cycle. */
  public setCouplingCycleFocus(cycle: CouplingCycle | undefined): void {
    this.#couplingCycleFocus = cycle
    if (cycle === undefined) {
      delete this.#root.dataset.selectedCouplingCycle
    } else {
      this.#root.dataset.selectedCouplingCycle = cycle.id
    }
    this.#synchronizeEdgeFocus()
    this.#refreshDependencyEdges()
    this.#renderer.scheduleRender()
  }

  /** Render browser-owned selection and hover state without changing navigation. */
  public renderInteraction(interaction: ReportInteractionState): void {
    const previousHoveredNodeId = this.#interaction.hoveredNodeId
    this.#interaction = interaction
    if (
      interaction.hoveredNodeId !== undefined &&
      this.#graph.hasNode(interaction.hoveredNodeId) &&
      this.#graph.getNodeAttribute(interaction.hoveredNodeId, "nodeKind") === "directory"
    ) {
      this.#labelVisibility.hoverDirectory(interaction.hoveredNodeId)
    } else {
      this.#labelVisibility.clearDirectoryHover()
    }
    this.#synchronizeEdgeFocus()
    this.#writeInteractionDiagnostics()
    this.#refreshHoverTransition(previousHoveredNodeId)
    this.#renderer.refresh()
  }

  /** Animate the camera center to one visible node. */
  public centerNode(nodeId: string): void {
    const node = this.#renderer.getNodeDisplayData(nodeId)
    if (node === undefined) {
      return
    }

    const animationGeneration = ++this.#cameraAnimationGeneration
    delete this.#container.dataset.cameraFocusedNode
    this.#camera.animate({ x: node.x, y: node.y }, { duration: 250 }, () => {
      if (animationGeneration === this.#cameraAnimationGeneration) {
        this.#container.dataset.cameraFocusedNode = nodeId
      }
    })
  }

  /** Reset and then enlarge the camera view until every rendered circle fits. */
  public resetCamera(): void {
    const animationGeneration = ++this.#cameraAnimationGeneration
    this.#container.dataset.cameraReset = "pending"
    this.#cameraResetAwaitingSettledRender = false
    void this.#camera.animatedReset({ duration: 250 }).then(() => {
      if (animationGeneration !== this.#cameraAnimationGeneration) {
        return undefined
      }
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
      this.#overlays.renderStructureLinks(
        this.#view?.structureEdges ?? [],
        this.#lensSettings.structureEdges,
        this.#hasEdgeFocus(),
        this.#structureFocusNodeId,
      )
      this.#overlays.renderDiagnosticEmphasis(
        new Set([...(this.#diagnosticEmphasisNodeIds ?? []), ...(this.#couplingCycleFocus?.memberNodeIds ?? [])]),
      )
      this.#overlays.renderDependencyFocus(this.#dependencyFocus)
      this.#overlays.renderHoveredNodeLabel(this.#interaction.hoveredNodeId)
      this.#diagnostics.writeDependencyEdges(this.#dependencyEdgeIds(), this.#lensSettings.dependencyDisplay)
      const labelRefreshScheduled = this.#labelVisibility.synchronizeAfterRender()
      this.#diagnostics.writeCamera(this.#labelVisibility.reportNodeLabelsAreVisible, this.#camera.getState())
      if (!labelRefreshScheduled) {
        this.#diagnostics.writeRenderedLabels()
        this.#diagnostics.writeNodeCircles()
        this.#completePendingCameraReset()
      }
    })
    this.#renderer.on("enterNode", ({ node }) => {
      this.#events.onPreviewNode(node)
    })
    this.#renderer.on("leaveNode", ({ node }) => {
      this.#events.onClearPreview(node)
    })
    this.#renderer.on("clickNode", ({ node }) => {
      this.#events.onActivateNode(node)
    })
    this.#renderer.on("clickStage", () => {
      this.#events.onClearSelection()
    })
  }

  #cancelCameraAnimation(): void {
    if (!this.#camera.isAnimated()) {
      return
    }
    this.#cameraAnimationGeneration += 1
    this.#camera.animate(this.#camera.getState(), { duration: 0 }, () => {})
  }

  #reduceEdge(edge: string, attributes: BrowserEdgeAttributes): Partial<EdgeDisplayData> {
    if (attributes.edgeKind !== "dependency") {
      return attributes
    }
    if (attributes.hidden === true || this.#lensSettings.dependencyDisplay === "hidden") {
      return { ...attributes, hidden: true }
    }

    if (this.#couplingCycleFocus !== undefined) {
      return this.#couplingCycleFocus.internalEdgeIds.includes(edge)
        ? { ...attributes, hidden: false, color: DEPENDENCY_FOCUS_COLOR, size: CONSUMER_FOCUS_EDGE_SIZE, zIndex: 1 }
        : { ...attributes, hidden: true }
    }

    const relationship = this.#focusedDependencyEdgeRelationship(edge)
    if (this.#lensSettings.dependencyDisplay === "focused" && relationship === undefined) {
      return { ...attributes, hidden: true }
    }
    if (relationship === "dependency") {
      return { ...attributes, color: DEPENDENCY_FOCUS_COLOR, size: DEPENDENCY_FOCUS_EDGE_SIZE, zIndex: 1 }
    }
    if (relationship === "consumer") {
      return { ...attributes, color: CONSUMER_FOCUS_COLOR, size: CONSUMER_FOCUS_EDGE_SIZE, zIndex: 1 }
    }
    if (this.#hasEdgeFocus()) {
      return {
        ...attributes,
        color:
          attributes.dependencyKind === "type-only"
            ? DIMMED_TYPE_ONLY_DEPENDENCY_EDGE_COLOR
            : attributes.dependencyTargetKind === "external-package"
              ? DIMMED_EXTERNAL_DEPENDENCY_EDGE_COLOR
              : DIMMED_DEPENDENCY_EDGE_COLOR,
      }
    }
    return attributes
  }

  #reduceNode(node: string, attributes: BrowserNodeAttributes): Partial<NodeDisplayData> {
    const label =
      node === this.#interaction.hoveredNodeId && attributes.label !== undefined
        ? { forceLabel: true }
        : (attributes.nodeKind === "directory" && !this.#labelVisibility.directoryLabelIsVisible(node)) ||
            (attributes.nodeKind === "report-node" && !this.#labelVisibility.reportNodeLabelsAreVisible)
          ? { label: null, forceLabel: false }
          : {}
    if (node !== this.#interaction.selectedNodeId) {
      return { ...attributes, ...label }
    }
    return this.#lensSettings.projectFileSize === "visible-degree" &&
      attributes.nodeKind === "report-node" &&
      attributes.reportNodeKind === "project-file"
      ? { ...attributes, ...label, highlighted: true, zIndex: 1 }
      : { ...attributes, ...label, color: "#f4c66a", highlighted: true, zIndex: 1 }
  }

  #writeInteractionDiagnostics(): void {
    const selectedNodeId = this.#interaction.selectedNodeId
    if (selectedNodeId === undefined || !this.#graph.hasNode(selectedNodeId)) {
      delete this.#root.dataset.selectedNode
    } else {
      this.#root.dataset.selectedNode = selectedNodeId
    }
    if (this.#interaction.hoveredNodeId === undefined) {
      delete this.#root.dataset.hoveredNode
    } else {
      this.#root.dataset.hoveredNode = this.#interaction.hoveredNodeId
    }
  }

  #updateViewDiagnostics(): void {
    const view = this.#view
    if (view === undefined) {
      return
    }
    this.#root.dataset.activeLineCategories = view.settings.lineCategories.join(",")
    this.#root.dataset.externalPackages = view.settings.externalPackages ? "visible" : "hidden"
    this.#root.dataset.typeOnlyDependencies = view.settings.typeOnlyDependencies ? "visible" : "hidden"
    this.#root.dataset.runtimeDependencies = view.settings.runtimeDependencies ? "visible" : "hidden"
    this.#root.dataset.workspacePackages = JSON.stringify([...view.scope.workspacePackages])
    this.#root.dataset.dependencyDisplay = view.settings.dependencyDisplay
    this.#root.dataset.projectFileColor = view.settings.projectFileColor
    this.#root.dataset.projectFileSize = view.settings.projectFileSize
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

  #dependencyFocusFor(nodeId: string): DependencyFocus {
    const view = this.#view
    if (view === undefined) {
      return { nodeId, dependencyNodeIds: new Set(), consumerNodeIds: new Set() }
    }
    return {
      nodeId,
      dependencyNodeIds: new Set(
        visibleRelationships(view, nodeId, "dependency").flatMap((relationship) =>
          relationship.nodeId === nodeId ? [] : [relationship.nodeId],
        ),
      ),
      consumerNodeIds: new Set(
        visibleRelationships(view, nodeId, "consumer").flatMap((relationship) =>
          relationship.nodeId === nodeId ? [] : [relationship.nodeId],
        ),
      ),
    }
  }

  #hasEdgeFocus(): boolean {
    return this.#dependencyFocus !== undefined || this.#structureFocusNodeId !== undefined
  }

  #synchronizeEdgeFocus(): void {
    if (this.#couplingCycleFocus !== undefined) {
      this.#structureFocusNodeId = undefined
      this.#dependencyFocus = undefined
      this.#diagnostics.writeDependencyFocus(undefined)
      return
    }
    const focusedNodeId = this.#interaction.hoveredNodeId ?? this.#interaction.selectedNodeId
    this.#structureFocusNodeId =
      focusedNodeId !== undefined &&
      this.#graph.hasNode(focusedNodeId) &&
      this.#graph.getNodeAttribute(focusedNodeId, "nodeKind") === "directory"
        ? focusedNodeId
        : undefined
    this.#dependencyFocus =
      this.#lensSettings.dependencyDisplay !== "hidden" && focusedNodeId !== undefined && this.#view?.nodeIds.has(focusedNodeId) === true
        ? this.#dependencyFocusFor(focusedNodeId)
        : undefined
    this.#diagnostics.writeDependencyFocus(this.#dependencyFocus)
  }

  #refreshDependencyEdges(): void {
    this.#renderer.refresh({
      partialGraph: { edges: this.#dependencyEdgeIds() },
      schedule: true,
      skipIndexation: true,
    })
  }

  #refreshHoverTransition(previousHoveredNodeId: string | undefined): void {
    const nodes = [...new Set([previousHoveredNodeId, this.#interaction.hoveredNodeId])].flatMap((nodeId) =>
      nodeId !== undefined && this.#graph.hasNode(nodeId) ? [nodeId] : [],
    )
    this.#renderer.refresh({
      partialGraph: { nodes, edges: this.#dependencyEdgeIds() },
      schedule: true,
      skipIndexation: true,
    })
  }
}

function reportNodeLabel(node: ReportNode): string {
  return node.kind === "project-file" ? (node.path.split("/").at(-1) ?? node.path) : node.packageName
}

function graphFitRatioMultiplier(centerDisplacement: number, radius: number, viewportHalfExtent: number): number {
  // With position-referenced item sizes, a ratio multiplier m scales center
  // displacement by 1/m and radius by 1/sqrt(m). Solve
  // displacement/m + radius/sqrt(m) <= viewportHalfExtent for m.
  const squareRootMultiplier =
    (radius + Math.sqrt(radius * radius + 4 * viewportHalfExtent * centerDisplacement)) / (2 * viewportHalfExtent)
  return squareRootMultiplier * squareRootMultiplier
}
