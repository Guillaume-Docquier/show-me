import { ReportCouplingPanel } from "./report-coupling-panel.js"
import type { CouplingCycle, CouplingFilterState, CouplingLensResults } from "./report-coupling.js"
import type { CoverageFilterState, CoverageLensResults } from "./report-coverage.js"
import type { ReportFindingPanelElements } from "./report-elements.js"
import type { ReportFinding, ReportFindingGroup } from "./report-findings.js"
import type { ReportLens } from "./report-lens.js"

const SUMMARY_LIMIT = 5

/** Owns diagnostic result panels, their filters, and the project-files tab. */
export class ReportFindingsPanel {
  readonly #elements: ReportFindingPanelElements
  readonly #activateNode: (nodeId: string) => void
  readonly #updateCoverageFilters: (filters: CoverageFilterState) => void
  readonly #couplingPanel: ReportCouplingPanel
  #activePanel: "findings" | "coverage" | "coupling" | "project-files" = "findings"
  #selectedNodeId: string | undefined
  #selectedLens: ReportLens = "overview"

  /**
   * Create the browser findings panel.
   *
   * @param options - Fixed DOM and shared entity-activation operation.
   */
  public constructor({
    elements,
    activateNode,
    initialCoverageFilters,
    updateCoverageFilters,
    activateCycle,
    updateCouplingFilters,
  }: {
    readonly elements: ReportFindingPanelElements
    readonly activateNode: (nodeId: string) => void
    readonly initialCoverageFilters: CoverageFilterState
    readonly updateCoverageFilters: (filters: CoverageFilterState) => void
    readonly activateCycle: (cycle: CouplingCycle) => void
    readonly updateCouplingFilters: (filters: CouplingFilterState) => void
  }) {
    this.#elements = elements
    this.#activateNode = activateNode
    this.#updateCoverageFilters = updateCoverageFilters
    this.#couplingPanel = new ReportCouplingPanel({
      elements,
      activateNode,
      activateCycle,
      updateFilters: updateCouplingFilters,
    })
    this.#elements.coverageMinimumCodeLines.value = String(initialCoverageFilters.minimumCodeLines)
    this.#elements.coverageMaximumPercentage.value = String(initialCoverageFilters.maximumCoverage)
    this.#elements.coverageIncludeUnavailable.checked = initialCoverageFilters.includeUnavailableCoverage
    elements.findingsTab.addEventListener("click", () => {
      this.#selectPanel("findings")
    })
    elements.coverageTab.addEventListener("click", () => {
      this.#selectPanel("coverage")
    })
    elements.couplingTab.addEventListener("click", () => {
      this.#selectPanel("coupling")
    })
    elements.projectFilesTab.addEventListener("click", () => {
      this.#selectPanel("project-files")
    })
    elements.coverageMinimumCodeLines.addEventListener("input", () => {
      this.#emitCoverageFilters()
    })
    elements.coverageMaximumPercentage.addEventListener("input", () => {
      this.#emitCoverageFilters()
    })
    elements.coverageIncludeUnavailable.addEventListener("change", () => {
      this.#emitCoverageFilters()
    })
    this.#renderPanelVisibility()
  }

  /**
   * Render one already-ranked finding collection without deriving it again.
   *
   * @param groups - Non-empty finding categories in stable display order.
   */
  public render(groups: readonly ReportFindingGroup[]): void {
    this.#elements.categories.replaceChildren()
    const findingCount = groups.reduce((total, { findings }) => total + findings.length, 0)
    this.#elements.empty.hidden = findingCount > 0
    this.#elements.categories.hidden = findingCount === 0
    this.#elements.panel.dataset.findingCount = String(findingCount)
    this.#elements.panel.dataset.findingCategories = JSON.stringify(groups.map(({ category }) => category))

    for (const group of groups) {
      this.#elements.categories.append(this.#category(group))
    }
    this.#renderSelection()
  }

  /**
   * Switch the left workspace for one selected named lens.
   *
   * @param lens - Named preset underlying the active or Custom presentation.
   */
  public renderLens(lens: ReportLens): void {
    if (lens !== this.#selectedLens) {
      this.#activePanel =
        lens === "overview" ? "findings" : lens === "coverage" ? "coverage" : lens === "coupling" ? "coupling" : "project-files"
      this.#selectedLens = lens
    }
    this.#renderPanelVisibility()
  }

  /**
   * Reflect persistent selection on every finding that activates that entity.
   *
   * @param selectedNodeId - Current persistent graph entity selection.
   */
  public renderSelection(selectedNodeId: string | undefined, selectedCycleId?: string): void {
    this.#selectedNodeId = selectedNodeId
    this.#renderSelection()
    this.#couplingPanel.renderSelection(selectedNodeId, selectedCycleId)
  }

  /** Render Coverage lens controls, scoped counts, and stable matching rows. */
  public renderCoverage(results: CoverageLensResults, filters: CoverageFilterState): void {
    this.#elements.coverageMinimumCodeLines.value = String(filters.minimumCodeLines)
    this.#elements.coverageMaximumPercentage.value = String(filters.maximumCoverage)
    this.#elements.coverageIncludeUnavailable.checked = filters.includeUnavailableCoverage
    this.#elements.coverageMatchingCount.textContent = String(results.matches.length)
    this.#elements.coverageKnownCount.textContent = String(results.knownCoverageFileCount)
    this.#elements.coverageUnavailableCount.textContent = String(results.unavailableCoverageFileCount)
    this.#elements.coverageEmpty.hidden = results.matches.length > 0
    this.#elements.coverageResults.hidden = results.matches.length === 0
    this.#elements.coveragePanel.dataset.matchingFileCount = String(results.matches.length)
    this.#elements.coveragePanel.dataset.knownCoverageFileCount = String(results.knownCoverageFileCount)
    this.#elements.coveragePanel.dataset.unavailableCoverageFileCount = String(results.unavailableCoverageFileCount)
    this.#elements.coveragePanel.dataset.coverageFilters = JSON.stringify(filters)
    this.#elements.coverageResults.replaceChildren(
      ...results.matches.map((result) => {
        const item = this.#elements.coverageResults.ownerDocument.createElement("li")
        const button = this.#elements.coverageResults.ownerDocument.createElement("button")
        button.type = "button"
        button.className = "diagnostic-result coverage-result"
        button.dataset.coverageEntityId = result.nodeId
        button.dataset.codeLines = String(result.codeLines)
        button.dataset.coverage = result.coverage === undefined ? "unavailable" : String(result.coverage)
        button.setAttribute("aria-current", String(result.nodeId === this.#selectedNodeId))
        button.setAttribute(
          "aria-label",
          `${result.path}, ${result.codeLines} physical code lines, ${result.coverage === undefined ? "coverage unavailable" : `${result.coverage}% executable-line coverage`}.`,
        )
        const path = this.#elements.coverageResults.ownerDocument.createElement("strong")
        path.textContent = result.path
        const codeLines = this.#elements.coverageResults.ownerDocument.createElement("span")
        codeLines.textContent = `${result.codeLines} code lines`
        const coverage = this.#elements.coverageResults.ownerDocument.createElement("span")
        coverage.textContent = result.coverage === undefined ? "Coverage unavailable" : `${result.coverage}% coverage`
        button.append(path, codeLines, coverage)
        button.addEventListener("click", () => {
          this.#activateNode(result.nodeId)
        })
        item.append(button)
        return item
      }),
    )
  }

  /** Render Coupling lens metrics, filters, and selectable cycles. */
  public renderCoupling(results: CouplingLensResults, filters: CouplingFilterState): void {
    this.#couplingPanel.render(results, filters)
  }

  #category(group: ReportFindingGroup): HTMLElement {
    const reportDocument = this.#elements.categories.ownerDocument
    const section = reportDocument.createElement("section")
    section.className = "finding-category"
    section.dataset.findingCategory = group.category
    section.dataset.findingCount = String(group.findings.length)
    const heading = reportDocument.createElement("h3")
    heading.textContent = group.label
    const count = reportDocument.createElement("span")
    count.className = "finding-category-count"
    count.textContent = String(group.findings.length)
    heading.append(count)

    const list = reportDocument.createElement("ol")
    list.className = "finding-list"
    for (const [index, finding] of group.findings.entries()) {
      const item = reportDocument.createElement("li")
      item.hidden = index >= SUMMARY_LIMIT
      item.append(this.#findingButton(group.label, finding, index + 1))
      list.append(item)
    }
    section.append(heading, list)

    if (group.findings.length > SUMMARY_LIMIT) {
      const toggle = reportDocument.createElement("button")
      toggle.type = "button"
      toggle.className = "finding-list-toggle"
      toggle.textContent = `Show all ${group.findings.length}`
      toggle.setAttribute("aria-expanded", "false")
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true"
        for (const [index, item] of [...list.children].entries()) {
          if (item instanceof HTMLElement) {
            item.hidden = expanded && index >= SUMMARY_LIMIT
          }
        }
        toggle.setAttribute("aria-expanded", String(!expanded))
        toggle.textContent = expanded ? `Show all ${group.findings.length}` : "Show top 5"
      })
      section.append(toggle)
    }
    return section
  }

  #findingButton(categoryLabel: string, finding: ReportFinding, rank: number): HTMLButtonElement {
    const reportDocument = this.#elements.categories.ownerDocument
    const button = reportDocument.createElement("button")
    button.type = "button"
    button.className = "finding-card"
    button.dataset.findingId = finding.id
    button.dataset.findingCategory = finding.category
    button.dataset.findingEntityId = finding.nodeId
    button.dataset.findingRank = String(rank)
    button.dataset.findingMetrics = JSON.stringify(findingMetrics(finding))
    button.setAttribute("aria-current", String(finding.nodeId === this.#selectedNodeId))
    button.setAttribute("aria-label", `${categoryLabel}, rank ${rank}, ${finding.entityName}. ${finding.explanation}`)

    const entity = reportDocument.createElement("strong")
    entity.className = "finding-entity"
    entity.textContent = finding.entityName
    const metrics = reportDocument.createElement("span")
    metrics.className = "finding-metrics"
    metrics.textContent = findingMetricsText(finding)
    const explanation = reportDocument.createElement("span")
    explanation.className = "finding-explanation"
    explanation.textContent = finding.explanation
    button.append(entity, metrics, explanation)
    button.addEventListener("click", () => {
      this.#activateNode(finding.nodeId)
    })
    return button
  }

  #selectPanel(panel: "findings" | "coverage" | "coupling" | "project-files"): void {
    this.#activePanel = panel
    this.#renderPanelVisibility()
  }

  #renderPanelVisibility(): void {
    const overview = this.#selectedLens === "overview"
    const coverage = this.#selectedLens === "coverage"
    const coupling = this.#selectedLens === "coupling"
    const showFindings = overview && this.#activePanel === "findings"
    const showCoverage = coverage && this.#activePanel === "coverage"
    const showCoupling = coupling && this.#activePanel === "coupling"
    const showProjectFiles = !showFindings && !showCoverage && !showCoupling
    this.#elements.tabs.hidden = !overview && !coverage && !coupling
    this.#elements.findingsTab.hidden = !overview
    this.#elements.coverageTab.hidden = !coverage
    this.#elements.couplingTab.hidden = !coupling
    this.#elements.findingsTab.setAttribute("aria-selected", String(showFindings))
    this.#elements.coverageTab.setAttribute("aria-selected", String(showCoverage))
    this.#elements.couplingTab.setAttribute("aria-selected", String(showCoupling))
    this.#elements.projectFilesTab.setAttribute("aria-selected", String(showProjectFiles))
    this.#elements.findingsTab.tabIndex = showFindings ? 0 : -1
    this.#elements.coverageTab.tabIndex = showCoverage ? 0 : -1
    this.#elements.couplingTab.tabIndex = showCoupling ? 0 : -1
    this.#elements.projectFilesTab.tabIndex = showProjectFiles ? 0 : -1
    this.#elements.panel.hidden = !showFindings
    this.#elements.coveragePanel.hidden = !showCoverage
    this.#elements.couplingPanel.hidden = !showCoupling
    this.#elements.projectFilesPanel.hidden = !showProjectFiles
  }

  #renderSelection(): void {
    for (const button of this.#elements.categories.querySelectorAll<HTMLButtonElement>(".finding-card")) {
      button.setAttribute("aria-current", String(button.dataset.findingEntityId === this.#selectedNodeId))
    }
    for (const button of this.#elements.coverageResults.querySelectorAll<HTMLButtonElement>(".coverage-result")) {
      button.setAttribute("aria-current", String(button.dataset.coverageEntityId === this.#selectedNodeId))
    }
  }

  #emitCoverageFilters(): void {
    const minimumCodeLines = this.#elements.coverageMinimumCodeLines.valueAsNumber
    const maximumCoverage = this.#elements.coverageMaximumPercentage.valueAsNumber
    if (!Number.isFinite(minimumCodeLines) || !Number.isFinite(maximumCoverage)) {
      return
    }
    this.#updateCoverageFilters({
      minimumCodeLines,
      maximumCoverage,
      includeUnavailableCoverage: this.#elements.coverageIncludeUnavailable.checked,
    })
  }
}

function findingMetrics(finding: ReportFinding): Readonly<Record<string, string | number | readonly string[]>> {
  switch (finding.category) {
    case "large-low-coverage":
      return { codeLines: finding.codeLines, coverage: finding.coverage }
    case "large-unavailable-coverage":
      return { codeLines: finding.codeLines, coverage: "unavailable" }
    case "highest-fan-out":
    case "highest-fan-in":
      return {
        total: finding.totalCount,
        runtime: finding.runtimeCount,
        typeOnly: finding.typeOnlyCount,
      }
    case "dependency-cycles":
      return {
        cycleKind: finding.cycleKind,
        memberCount: finding.memberPaths.length,
        memberPaths: finding.memberPaths,
      }
    case "cross-workspace-relationships":
      return {
        dependencyKind: finding.dependencyKind,
        relationships: finding.relationshipCount,
        sourceWorkspace: finding.sourceWorkspace,
        targetWorkspace: finding.targetWorkspace,
      }
  }
}

function findingMetricsText(finding: ReportFinding): string {
  switch (finding.category) {
    case "large-low-coverage":
      return `${finding.codeLines} code lines · ${finding.coverage}% coverage`
    case "large-unavailable-coverage":
      return `${finding.codeLines} code lines · Coverage unavailable`
    case "highest-fan-out":
    case "highest-fan-in":
      return `${finding.totalCount} total · ${finding.runtimeCount} runtime · ${finding.typeOnlyCount} type only`
    case "dependency-cycles":
      return `${finding.cycleKind === "runtime" ? "Runtime" : "Includes type only"} · ${finding.memberPaths.length} ${
        finding.memberPaths.length === 1 ? "member" : "members"
      }`
    case "cross-workspace-relationships":
      return `${finding.relationshipCount} ${finding.dependencyKind} ${finding.relationshipCount === 1 ? "relationship" : "relationships"}`
  }
}
