import type { DirectedGraph } from "graphology"
import type { Sigma } from "sigma"
import {
  fileLabelsAreVisible,
  selectVisibleDirectoryLabels,
  type DirectoryLabelCandidate,
  visibleDirectoryDepth,
} from "./directory-label-visibility.js"
import type { ReportGraphDiagnostics } from "./report-graph-diagnostics.js"
import {
  centeredNodeLabelGeometry,
  DIRECTORY_LABEL_COLLISION_PADDING,
  HOVER_LABEL_BACKGROUND,
  HOVER_LABEL_FOREGROUND,
  LABEL_FONT,
  LABEL_SIZE,
  LABEL_WEIGHT,
} from "./report-graph-labels.js"
import type { BrowserEdgeAttributes, BrowserNodeAttributes } from "./report-graph-types.js"

/** Owns zoom-aware file and directory label eligibility for one Sigma renderer. */
export class ReportGraphLabelVisibility {
  readonly #graph: DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes>
  readonly #renderer: Sigma<BrowserNodeAttributes, BrowserEdgeAttributes>
  readonly #container: HTMLElement
  readonly #measurementContext: CanvasRenderingContext2D
  readonly #diagnostics: ReportGraphDiagnostics
  #hoveredDirectoryNodeId: string | undefined
  #maximumVisibleDirectoryDepth: number
  #showFileLabels: boolean
  #visibleDirectoryLabels: readonly DirectoryLabelCandidate[] = []
  #visibleDirectoryLabelIds = new Set<string>()
  #dirty = true

  public constructor({
    graph,
    renderer,
    container,
    measurementContext,
    diagnostics,
  }: {
    readonly graph: DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes>
    readonly renderer: Sigma<BrowserNodeAttributes, BrowserEdgeAttributes>
    readonly container: HTMLElement
    readonly measurementContext: CanvasRenderingContext2D
    readonly diagnostics: ReportGraphDiagnostics
  }) {
    this.#graph = graph
    this.#renderer = renderer
    this.#container = container
    this.#measurementContext = measurementContext
    this.#diagnostics = diagnostics
    const cameraRatio = renderer.getCamera().getState().ratio
    this.#maximumVisibleDirectoryDepth = visibleDirectoryDepth(cameraRatio)
    this.#showFileLabels = fileLabelsAreVisible(cameraRatio)
  }

  public get fileLabelsAreVisible(): boolean {
    return this.#showFileLabels
  }

  public directoryLabelIsVisible(nodeId: string): boolean {
    return this.#visibleDirectoryLabelIds.has(nodeId)
  }

  /** Reset graph-membership-dependent label state. */
  public reset(): void {
    this.#hoveredDirectoryNodeId = undefined
    this.#visibleDirectoryLabels = []
    this.#visibleDirectoryLabelIds = new Set()
    delete this.#container.dataset.hoveredDirectoryLabel
    delete this.#container.dataset.directoryLabelHoverForeground
    delete this.#container.dataset.directoryLabelHoverBackground
    this.markDirty()
  }

  /** Prioritize and style one hovered directory label. */
  public hoverDirectory(nodeId: string): void {
    this.#hoveredDirectoryNodeId = nodeId
    this.#container.dataset.hoveredDirectoryLabel = nodeId
    this.#container.dataset.directoryLabelHoverForeground = HOVER_LABEL_FOREGROUND
    this.#container.dataset.directoryLabelHoverBackground = HOVER_LABEL_BACKGROUND
    this.markDirty()
    this.#renderer.scheduleRender()
  }

  /** Clear directory hover and schedule label eligibility recalculation. */
  public clearDirectoryHover(): void {
    if (this.#hoveredDirectoryNodeId === undefined) {
      return
    }
    this.#hoveredDirectoryNodeId = undefined
    delete this.#container.dataset.hoveredDirectoryLabel
    delete this.#container.dataset.directoryLabelHoverForeground
    delete this.#container.dataset.directoryLabelHoverBackground
    this.markDirty()
    this.#renderer.scheduleRender()
  }

  public markDirty(): void {
    this.#dirty = true
  }

  /**
   * Recalculate label eligibility after Sigma has current viewport geometry.
   *
   * @returns Whether this transition scheduled another render.
   */
  public synchronizeAfterRender(): boolean {
    if (!this.#dirty) {
      return false
    }
    this.#dirty = false
    const ratio = this.#renderer.getCamera().getState().ratio
    const nextMaximumDirectoryDepth = visibleDirectoryDepth(ratio)
    const nextShowFileLabels = fileLabelsAreVisible(ratio)
    const candidates = this.#directoryLabelCandidates(nextMaximumDirectoryDepth)
    const nextDirectoryLabels = selectVisibleDirectoryLabels(candidates, this.#renderer.getDimensions())
    const nextDirectoryLabelIds = new Set(nextDirectoryLabels.map(({ id }) => id))
    const directoryLabelsChanged = !setsEqual(this.#visibleDirectoryLabelIds, nextDirectoryLabelIds)
    const fileLabelsChanged = this.#showFileLabels !== nextShowFileLabels

    this.#maximumVisibleDirectoryDepth = nextMaximumDirectoryDepth
    this.#showFileLabels = nextShowFileLabels
    this.#visibleDirectoryLabels = nextDirectoryLabels
    this.#visibleDirectoryLabelIds = nextDirectoryLabelIds
    this.#diagnostics.writeDirectoryLabels({
      maximumDepth: this.#maximumVisibleDirectoryDepth,
      visibleLabels: this.#visibleDirectoryLabels,
      candidateCount: candidates.length,
    })

    if (fileLabelsChanged) {
      this.#renderer.scheduleRefresh()
      return true
    }
    if (directoryLabelsChanged) {
      this.#renderer.refresh({
        partialGraph: { nodes: this.#graph.filterNodes((_node, attributes) => attributes.nodeKind === "directory") },
        schedule: true,
        skipIndexation: true,
      })
      return true
    }
    return false
  }

  #directoryLabelCandidates(maximumDepth: number): readonly DirectoryLabelCandidate[] {
    const dimensions = this.#renderer.getDimensions()
    const candidates: DirectoryLabelCandidate[] = []
    this.#measurementContext.save()
    this.#measurementContext.font = `${LABEL_WEIGHT} ${LABEL_SIZE}px ${LABEL_FONT}`
    this.#graph.forEachNode((id, attributes) => {
      if (
        attributes.nodeKind !== "directory" ||
        attributes.directoryDepth === undefined ||
        attributes.label === undefined ||
        (attributes.directoryDepth > maximumDepth && id !== this.#hoveredDirectoryNodeId)
      ) {
        return
      }

      const node = this.#renderer.graphToViewport(attributes)
      const nodeSize = this.#renderer.scaleSize(attributes.size)
      const { bounds } = centeredNodeLabelGeometry(
        this.#measurementContext,
        attributes.label,
        node.x,
        node.y,
        nodeSize,
        LABEL_SIZE,
        DIRECTORY_LABEL_COLLISION_PADDING,
      )
      if (bounds.right <= 0 || bounds.bottom <= 0 || bounds.left >= dimensions.width || bounds.top >= dimensions.height) {
        return
      }
      candidates.push({
        id,
        label: attributes.label,
        depth: attributes.directoryDepth,
        descendantProjectFileCount: attributes.descendantProjectFileCount ?? 0,
        hovered: id === this.#hoveredDirectoryNodeId,
        nodeX: node.x,
        nodeY: node.y,
        bounds,
      })
    })
    this.#measurementContext.restore()
    return candidates
  }
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value))
}
