import {
  type BoundaryDrillDown,
  type BoundaryFilterState,
  type BoundaryLensResults,
  type BoundarySelection,
  type ReportBoundary,
} from "./report-boundaries.js"
import type { ReportFindingPanelElements } from "./report-elements.js"

/** Owns the accessible directed boundary matrix and its relationship filters. */
export class ReportBoundariesPanel {
  readonly #elements: ReportFindingPanelElements
  readonly #activateSelection: (selection: BoundarySelection) => void
  readonly #clearSelection: () => void
  readonly #updateFilters: (filters: BoundaryFilterState) => void
  #selectedId: string | undefined

  public constructor({
    elements,
    activateSelection,
    clearSelection,
    updateFilters,
  }: {
    readonly elements: ReportFindingPanelElements
    readonly activateSelection: (selection: BoundarySelection) => void
    readonly clearSelection: () => void
    readonly updateFilters: (filters: BoundaryFilterState) => void
  }) {
    this.#elements = elements
    this.#activateSelection = activateSelection
    this.#clearSelection = clearSelection
    this.#updateFilters = updateFilters
    elements.boundariesRuntimeDependencies.addEventListener("change", () => {
      this.#emitFilters()
    })
    elements.boundariesTypeOnlyDependencies.addEventListener("change", () => {
      this.#emitFilters()
    })
    elements.boundariesCompleteMatrix.addEventListener("click", this.#clearSelection)
  }

  /** Render already-derived boundaries, counts, and every directed matrix cell. */
  public render(results: BoundaryLensResults, filters: BoundaryFilterState): void {
    this.#elements.boundariesRuntimeDependencies.checked = filters.runtimeDependencies
    this.#elements.boundariesTypeOnlyDependencies.checked = filters.typeOnlyDependencies
    this.#elements.boundariesBoundaryCount.textContent = String(results.boundaries.length)
    this.#elements.boundariesRuntimeCount.textContent = String(results.runtimeCount)
    this.#elements.boundariesTypeOnlyCount.textContent = String(results.typeOnlyCount)
    this.#elements.boundariesEmpty.hidden = results.boundaries.length > 0
    this.#elements.boundariesMatrix.hidden = results.boundaries.length === 0
    this.#elements.boundariesPanel.dataset.boundaryCount = String(results.boundaries.length)
    this.#elements.boundariesPanel.dataset.relationshipCount = String(results.relationshipCount)
    this.#elements.boundariesPanel.dataset.runtimeCount = String(results.runtimeCount)
    this.#elements.boundariesPanel.dataset.typeOnlyCount = String(results.typeOnlyCount)
    this.#elements.boundariesPanel.dataset.boundaryFilters = JSON.stringify(filters)
    this.#elements.boundariesPanel.dataset.boundaryOrder = JSON.stringify(results.boundaries.map(({ id }) => id))
    this.#elements.boundariesMatrix.replaceChildren(this.#table(results))
    this.renderSelection(undefined)
  }

  /** Mark one aggregate selection and expose its exact semantic drill-down state. */
  public renderSelection(drillDown: BoundaryDrillDown | undefined): void {
    this.#selectedId = drillDown?.id
    this.#elements.boundariesCompleteMatrix.hidden = drillDown === undefined
    if (drillDown === undefined) {
      delete this.#elements.boundariesPanel.dataset.selectedBoundaryKind
      delete this.#elements.boundariesPanel.dataset.selectedBoundaryId
      delete this.#elements.boundariesPanel.dataset.selectedBoundarySource
      delete this.#elements.boundariesPanel.dataset.selectedBoundaryTarget
      delete this.#elements.boundariesPanel.dataset.selectedRelationshipCount
    } else {
      this.#elements.boundariesPanel.dataset.selectedBoundaryKind = drillDown.kind
      this.#elements.boundariesPanel.dataset.selectedBoundaryId = drillDown.id
      this.#elements.boundariesPanel.dataset.selectedBoundarySource = drillDown.sourceLabel
      this.#elements.boundariesPanel.dataset.selectedBoundaryTarget = drillDown.targetLabel
      this.#elements.boundariesPanel.dataset.selectedRelationshipCount = String(drillDown.relationships.length)
    }
    for (const button of this.#elements.boundariesMatrix.querySelectorAll<HTMLButtonElement>("button[data-boundary-id]")) {
      button.setAttribute("aria-current", String(button.dataset.boundaryId === drillDown?.id))
    }
    for (const button of this.#elements.boundariesMatrix.querySelectorAll<HTMLButtonElement>("button[data-boundary-cell-id]")) {
      button.setAttribute("aria-current", String(button.dataset.boundaryCellId === drillDown?.id))
    }
  }

  #table(results: BoundaryLensResults): HTMLTableElement {
    const reportDocument = this.#elements.boundariesMatrix.ownerDocument
    const table = reportDocument.createElement("table")
    table.className = "boundary-matrix"
    table.setAttribute("aria-label", "Directed project-file dependencies by boundary, source rows and target columns")
    const caption = reportDocument.createElement("caption")
    caption.textContent = "Source rows → target columns"
    const head = reportDocument.createElement("thead")
    const headRow = reportDocument.createElement("tr")
    const corner = reportDocument.createElement("th")
    corner.scope = "col"
    corner.textContent = "Source ↓ / Target →"
    headRow.append(corner, ...results.boundaries.map((boundary) => this.#boundaryHeading(boundary, "col")))
    head.append(headRow)
    const body = reportDocument.createElement("tbody")
    for (const source of results.boundaries) {
      const row = reportDocument.createElement("tr")
      row.append(this.#boundaryHeading(source, "row"))
      for (const target of results.boundaries) {
        const cell = results.cellById.get(`${source.id}->${target.id}`)
        if (cell === undefined) {
          throw new Error(`Boundary matrix is missing ${source.id} to ${target.id}.`)
        }
        const cellElement = reportDocument.createElement("td")
        cellElement.className = source.id === target.id ? "boundary-cell boundary-cell-self" : "boundary-cell boundary-cell-cross"
        cellElement.dataset.boundaryCellId = cell.id
        cellElement.dataset.sourceBoundaryId = source.id
        cellElement.dataset.targetBoundaryId = target.id
        cellElement.dataset.runtimeCount = String(cell.runtimeCount)
        cellElement.dataset.typeOnlyCount = String(cell.typeOnlyCount)
        cellElement.dataset.relationshipCount = String(cell.relationships.length)
        if (cell.relationships.length === 0) {
          cellElement.textContent = "—"
          cellElement.setAttribute("aria-label", `${source.label} source to ${target.label} target: no relationships.`)
        } else {
          const button = reportDocument.createElement("button")
          button.type = "button"
          button.dataset.boundaryCellId = cell.id
          button.dataset.sourceBoundaryId = source.id
          button.dataset.targetBoundaryId = target.id
          button.setAttribute("aria-current", String(this.#selectedId === cell.id))
          button.setAttribute(
            "aria-label",
            `${source.label} source to ${target.label} target: ${cell.runtimeCount} runtime and ${cell.typeOnlyCount} type-only relationships.`,
          )
          const runtime = reportDocument.createElement("span")
          runtime.textContent = `${cell.runtimeCount} R`
          const typeOnly = reportDocument.createElement("span")
          typeOnly.textContent = `${cell.typeOnlyCount} T`
          button.append(runtime, typeOnly)
          button.addEventListener("click", () => {
            this.#activateSelection({
              kind: "pair",
              sourceBoundaryId: cell.sourceBoundaryId,
              targetBoundaryId: cell.targetBoundaryId,
            })
          })
          cellElement.append(button)
        }
        row.append(cellElement)
      }
      body.append(row)
    }
    table.append(caption, head, body)
    return table
  }

  #boundaryHeading(boundary: ReportBoundary, scope: "col" | "row"): HTMLTableCellElement {
    const reportDocument = this.#elements.boundariesMatrix.ownerDocument
    const heading = reportDocument.createElement("th")
    heading.scope = scope
    const button = reportDocument.createElement("button")
    button.type = "button"
    button.dataset.boundaryId = boundary.id
    button.dataset.boundaryKind = boundary.kind
    button.dataset.boundaryFileCount = String(boundary.fileNodeIds.length)
    button.textContent = boundary.label
    button.setAttribute("aria-current", String(this.#selectedId === boundary.id))
    button.setAttribute("aria-label", `${boundary.label} boundary, ${boundary.fileNodeIds.length} project files.`)
    button.addEventListener("click", () => {
      this.#activateSelection({ kind: "boundary", boundaryId: boundary.id })
    })
    heading.append(button)
    return heading
  }

  #emitFilters(): void {
    const runtimeDependencies = this.#elements.boundariesRuntimeDependencies.checked
    const typeOnlyDependencies = this.#elements.boundariesTypeOnlyDependencies.checked
    if (!runtimeDependencies && !typeOnlyDependencies) {
      const changed = this.#elements.boundariesRuntimeDependencies.ownerDocument.activeElement
      if (changed === this.#elements.boundariesRuntimeDependencies) {
        this.#elements.boundariesRuntimeDependencies.checked = true
      } else {
        this.#elements.boundariesTypeOnlyDependencies.checked = true
      }
    }
    this.#updateFilters({
      runtimeDependencies: this.#elements.boundariesRuntimeDependencies.checked,
      typeOnlyDependencies: this.#elements.boundariesTypeOnlyDependencies.checked,
    })
  }
}
