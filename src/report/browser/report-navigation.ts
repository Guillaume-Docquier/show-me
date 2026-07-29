import type { ReportInteractionState } from "./report-interaction.js"

/**
 * Complete browser-owned navigation state shared by the graph and report panels.
 */
export type ReportNavigationState = ReportInteractionState & {
  readonly history: readonly string[]
  readonly historyIndex: number
  readonly canGoBack: boolean
  readonly canGoForward: boolean
}

/**
 * Effects produced by browser navigation transitions.
 */
export type ReportNavigationEvents = {
  readonly onChange: (state: ReportNavigationState, centeredNodeId: string | undefined) => void
}

/**
 * Owns persistent selection, transient hover preview, and explicit-selection history.
 *
 * Every report surface activates entities through this controller. It is the
 * only browser operation that couples selection, centering, history, and panel
 * rendering. Hover uses separate preview operations and never enters history.
 */
export class ReportNavigation {
  readonly #events: ReportNavigationEvents
  #visibleNodeIds: ReadonlySet<string> = new Set()
  #history: readonly string[] = []
  #historyIndex = -1
  #selectedNodeId: string | undefined
  #hoveredNodeId: string | undefined

  public constructor(events: ReportNavigationEvents) {
    this.#events = events
  }

  /**
   * Reconcile navigation with the current visible graph without changing its view.
   *
   * @param visibleNodeIds - Entity identities available in the current graph projection.
   */
  public setVisibleNodeIds(visibleNodeIds: ReadonlySet<string>): void {
    this.#visibleNodeIds = visibleNodeIds
    const retainedHistory = this.#history.flatMap((nodeId, originalIndex) =>
      visibleNodeIds.has(nodeId) ? [{ nodeId, originalIndex }] : [],
    )
    const selectedNodeId = this.#selectedNodeId !== undefined && visibleNodeIds.has(this.#selectedNodeId) ? this.#selectedNodeId : undefined
    const retainedHistoryIndex = retainedHistory.findIndex(({ originalIndex }) => originalIndex === this.#historyIndex)
    this.#history = retainedHistory.map(({ nodeId }) => nodeId)
    this.#selectedNodeId = selectedNodeId
    this.#hoveredNodeId = this.#hoveredNodeId !== undefined && visibleNodeIds.has(this.#hoveredNodeId) ? this.#hoveredNodeId : undefined
    this.#historyIndex = selectedNodeId === undefined ? this.#history.length : retainedHistoryIndex
    this.#emit(undefined)
  }

  /**
   * Explicitly select and center one visible entity.
   *
   * @param nodeId - Visible graph entity activated by a report surface.
   */
  public activate(nodeId: string): void {
    if (!this.#visibleNodeIds.has(nodeId)) {
      return
    }

    if (this.#selectedNodeId !== nodeId) {
      const retainedHistory =
        this.#historyIndex >= 0 && this.#historyIndex < this.#history.length
          ? this.#history.slice(0, this.#historyIndex + 1)
          : this.#history
      this.#history = retainedHistory.at(-1) === nodeId ? retainedHistory : [...retainedHistory, nodeId]
      this.#historyIndex = this.#history.length - 1
      this.#selectedNodeId = nodeId
    }
    this.#emit(nodeId)
  }

  /**
   * Preview one visible entity without changing selection, history, or camera.
   *
   * @param nodeId - Visible graph entity under the pointer.
   */
  public preview(nodeId: string): void {
    if (!this.#visibleNodeIds.has(nodeId) || this.#hoveredNodeId === nodeId) {
      return
    }
    this.#hoveredNodeId = nodeId
    this.#emit(undefined)
  }

  /**
   * Clear a matching transient preview.
   *
   * @param nodeId - Optional entity whose preview is ending.
   */
  public clearPreview(nodeId?: string): void {
    if (nodeId !== undefined && this.#hoveredNodeId !== nodeId) {
      return
    }
    if (this.#hoveredNodeId === undefined) {
      return
    }
    this.#hoveredNodeId = undefined
    this.#emit(undefined)
  }

  /**
   * Clear persistent selection without erasing explicit-selection history.
   */
  public clearSelection(): void {
    if (this.#selectedNodeId === undefined) {
      return
    }
    this.#selectedNodeId = undefined
    this.#historyIndex = this.#history.length
    this.#emit(undefined)
  }

  /**
   * Select and center the preceding explicit selection when one exists.
   */
  public goBack(): void {
    const nextIndex = this.#selectedNodeId === undefined ? this.#history.length - 1 : this.#historyIndex - 1
    if (nextIndex < 0) {
      return
    }
    this.#historyIndex = nextIndex
    this.#selectedNodeId = this.#history[nextIndex]
    this.#emit(this.#selectedNodeId)
  }

  /**
   * Select and center the following explicit selection when one exists.
   */
  public goForward(): void {
    const nextIndex = this.#historyIndex + 1
    if (this.#selectedNodeId === undefined || nextIndex >= this.#history.length) {
      return
    }
    this.#historyIndex = nextIndex
    this.#selectedNodeId = this.#history[nextIndex]
    this.#emit(this.#selectedNodeId)
  }

  #emit(centeredNodeId: string | undefined): void {
    this.#events.onChange(
      {
        selectedNodeId: this.#selectedNodeId,
        hoveredNodeId: this.#hoveredNodeId,
        history: this.#history,
        historyIndex: this.#historyIndex,
        canGoBack: this.#selectedNodeId === undefined ? this.#history.length > 0 : this.#historyIndex > 0,
        canGoForward: this.#selectedNodeId !== undefined && this.#historyIndex < this.#history.length - 1,
      },
      centeredNodeId,
    )
  }
}
