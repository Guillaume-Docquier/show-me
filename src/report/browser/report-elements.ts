/** DOM owned by the report header. */
export type ReportHeadingElements = {
  readonly projectName: HTMLElement
  readonly projectFileCount: HTMLElement
}

/** DOM owned by the Overview findings and left-workspace tabs. */
export type ReportFindingPanelElements = {
  readonly tabs: HTMLElement
  readonly findingsTab: HTMLButtonElement
  readonly coverageTab: HTMLButtonElement
  readonly projectFilesTab: HTMLButtonElement
  readonly panel: HTMLElement
  readonly categories: HTMLElement
  readonly empty: HTMLElement
  readonly projectFilesPanel: HTMLElement
  readonly coveragePanel: HTMLElement
  readonly coverageMinimumCodeLines: HTMLInputElement
  readonly coverageMaximumPercentage: HTMLInputElement
  readonly coverageIncludeUnavailable: HTMLInputElement
  readonly coverageMatchingCount: HTMLElement
  readonly coverageKnownCount: HTMLElement
  readonly coverageUnavailableCount: HTMLElement
  readonly coverageEmpty: HTMLElement
  readonly coverageResults: HTMLOListElement
}

/** DOM owned by report controls. */
export type ReportControlElements = {
  readonly lensSelector: HTMLSelectElement
  readonly advancedControls: HTMLDetailsElement
  readonly resetCameraButton: HTMLButtonElement
  readonly externalPackageToggle: HTMLInputElement
  readonly typeOnlyDependencyToggle: HTMLInputElement
  readonly structureEdgesToggle: HTMLInputElement
  readonly dependencyDisplay: HTMLSelectElement
  readonly projectFileColor: HTMLSelectElement
  readonly workspacePackageFieldset: HTMLElement
  readonly workspacePackageControls: HTMLElement
  readonly lineCategoryCode: HTMLInputElement
  readonly lineCategoryComment: HTMLInputElement
  readonly lineCategoryBlank: HTMLInputElement
  readonly graphKey: HTMLElement
  readonly structureEdgeKey: HTMLElement
  readonly runtimeDependencyEdgeKey: HTMLElement
  readonly typeOnlyDependencyEdgeKey: HTMLElement
  readonly externalDependencyEdgeKey: HTMLElement
  readonly coverageLegend: HTMLElement
  readonly activeSizeKey: HTMLElement
}

/** DOM owned by the files and selected-node panels. */
export type ReportPanelElements = {
  readonly fileSearch: HTMLInputElement
  readonly fileSearchResultCount: HTMLElement
  readonly fileTreeEmpty: HTMLElement
  readonly fileList: HTMLElement
  readonly selectedTreeSection: HTMLElement
  readonly selectedTreeItem: HTMLElement
  readonly externalPackageSection: HTMLElement
  readonly externalPackageList: HTMLElement
  readonly selectedEmpty: HTMLElement
  readonly selectedDetails: HTMLElement
  readonly selectionBreadcrumb: HTMLElement
  readonly navigationBackButton: HTMLButtonElement
  readonly navigationForwardButton: HTMLButtonElement
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
  readonly heading: ReportHeadingElements
  readonly findings: ReportFindingPanelElements
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
    heading: {
      projectName: requiredElement(reportDocument, "project-name"),
      projectFileCount: requiredElement(reportDocument, "project-file-count"),
    },
    findings: {
      tabs: requiredElement(reportDocument, "sidebar-tabs"),
      findingsTab: requiredButton(reportDocument, "findings-tab"),
      coverageTab: requiredButton(reportDocument, "coverage-tab"),
      projectFilesTab: requiredButton(reportDocument, "project-files-tab"),
      panel: requiredElement(reportDocument, "findings-panel"),
      categories: requiredElement(reportDocument, "findings-categories"),
      empty: requiredElement(reportDocument, "findings-empty"),
      projectFilesPanel: requiredElement(reportDocument, "project-files-panel"),
      coveragePanel: requiredElement(reportDocument, "coverage-panel"),
      coverageMinimumCodeLines: requiredNumberInput(reportDocument, "coverage-minimum-code-lines"),
      coverageMaximumPercentage: requiredNumberInput(reportDocument, "coverage-maximum-percentage"),
      coverageIncludeUnavailable: requiredCheckbox(reportDocument, "coverage-include-unavailable"),
      coverageMatchingCount: requiredElement(reportDocument, "coverage-matching-count"),
      coverageKnownCount: requiredElement(reportDocument, "coverage-known-count"),
      coverageUnavailableCount: requiredElement(reportDocument, "coverage-unavailable-count"),
      coverageEmpty: requiredElement(reportDocument, "coverage-empty"),
      coverageResults: requiredOrderedList(reportDocument, "coverage-results"),
    },
    controls: {
      lensSelector: requiredSelect(reportDocument, "lens-selector"),
      advancedControls: requiredDetails(reportDocument, "advanced-controls"),
      resetCameraButton: requiredButton(reportDocument, "reset-camera"),
      externalPackageToggle: requiredCheckbox(reportDocument, "external-packages-toggle"),
      typeOnlyDependencyToggle: requiredCheckbox(reportDocument, "type-only-dependencies-toggle"),
      structureEdgesToggle: requiredCheckbox(reportDocument, "structure-edges-toggle"),
      dependencyDisplay: requiredSelect(reportDocument, "dependency-display"),
      projectFileColor: requiredSelect(reportDocument, "project-file-color"),
      workspacePackageFieldset: requiredElement(reportDocument, "workspace-package-fieldset"),
      workspacePackageControls: requiredElement(reportDocument, "workspace-package-controls"),
      lineCategoryCode: requiredCheckbox(reportDocument, "line-category-code"),
      lineCategoryComment: requiredCheckbox(reportDocument, "line-category-comment"),
      lineCategoryBlank: requiredCheckbox(reportDocument, "line-category-blank"),
      graphKey: requiredElement(reportDocument, "controls").querySelector<HTMLElement>(".graph-key") ?? missingElement(".graph-key"),
      structureEdgeKey: requiredElement(reportDocument, "structure-edge-key"),
      runtimeDependencyEdgeKey: requiredElement(reportDocument, "runtime-dependency-edge-key"),
      typeOnlyDependencyEdgeKey: requiredElement(reportDocument, "type-only-dependency-edge-key"),
      externalDependencyEdgeKey: requiredElement(reportDocument, "external-dependency-edge-key"),
      coverageLegend: requiredElement(reportDocument, "coverage-legend"),
      activeSizeKey: requiredElement(reportDocument, "active-size-key"),
    },
    panels: {
      fileSearch: requiredSearchInput(reportDocument, "file-search"),
      fileSearchResultCount: requiredElement(reportDocument, "file-search-result-count"),
      fileTreeEmpty: requiredElement(reportDocument, "file-tree-empty"),
      fileList: requiredElement(reportDocument, "file-list"),
      selectedTreeSection: requiredElement(reportDocument, "selected-tree-section"),
      selectedTreeItem: requiredElement(reportDocument, "selected-tree-item"),
      externalPackageSection: requiredElement(reportDocument, "external-package-section"),
      externalPackageList: requiredElement(reportDocument, "external-package-list"),
      selectedEmpty: requiredElement(reportDocument, "selected-empty"),
      selectedDetails: requiredElement(reportDocument, "selected-details"),
      selectionBreadcrumb: requiredElement(reportDocument, "selection-breadcrumb"),
      navigationBackButton: requiredButton(reportDocument, "navigation-back"),
      navigationForwardButton: requiredButton(reportDocument, "navigation-forward"),
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

function requiredSelect(reportDocument: Document, id: string): HTMLSelectElement {
  const element = requiredElement(reportDocument, id)
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error("Static report #" + id + " is not a select.")
  }
  return element
}

function requiredDetails(reportDocument: Document, id: string): HTMLDetailsElement {
  const element = requiredElement(reportDocument, id)
  if (!(element instanceof HTMLDetailsElement)) {
    throw new Error("Static report #" + id + " is not a details element.")
  }
  return element
}

function missingElement(selector: string): never {
  throw new Error(`Static report is missing ${selector}.`)
}

function requiredSearchInput(reportDocument: Document, id: string): HTMLInputElement {
  const element = requiredElement(reportDocument, id)
  if (!(element instanceof HTMLInputElement) || element.type !== "search") {
    throw new Error("Static report #" + id + " is not a search input.")
  }
  return element
}

function requiredNumberInput(reportDocument: Document, id: string): HTMLInputElement {
  const element = requiredElement(reportDocument, id)
  if (!(element instanceof HTMLInputElement) || element.type !== "number") {
    throw new Error("Static report #" + id + " is not a number input.")
  }
  return element
}

function requiredOrderedList(reportDocument: Document, id: string): HTMLOListElement {
  const element = requiredElement(reportDocument, id)
  if (!(element instanceof HTMLOListElement)) {
    throw new Error("Static report #" + id + " is not an ordered list.")
  }
  return element
}
