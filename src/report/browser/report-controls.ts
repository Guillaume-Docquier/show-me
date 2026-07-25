import type { ReportControlElements } from "./report-elements.js"
import { REPORT_LINE_CATEGORIES, type BrowserPresentation, type ReportLineCategory } from "./report-presentation.js"
import type { ReportViewState } from "./report-view.js"

/** User-controlled edge visibility that does not change graph layout inputs. */
export type EdgeVisibilityState = {
  readonly structureEdges: boolean
  readonly dependencyEdges: boolean
}

/** Default edge visibility selected by the generated HTML shell. */
export const INITIAL_EDGE_VISIBILITY: EdgeVisibilityState = {
  structureEdges: true,
  dependencyEdges: true,
}

export type ReportControlEvents = {
  readonly onViewStateChange: (state: ReportViewState) => void
  readonly onEdgeVisibilityChange: (state: EdgeVisibilityState) => void
  readonly onResetCamera: () => void
}

type LineCategoryControl = {
  readonly category: ReportLineCategory
  readonly input: HTMLInputElement
}

/** Owns creation, event binding, and state reflection for report controls. */
export class ReportControls {
  readonly #elements: ReportControlElements
  readonly #events: ReportControlEvents
  readonly #lineCategoryControls: readonly LineCategoryControl[]
  readonly #workspacePackageInputs: readonly HTMLInputElement[]
  #viewState: ReportViewState
  #edgeVisibility: EdgeVisibilityState

  public constructor({
    elements,
    presentation,
    initialViewState,
    initialEdgeVisibility,
    events,
  }: {
    readonly elements: ReportControlElements
    readonly presentation: BrowserPresentation
    readonly initialViewState: ReportViewState
    readonly initialEdgeVisibility: EdgeVisibilityState
    readonly events: ReportControlEvents
  }) {
    this.#elements = elements
    this.#events = events
    this.#viewState = initialViewState
    this.#edgeVisibility = initialEdgeVisibility
    this.#lineCategoryControls = [
      { category: "code", input: elements.lineCategoryCode },
      { category: "comment", input: elements.lineCategoryComment },
      { category: "blank", input: elements.lineCategoryBlank },
    ]
    this.#workspacePackageInputs = presentation.workspacePackages.map((workspacePackage, index) =>
      this.#createWorkspacePackageControl(workspacePackage, index),
    )
    elements.workspacePackageFieldset.hidden = this.#workspacePackageInputs.length === 0
    this.#bindEvents()
    this.render(initialViewState, initialEdgeVisibility)
  }

  /** Reflect accepted application state into every control. */
  public render(viewState: ReportViewState, edgeVisibility: EdgeVisibilityState): void {
    this.#viewState = viewState
    this.#edgeVisibility = edgeVisibility

    for (const control of this.#lineCategoryControls) {
      control.input.checked = viewState.lineCategories.includes(control.category)
      control.input.disabled = viewState.lineCategories.length === 1 && control.input.checked
    }
    this.#elements.externalPackageToggle.checked = viewState.externalPackages
    this.#elements.typeOnlyDependencyToggle.checked = viewState.typeOnlyDependencies
    this.#elements.structureEdgesToggle.checked = edgeVisibility.structureEdges
    this.#elements.dependencyEdgesToggle.checked = edgeVisibility.dependencyEdges
    for (const input of this.#workspacePackageInputs) {
      input.checked = viewState.workspacePackages.has(input.dataset.workspacePackage ?? "")
    }
  }

  #bindEvents(): void {
    for (const control of this.#lineCategoryControls) {
      control.input.addEventListener("change", () => {
        const lineCategories = this.#selectedLineCategories()
        if (lineCategories.length === 0) {
          control.input.checked = true
          return
        }
        this.#events.onViewStateChange({ ...this.#viewState, lineCategories })
      })
    }
    this.#elements.externalPackageToggle.addEventListener("change", () => {
      this.#events.onViewStateChange({
        ...this.#viewState,
        externalPackages: this.#elements.externalPackageToggle.checked,
      })
    })
    this.#elements.typeOnlyDependencyToggle.addEventListener("change", () => {
      this.#events.onViewStateChange({
        ...this.#viewState,
        typeOnlyDependencies: this.#elements.typeOnlyDependencyToggle.checked,
      })
    })
    this.#elements.structureEdgesToggle.addEventListener("change", () => {
      this.#events.onEdgeVisibilityChange({
        ...this.#edgeVisibility,
        structureEdges: this.#elements.structureEdgesToggle.checked,
      })
    })
    this.#elements.dependencyEdgesToggle.addEventListener("change", () => {
      this.#events.onEdgeVisibilityChange({
        ...this.#edgeVisibility,
        dependencyEdges: this.#elements.dependencyEdgesToggle.checked,
      })
    })
    this.#elements.resetCameraButton.addEventListener("click", this.#events.onResetCamera)
  }

  #createWorkspacePackageControl(workspacePackage: BrowserPresentation["workspacePackages"][number], index: number): HTMLInputElement {
    const reportDocument = this.#elements.workspacePackageControls.ownerDocument
    const label = reportDocument.createElement("label")
    const input = reportDocument.createElement("input")
    input.id = `workspace-package-${index}`
    input.type = "checkbox"
    input.dataset.workspacePackage = workspacePackage.path
    input.addEventListener("change", () => {
      const visibleWorkspacePackages = new Set(this.#viewState.workspacePackages)
      if (input.checked) {
        visibleWorkspacePackages.add(workspacePackage.path)
      } else {
        visibleWorkspacePackages.delete(workspacePackage.path)
      }
      this.#events.onViewStateChange({
        ...this.#viewState,
        workspacePackages: visibleWorkspacePackages,
      })
    })
    label.append(input, reportDocument.createTextNode(workspacePackage.name))
    this.#elements.workspacePackageControls.append(label)
    return input
  }

  #selectedLineCategories(): readonly ReportLineCategory[] {
    return REPORT_LINE_CATEGORIES.filter(
      (category) => this.#lineCategoryControls.find((control) => control.category === category)?.input.checked === true,
    )
  }
}
