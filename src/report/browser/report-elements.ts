/** DOM owned by the report header. */
export type ReportHeadingElements = {
  readonly projectName: HTMLElement
  readonly projectFileCount: HTMLElement
}

/** DOM owned by report controls. */
export type ReportControlElements = {
  readonly resetCameraButton: HTMLButtonElement
  readonly externalPackageToggle: HTMLInputElement
  readonly structureEdgesToggle: HTMLInputElement
  readonly dependencyEdgesToggle: HTMLInputElement
  readonly workspacePackageFieldset: HTMLElement
  readonly workspacePackageControls: HTMLElement
  readonly lineCategoryCode: HTMLInputElement
  readonly lineCategoryComment: HTMLInputElement
  readonly lineCategoryBlank: HTMLInputElement
}

/** DOM owned by the files and selected-node panels. */
export type ReportPanelElements = {
  readonly fileSearch: HTMLInputElement
  readonly fileTreeEmpty: HTMLElement
  readonly fileList: HTMLElement
  readonly externalPackageSection: HTMLElement
  readonly externalPackageList: HTMLElement
  readonly selectedEmpty: HTMLElement
  readonly selectedDetails: HTMLElement
  readonly selectedNodeType: HTMLElement
  readonly selectedPath: HTMLElement
  readonly selectedCodeLines: HTMLElement
  readonly selectedCommentLines: HTMLElement
  readonly selectedBlankLines: HTMLElement
  readonly selectedDependencies: HTMLElement
  readonly selectedConsumers: HTMLElement
  readonly selectedCoverage: HTMLElement
  readonly selectedDependencyNodes: HTMLElement
  readonly selectedConsumerNodes: HTMLElement
  readonly selectedParentDirectory: HTMLElement
  readonly selectedDirectoryChildren: HTMLElement
  readonly projectFileDetails: NodeListOf<HTMLElement>
  readonly dependencyDetails: NodeListOf<HTMLElement>
  readonly directoryDetails: NodeListOf<HTMLElement>
}

/** Complete generated-report DOM organized by the module that owns it. */
export type ReportElements = {
  readonly root: HTMLElement
  readonly graphContainer: HTMLElement
  readonly coverageLegend: HTMLElement
  readonly heading: ReportHeadingElements
  readonly controls: ReportControlElements
  readonly panels: ReportPanelElements
}

/**
 * Parse the fixed generated HTML shell into typed, responsibility-oriented groups.
 *
 * Missing or incompatible elements mean the HTML shell and browser bundle were
 * built from different contracts, so this boundary fails during boot.
 */
export function getReportElements(reportDocument: Document): ReportElements {
  return {
    root: reportDocument.documentElement,
    graphContainer: requiredElement(reportDocument, "graph"),
    coverageLegend: requiredElement(reportDocument, "coverage-legend"),
    heading: {
      projectName: requiredElement(reportDocument, "project-name"),
      projectFileCount: requiredElement(reportDocument, "project-file-count"),
    },
    controls: {
      resetCameraButton: requiredButton(reportDocument, "reset-camera"),
      externalPackageToggle: requiredCheckbox(reportDocument, "external-packages-toggle"),
      structureEdgesToggle: requiredCheckbox(reportDocument, "structure-edges-toggle"),
      dependencyEdgesToggle: requiredCheckbox(reportDocument, "dependency-edges-toggle"),
      workspacePackageFieldset: requiredElement(reportDocument, "workspace-package-fieldset"),
      workspacePackageControls: requiredElement(reportDocument, "workspace-package-controls"),
      lineCategoryCode: requiredCheckbox(reportDocument, "line-category-code"),
      lineCategoryComment: requiredCheckbox(reportDocument, "line-category-comment"),
      lineCategoryBlank: requiredCheckbox(reportDocument, "line-category-blank"),
    },
    panels: {
      fileSearch: requiredSearchInput(reportDocument, "file-search"),
      fileTreeEmpty: requiredElement(reportDocument, "file-tree-empty"),
      fileList: requiredElement(reportDocument, "file-list"),
      externalPackageSection: requiredElement(reportDocument, "external-package-section"),
      externalPackageList: requiredElement(reportDocument, "external-package-list"),
      selectedEmpty: requiredElement(reportDocument, "selected-empty"),
      selectedDetails: requiredElement(reportDocument, "selected-details"),
      selectedNodeType: requiredElement(reportDocument, "selected-node-type"),
      selectedPath: requiredElement(reportDocument, "selected-path"),
      selectedCodeLines: requiredElement(reportDocument, "selected-code-lines"),
      selectedCommentLines: requiredElement(reportDocument, "selected-comment-lines"),
      selectedBlankLines: requiredElement(reportDocument, "selected-blank-lines"),
      selectedDependencies: requiredElement(reportDocument, "selected-dependencies"),
      selectedConsumers: requiredElement(reportDocument, "selected-consumers"),
      selectedCoverage: requiredElement(reportDocument, "selected-coverage"),
      selectedDependencyNodes: requiredElement(reportDocument, "selected-dependency-nodes"),
      selectedConsumerNodes: requiredElement(reportDocument, "selected-consumer-files"),
      selectedParentDirectory: requiredElement(reportDocument, "selected-parent-directory"),
      selectedDirectoryChildren: requiredElement(reportDocument, "selected-directory-children"),
      projectFileDetails: reportDocument.querySelectorAll<HTMLElement>("[data-project-file-detail]"),
      dependencyDetails: reportDocument.querySelectorAll<HTMLElement>("[data-dependency-detail]"),
      directoryDetails: reportDocument.querySelectorAll<HTMLElement>("[data-directory-detail]"),
    },
  }
}

function requiredElement(reportDocument: Document, id: string): HTMLElement {
  const element = reportDocument.getElementById(id)
  if (element === null) {
    throw new Error(`Static report is missing #${id}.`)
  }
  return element
}

function requiredCheckbox(reportDocument: Document, id: string): HTMLInputElement {
  const element = requiredElement(reportDocument, id)
  if (!(element instanceof HTMLInputElement) || element.type !== "checkbox") {
    throw new Error("Static report #" + id + " is not a checkbox.")
  }
  return element
}

function requiredButton(reportDocument: Document, id: string): HTMLButtonElement {
  const element = requiredElement(reportDocument, id)
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error("Static report #" + id + " is not a button.")
  }
  return element
}

function requiredSearchInput(reportDocument: Document, id: string): HTMLInputElement {
  const element = requiredElement(reportDocument, id)
  if (!(element instanceof HTMLInputElement) || element.type !== "search") {
    throw new Error("Static report #" + id + " is not a search input.")
  }
  return element
}
