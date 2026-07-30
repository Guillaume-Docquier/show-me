import type { ReportControlElements } from "./report-elements.js"
import {
  activeReportLens,
  customizeReportLens,
  reportLensSettings,
  selectReportLens,
  updateReportScope,
  type DependencyDisplay,
  type ProjectFileColor,
  type ReportLensSettings,
  type ReportPresentationState,
} from "./report-lens.js"
import { REPORT_LINE_CATEGORIES, type BrowserPresentation, type ReportLineCategory } from "./report-presentation.js"

export type ReportControlEvents = {
  readonly onPresentationStateChange: (state: ReportPresentationState) => void
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
  readonly #customLensOption: HTMLOptionElement
  #presentationState: ReportPresentationState

  public constructor({
    elements,
    presentation,
    initialPresentationState,
    events,
  }: {
    readonly elements: ReportControlElements
    readonly presentation: BrowserPresentation
    readonly initialPresentationState: ReportPresentationState
    readonly events: ReportControlEvents
  }) {
    this.#elements = elements
    this.#events = events
    this.#presentationState = initialPresentationState
    this.#lineCategoryControls = [
      { category: "code", input: elements.lineCategoryCode },
      { category: "comment", input: elements.lineCategoryComment },
      { category: "blank", input: elements.lineCategoryBlank },
    ]
    const customLensOption = elements.lensSelector.querySelector<HTMLOptionElement>('option[value="custom"]')
    if (customLensOption === null) {
      throw new Error("Static report lens selector is missing its Custom state.")
    }
    this.#customLensOption = customLensOption
    this.#workspacePackageInputs = presentation.workspacePackages.map((workspacePackage, index) =>
      this.#createWorkspacePackageControl(workspacePackage, index),
    )
    elements.workspacePackageFieldset.hidden = this.#workspacePackageInputs.length === 0
    this.#bindEvents()
    this.render(initialPresentationState)
  }

  /** Reflect accepted application state into every control and relevant legend. */
  public render(presentationState: ReportPresentationState): void {
    this.#presentationState = presentationState
    const settings = reportLensSettings(presentationState)
    const activeLens = activeReportLens(presentationState)

    this.#customLensOption.hidden = activeLens !== "custom"
    this.#elements.lensSelector.value = activeLens
    for (const control of this.#lineCategoryControls) {
      control.input.checked = settings.lineCategories.includes(control.category)
      control.input.disabled = settings.lineCategories.length === 1 && control.input.checked
    }
    this.#elements.externalPackageToggle.checked = settings.externalPackages
    this.#elements.runtimeDependencyToggle.checked = settings.runtimeDependencies
    this.#elements.typeOnlyDependencyToggle.checked = settings.typeOnlyDependencies
    this.#elements.runtimeDependencyToggle.disabled = settings.runtimeDependencies && !settings.typeOnlyDependencies
    this.#elements.typeOnlyDependencyToggle.disabled = settings.typeOnlyDependencies && !settings.runtimeDependencies
    this.#elements.structureEdgesToggle.checked = settings.structureEdges
    this.#elements.dependencyDisplay.value = settings.dependencyDisplay
    this.#elements.projectFileColor.value = settings.projectFileColor
    this.#elements.lineCategoryControls.hidden = settings.projectFileSize === "visible-degree"
    for (const input of this.#workspacePackageInputs) {
      input.checked = presentationState.scope.workspacePackages.has(input.dataset.workspacePackage ?? "")
    }

    const dependencyLegendVisible = settings.dependencyDisplay !== "hidden"
    this.#elements.structureEdgeKey.hidden = !settings.structureEdges
    this.#elements.runtimeDependencyEdgeKey.hidden = !dependencyLegendVisible || !settings.runtimeDependencies
    this.#elements.typeOnlyDependencyEdgeKey.hidden = !dependencyLegendVisible || !settings.typeOnlyDependencies
    this.#elements.externalDependencyEdgeKey.hidden = !dependencyLegendVisible || !settings.externalPackages
    this.#elements.graphKey.hidden = !settings.structureEdges && !dependencyLegendVisible
    this.#elements.coverageLegend.hidden = settings.projectFileColor !== "coverage"
    this.#elements.activeSizeKey.textContent =
      settings.projectFileSize === "visible-degree"
        ? "Size: visible direct degree"
        : `Size: ${settings.lineCategories.map(lineCategoryLabel).join(" + ")} lines`
  }

  /** Show the relationship-direction legend only while Coupling focus is active. */
  public renderFocusLegend(visible: boolean): void {
    this.#elements.focusLegend.hidden = !visible
  }

  #bindEvents(): void {
    this.#elements.lensSelector.addEventListener("change", () => {
      const lens = this.#elements.lensSelector.value
      if (lens === "overview" || lens === "structure" || lens === "coverage" || lens === "coupling" || lens === "boundaries") {
        this.#events.onPresentationStateChange(selectReportLens(this.#presentationState, lens))
      }
    })
    for (const control of this.#lineCategoryControls) {
      control.input.addEventListener("change", () => {
        const lineCategories = this.#selectedLineCategories()
        if (lineCategories.length === 0) {
          control.input.checked = true
          return
        }
        this.#applyAdvancedSettings({ ...reportLensSettings(this.#presentationState), lineCategories })
      })
    }
    this.#elements.externalPackageToggle.addEventListener("change", () => {
      this.#applyAdvancedSettings({
        ...reportLensSettings(this.#presentationState),
        externalPackages: this.#elements.externalPackageToggle.checked,
      })
    })
    this.#elements.typeOnlyDependencyToggle.addEventListener("change", () => {
      this.#applyAdvancedSettings({
        ...reportLensSettings(this.#presentationState),
        typeOnlyDependencies: this.#elements.typeOnlyDependencyToggle.checked,
      })
    })
    this.#elements.runtimeDependencyToggle.addEventListener("change", () => {
      this.#applyAdvancedSettings({
        ...reportLensSettings(this.#presentationState),
        runtimeDependencies: this.#elements.runtimeDependencyToggle.checked,
      })
    })
    this.#elements.structureEdgesToggle.addEventListener("change", () => {
      this.#applyAdvancedSettings({
        ...reportLensSettings(this.#presentationState),
        structureEdges: this.#elements.structureEdgesToggle.checked,
      })
    })
    this.#elements.dependencyDisplay.addEventListener("change", () => {
      const dependencyDisplay = this.#selectedDependencyDisplay()
      this.#applyAdvancedSettings({ ...reportLensSettings(this.#presentationState), dependencyDisplay })
    })
    this.#elements.projectFileColor.addEventListener("change", () => {
      const projectFileColor = this.#selectedProjectFileColor()
      this.#applyAdvancedSettings({ ...reportLensSettings(this.#presentationState), projectFileColor })
    })
    this.#elements.resetCameraButton.addEventListener("click", this.#events.onResetCamera)
  }

  #applyAdvancedSettings(settings: ReportLensSettings): void {
    this.#events.onPresentationStateChange(customizeReportLens(this.#presentationState, settings))
  }

  #createWorkspacePackageControl(workspacePackage: BrowserPresentation["workspacePackages"][number], index: number): HTMLInputElement {
    const reportDocument = this.#elements.workspacePackageControls.ownerDocument
    const label = reportDocument.createElement("label")
    const input = reportDocument.createElement("input")
    input.id = `workspace-package-${index}`
    input.type = "checkbox"
    input.dataset.workspacePackage = workspacePackage.path
    input.addEventListener("change", () => {
      const visibleWorkspacePackages = new Set(this.#presentationState.scope.workspacePackages)
      if (input.checked) {
        visibleWorkspacePackages.add(workspacePackage.path)
      } else {
        visibleWorkspacePackages.delete(workspacePackage.path)
      }
      this.#events.onPresentationStateChange(updateReportScope(this.#presentationState, { workspacePackages: visibleWorkspacePackages }))
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

  #selectedDependencyDisplay(): DependencyDisplay {
    const value = this.#elements.dependencyDisplay.value
    if (value === "all" || value === "focused" || value === "hidden") {
      return value
    }
    throw new Error(`Unknown dependency display ${value}.`)
  }

  #selectedProjectFileColor(): ProjectFileColor {
    const value = this.#elements.projectFileColor.value
    if (value === "coverage" || value === "neutral") {
      return value
    }
    throw new Error(`Unknown project-file color ${value}.`)
  }
}

function lineCategoryLabel(category: ReportLineCategory): string {
  return category === "comment" ? "comment" : category
}
