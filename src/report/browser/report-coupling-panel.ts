import type { CouplingCycle, CouplingFilterState, CouplingLensResults, CouplingMetric } from "./report-coupling.js"
import type { ReportFindingPanelElements } from "./report-elements.js"

/** Owns Coupling lens controls, ranked files, cycle groups, and semantic diagnostics. */
export class ReportCouplingPanel {
  readonly #elements: ReportFindingPanelElements
  readonly #activateNode: (nodeId: string) => void
  readonly #activateCycle: (cycle: CouplingCycle) => void
  readonly #updateFilters: (filters: CouplingFilterState) => void
  #selectedNodeId: string | undefined
  #selectedCycleId: string | undefined

  public constructor({
    elements,
    activateNode,
    activateCycle,
    updateFilters,
  }: {
    readonly elements: ReportFindingPanelElements
    readonly activateNode: (nodeId: string) => void
    readonly activateCycle: (cycle: CouplingCycle) => void
    readonly updateFilters: (filters: CouplingFilterState) => void
  }) {
    this.#elements = elements
    this.#activateNode = activateNode
    this.#activateCycle = activateCycle
    this.#updateFilters = updateFilters
    elements.couplingRuntimeDependencies.addEventListener("change", () => {
      this.#emitFilters()
    })
    elements.couplingTypeOnlyDependencies.addEventListener("change", () => {
      this.#emitFilters()
    })
    elements.couplingBackgroundDependencies.addEventListener("change", () => {
      this.#emitFilters()
    })
  }

  /** Render already-derived direct metrics and cycle groups. */
  public render(results: CouplingLensResults, filters: CouplingFilterState): void {
    this.#elements.couplingRuntimeDependencies.checked = filters.runtimeDependencies
    this.#elements.couplingTypeOnlyDependencies.checked = filters.typeOnlyDependencies
    this.#elements.couplingBackgroundDependencies.checked = filters.showBackgroundDependencies
    const rankedMetrics = results.metrics.filter(({ totalDegree }) => totalDegree > 0)
    this.#elements.couplingFileCount.textContent = String(rankedMetrics.length)
    this.#elements.couplingRelationshipCount.textContent = String(results.edges.length)
    this.#elements.couplingCycleCount.textContent = String(results.cycles.length)
    this.#elements.couplingEmpty.hidden = rankedMetrics.length > 0
    this.#elements.couplingResults.hidden = rankedMetrics.length === 0
    this.#elements.couplingCyclesSection.hidden = results.cycles.length === 0
    this.#elements.couplingPanel.dataset.couplingFilters = JSON.stringify(filters)
    this.#elements.couplingPanel.dataset.couplingFileCount = String(rankedMetrics.length)
    this.#elements.couplingPanel.dataset.couplingRelationshipCount = String(results.edges.length)
    this.#elements.couplingPanel.dataset.couplingCycleCount = String(results.cycles.length)
    this.#elements.couplingResults.replaceChildren(...rankedMetrics.map((metric) => this.#metricItem(metric)))
    this.#elements.couplingCycles.replaceChildren(...results.cycles.map((cycle) => this.#cycleItem(cycle)))
  }

  /** Reflect ordinary node selection or Coupling cycle-group selection. */
  public renderSelection(selectedNodeId: string | undefined, selectedCycleId: string | undefined): void {
    this.#selectedNodeId = selectedNodeId
    this.#selectedCycleId = selectedCycleId
    for (const button of this.#elements.couplingResults.querySelectorAll<HTMLButtonElement>(".coupling-result")) {
      button.setAttribute("aria-current", String(button.dataset.couplingEntityId === selectedNodeId))
    }
    for (const button of this.#elements.couplingCycles.querySelectorAll<HTMLButtonElement>(".coupling-cycle")) {
      button.setAttribute("aria-current", String(button.dataset.couplingCycleId === selectedCycleId))
    }
  }

  #metricItem(metric: CouplingMetric): HTMLLIElement {
    const reportDocument = this.#elements.couplingResults.ownerDocument
    const item = reportDocument.createElement("li")
    const button = reportDocument.createElement("button")
    button.type = "button"
    button.className = "diagnostic-result coupling-result"
    button.dataset.couplingEntityId = metric.nodeId
    button.dataset.totalDegree = String(metric.totalDegree)
    button.dataset.fanOut = String(metric.fanOut)
    button.dataset.fanIn = String(metric.fanIn)
    button.dataset.runtimeRelationships = String(metric.runtimeFanOut + metric.runtimeFanIn)
    button.dataset.typeOnlyRelationships = String(metric.typeOnlyFanOut + metric.typeOnlyFanIn)
    button.dataset.cycleCount = String(metric.cycleIds.length)
    button.setAttribute("aria-current", String(metric.nodeId === this.#selectedNodeId))
    button.setAttribute(
      "aria-label",
      `${metric.path}, direct degree ${metric.totalDegree}, fan-out ${metric.fanOut}, fan-in ${metric.fanIn}, ${metric.runtimeFanOut + metric.runtimeFanIn} runtime, ${metric.typeOnlyFanOut + metric.typeOnlyFanIn} type only, ${metric.cycleIds.length} ${metric.cycleIds.length === 1 ? "cycle" : "cycles"}.`,
    )
    const path = reportDocument.createElement("strong")
    path.textContent = metric.path
    const fan = reportDocument.createElement("span")
    fan.textContent = `Out ${metric.fanOut} · In ${metric.fanIn}`
    const kinds = reportDocument.createElement("span")
    kinds.textContent = `${metric.runtimeFanOut + metric.runtimeFanIn} runtime · ${metric.typeOnlyFanOut + metric.typeOnlyFanIn} type only`
    const cycles = reportDocument.createElement("span")
    cycles.className = "coupling-cycle-indicator"
    cycles.textContent =
      metric.cycleIds.length === 0 ? "No cycle" : `${metric.cycleIds.length} ${metric.cycleIds.length === 1 ? "cycle" : "cycles"}`
    button.append(path, fan, kinds, cycles)
    button.addEventListener("click", () => {
      this.#activateNode(metric.nodeId)
    })
    item.append(button)
    return item
  }

  #cycleItem(cycle: CouplingCycle): HTMLLIElement {
    const reportDocument = this.#elements.couplingCycles.ownerDocument
    const item = reportDocument.createElement("li")
    const button = reportDocument.createElement("button")
    button.type = "button"
    button.className = "diagnostic-result coupling-cycle"
    button.dataset.couplingCycleId = cycle.id
    button.dataset.couplingCycleKind = cycle.kind
    button.dataset.memberNodeIds = JSON.stringify(cycle.memberNodeIds)
    button.dataset.internalEdgeIds = JSON.stringify(cycle.internalEdgeIds)
    button.setAttribute("aria-current", String(cycle.id === this.#selectedCycleId))
    const kindLabel = cycle.kind === "runtime" ? "Runtime" : "Includes type only"
    button.setAttribute(
      "aria-label",
      `${kindLabel} cycle, ${cycle.memberPaths.length} ${cycle.memberPaths.length === 1 ? "member" : "members"}: ${cycle.memberPaths.join(", ")}.`,
    )
    const label = reportDocument.createElement("strong")
    label.textContent = cycle.memberPaths.join(" ↔ ")
    const kind = reportDocument.createElement("span")
    kind.textContent = kindLabel
    const count = reportDocument.createElement("span")
    count.textContent = `${cycle.memberPaths.length} ${cycle.memberPaths.length === 1 ? "member" : "members"}`
    button.append(label, kind, count)
    button.addEventListener("click", () => {
      this.#activateCycle(cycle)
    })
    item.append(button)
    return item
  }

  #emitFilters(): void {
    const runtimeDependencies = this.#elements.couplingRuntimeDependencies.checked
    const typeOnlyDependencies = this.#elements.couplingTypeOnlyDependencies.checked
    if (!runtimeDependencies && !typeOnlyDependencies) {
      const changed = this.#elements.couplingRuntimeDependencies.ownerDocument.activeElement
      if (changed === this.#elements.couplingRuntimeDependencies) {
        this.#elements.couplingRuntimeDependencies.checked = true
      } else {
        this.#elements.couplingTypeOnlyDependencies.checked = true
      }
    }
    this.#updateFilters({
      runtimeDependencies: this.#elements.couplingRuntimeDependencies.checked,
      typeOnlyDependencies: this.#elements.couplingTypeOnlyDependencies.checked,
      showBackgroundDependencies: this.#elements.couplingBackgroundDependencies.checked,
    })
  }
}
