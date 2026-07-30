import type { ReportFindingPanelElements } from "./report-elements.js"
import type { ReportFinding, ReportFindingGroup } from "./report-findings.js"
import type { ReportLens } from "./report-lens.js"

const SUMMARY_LIMIT = 5

/** Owns the Overview findings, complete-list expansion, and left-panel tabs. */
export class ReportFindingsPanel {
  readonly #elements: ReportFindingPanelElements
  readonly #activateNode: (nodeId: string) => void
  #activePanel: "findings" | "project-files" = "findings"
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
  }: {
    readonly elements: ReportFindingPanelElements
    readonly activateNode: (nodeId: string) => void
  }) {
    this.#elements = elements
    this.#activateNode = activateNode
    elements.findingsTab.addEventListener("click", () => {
      this.#selectPanel("findings")
    })
    elements.projectFilesTab.addEventListener("click", () => {
      this.#selectPanel("project-files")
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
      this.#activePanel = lens === "overview" ? "findings" : "project-files"
      this.#selectedLens = lens
    }
    this.#renderPanelVisibility()
  }

  /**
   * Reflect persistent selection on every finding that activates that entity.
   *
   * @param selectedNodeId - Current persistent graph entity selection.
   */
  public renderSelection(selectedNodeId: string | undefined): void {
    this.#selectedNodeId = selectedNodeId
    this.#renderSelection()
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

  #selectPanel(panel: "findings" | "project-files"): void {
    this.#activePanel = panel
    this.#renderPanelVisibility()
  }

  #renderPanelVisibility(): void {
    const overview = this.#selectedLens === "overview"
    const showFindings = overview && this.#activePanel === "findings"
    this.#elements.tabs.hidden = !overview
    this.#elements.findingsTab.setAttribute("aria-selected", String(showFindings))
    this.#elements.projectFilesTab.setAttribute("aria-selected", String(!showFindings))
    this.#elements.findingsTab.tabIndex = showFindings ? 0 : -1
    this.#elements.projectFilesTab.tabIndex = showFindings ? -1 : 0
    this.#elements.panel.hidden = !showFindings
    this.#elements.projectFilesPanel.hidden = showFindings
  }

  #renderSelection(): void {
    for (const button of this.#elements.categories.querySelectorAll<HTMLButtonElement>(".finding-card")) {
      button.setAttribute("aria-current", String(button.dataset.findingEntityId === this.#selectedNodeId))
    }
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
