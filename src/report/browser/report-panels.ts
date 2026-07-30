import { buildProjectFileTree, type ProjectFileTreeEntry, type ProjectFileTreeFile } from "./project-file-tree.js"
import type { BoundaryDrillDown } from "./report-boundaries.js"
import type { CouplingCycle, CouplingLensResults, CouplingMetric } from "./report-coupling.js"
import type { ReportPanelElements } from "./report-elements.js"
import type { ReportNavigationState } from "./report-navigation.js"
import type { BrowserPresentation, ReportNode, ReportProjectFileNode } from "./report-presentation.js"
import { visibleRelationships, type ReportView, type ReportViewDirectory, type VisibleRelationship } from "./report-view.js"

export type ReportPanelActions = {
  readonly activateNode: (nodeId: string) => void
  readonly previewNode: (nodeId: string) => void
  readonly clearPreview: (nodeId: string) => void
  readonly goBack: () => void
  readonly goForward: () => void
}

/** Owns the searchable files tree, node details, and package navigation DOM. */
export class ReportPanels {
  readonly #elements: ReportPanelElements
  readonly #presentation: BrowserPresentation
  readonly #nodeById: ReadonlyMap<string, ReportNode>
  readonly #actions: ReportPanelActions
  readonly #expandedDirectoryPaths = new Set<string>()
  readonly #knownDirectoryPaths = new Set<string>()
  #directoryById = new Map<string, ReportViewDirectory>()
  #directoryByPath = new Map<string, ReportViewDirectory>()
  #view: ReportView | undefined
  #couplingMetricByNodeId: ReadonlyMap<string, CouplingMetric> | undefined
  #navigation: ReportNavigationState = {
    selectedNodeId: undefined,
    hoveredNodeId: undefined,
    history: [],
    historyIndex: -1,
    canGoBack: false,
    canGoForward: false,
  }

  public constructor({
    elements,
    presentation,
    actions,
  }: {
    readonly elements: ReportPanelElements
    readonly presentation: BrowserPresentation
    readonly actions: ReportPanelActions
  }) {
    this.#elements = elements
    this.#presentation = presentation
    this.#nodeById = new Map(presentation.nodes.map((node) => [node.id, node]))
    this.#actions = actions
    elements.fileSearch.addEventListener("input", () => {
      this.#renderProjectFileList()
    })
    elements.navigationBackButton.addEventListener("click", actions.goBack)
    elements.navigationForwardButton.addEventListener("click", actions.goForward)
  }

  /** Render all panel content affected by a new visible report projection. */
  public renderView(view: ReportView): void {
    this.#view = view
    this.#directoryById = new Map(view.directories.map((directory) => [directory.id, directory]))
    this.#directoryByPath = new Map(view.directories.map((directory) => [directory.path, directory]))
    for (const directory of view.directories) {
      if (!this.#knownDirectoryPaths.has(directory.path)) {
        this.#knownDirectoryPaths.add(directory.path)
        if (directory.depth === 1) {
          this.#expandedDirectoryPaths.add(directory.path)
        }
      }
    }
    this.#renderProjectFileList()
    this.#renderExternalPackageList()
    this.#renderSelection()
    this.#renderNavigation()
  }

  /** Render shared navigation and preview state without rebuilding the graph view. */
  public renderNavigation(navigation: ReportNavigationState): void {
    this.#navigation = navigation
    this.#renderSelection()
    this.#renderNavigation()
    this.#renderSelectedTreeItem()
  }

  /** Make filtered Coupling metrics available to the ordinary node inspector. */
  public renderCoupling(results: CouplingLensResults | undefined): void {
    this.#couplingMetricByNodeId = results?.metricByNodeId
    this.#renderSelection()
  }

  /** Replace ordinary node details with one selected Coupling cycle group. */
  public showCouplingCycle(cycle: CouplingCycle): void {
    this.#elements.selectedEmpty.hidden = true
    this.#elements.selectedDetails.hidden = true
    this.#elements.selectedCycleDetails.hidden = false
    this.#elements.selectedBoundaryDetails.hidden = true
    this.#elements.selectedCycleKind.textContent = cycle.kind === "runtime" ? "Runtime cycle" : "Cycle includes type-only dependencies"
    this.#elements.selectedCycleMemberCount.textContent = String(cycle.memberNodeIds.length)
    this.#elements.selectedCycleRelationshipCount.textContent = String(cycle.internalEdgeIds.length)
    this.#elements.selectedCycleMembers.replaceChildren(
      ...cycle.memberNodeIds.map((nodeId) => {
        const node = this.#nodeById.get(nodeId)
        if (node === undefined) {
          throw new Error(`Coupling cycle references unavailable project file ${nodeId}.`)
        }
        return this.#nodeListItem(node, node.displayName, "Project file")
      }),
    )
  }

  /** Replace ordinary node details with one exact boundary drill-down. */
  public showBoundaryDrillDown(drillDown: BoundaryDrillDown): void {
    this.#elements.selectedEmpty.hidden = true
    this.#elements.selectedDetails.hidden = true
    this.#elements.selectedCycleDetails.hidden = true
    this.#elements.selectedBoundaryDetails.hidden = false
    this.#elements.selectedBoundaryKind.textContent = drillDown.kind === "boundary" ? "Boundary" : "Directed boundary pair"
    this.#elements.selectedBoundaryDirection.textContent =
      drillDown.kind === "boundary"
        ? `${drillDown.sourceLabel} internal relationships`
        : `${drillDown.sourceLabel} source → ${drillDown.targetLabel} target`
    this.#elements.selectedBoundaryFileCount.textContent = String(drillDown.fileNodeIds.length)
    this.#elements.selectedBoundaryRelationshipCount.textContent = String(drillDown.relationships.length)
    this.#elements.selectedBoundaryRuntimeCount.textContent = String(
      drillDown.relationships.filter(({ kind }) => kind === "runtime").length,
    )
    this.#elements.selectedBoundaryTypeOnlyCount.textContent = String(
      drillDown.relationships.filter(({ kind }) => kind === "type-only").length,
    )
    this.#elements.selectedBoundaryEmpty.hidden = drillDown.relationships.length > 0
    this.#elements.selectedBoundaryRelationships.hidden = drillDown.relationships.length === 0
    this.#elements.selectedBoundaryRelationships.replaceChildren(
      ...drillDown.relationships.map((relationship) => {
        const item = this.#elements.selectedBoundaryRelationships.ownerDocument.createElement("li")
        item.className = "boundary-relationship"
        item.dataset.edgeId = relationship.edgeId
        item.dataset.sourceNodeId = relationship.sourceNodeId
        item.dataset.targetNodeId = relationship.targetNodeId
        item.dataset.relationshipKind = relationship.kind
        const source = this.#nodeById.get(relationship.sourceNodeId)
        const target = this.#nodeById.get(relationship.targetNodeId)
        if (source === undefined || target === undefined) {
          throw new Error(`Boundary relationship ${relationship.edgeId} references an unavailable project file.`)
        }
        const sourceButton = this.#nodeListButton(source, relationship.sourcePath)
        const direction = this.#elements.selectedBoundaryRelationships.ownerDocument.createElement("span")
        direction.textContent = `source → target · ${relationship.kind === "runtime" ? "Runtime" : "Type only"}`
        const targetButton = this.#nodeListButton(target, relationship.targetPath)
        item.append(sourceButton, direction, targetButton)
        return item
      }),
    )
  }

  /** Announce that the prior selection is unavailable in the new presentation. */
  public announceUnavailableSelection(): void {
    this.#elements.selectedEmpty.textContent = "Selection cleared because it is not available in the current lens or workspace scope."
  }

  /** Restore the ordinary empty-inspector instruction after an explicit clear. */
  public showDefaultSelectionPrompt(): void {
    this.#elements.selectedEmpty.textContent = "Hover over or select a node to inspect it."
  }

  #renderProjectFileList(): void {
    const view = this.#view
    if (view === undefined) {
      return
    }
    this.#elements.fileList.replaceChildren()
    const visibleProjectFiles = view.nodes.flatMap(({ reportNode }) => (reportNode.kind === "project-file" ? [reportNode] : []))
    const tree = buildProjectFileTree(visibleProjectFiles, this.#elements.fileSearch.value)
    const searchActive = tree.matchCount !== undefined
    this.#elements.fileList.append(...tree.entries.map((entry) => this.#projectFileTreeItem(entry, searchActive)))

    this.#elements.fileSearchResultCount.hidden = tree.matchCount === undefined || visibleProjectFiles.length === 0
    if (tree.matchCount !== undefined) {
      this.#elements.fileSearchResultCount.textContent = `${tree.matchCount} ${tree.matchCount === 1 ? "result" : "results"}`
    }

    const emptyMessage = this.#projectFileTreeEmptyMessage(visibleProjectFiles.length, tree.entries.length)
    this.#elements.fileTreeEmpty.hidden = emptyMessage === undefined
    this.#elements.fileList.hidden = emptyMessage !== undefined
    if (emptyMessage !== undefined) {
      this.#elements.fileTreeEmpty.textContent = emptyMessage
    }
    this.#renderSelectedTreeItem()
  }

  #projectFileTreeItem(entry: ProjectFileTreeEntry, searchActive: boolean): HTMLLIElement {
    if (entry.kind === "file") {
      return this.#projectFileTreeFileItem(entry)
    }

    const reportDocument = this.#elements.fileList.ownerDocument
    const item = reportDocument.createElement("li")
    item.className = "file-tree-directory"
    const directory = this.#requiredDirectoryByPath(entry.path)
    const row = reportDocument.createElement("div")
    row.className = "file-tree-directory-row"
    const expanded = searchActive || this.#expandedDirectoryPaths.has(entry.path)
    const disclosure = reportDocument.createElement("button")
    disclosure.type = "button"
    disclosure.className = "file-tree-directory-disclosure"
    disclosure.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} directory ${entry.path}`)
    disclosure.setAttribute("aria-expanded", String(expanded))
    disclosure.disabled = searchActive
    const select = reportDocument.createElement("button")
    select.type = "button"
    select.className = "file-tree-directory-select"
    select.textContent = entry.name
    select.title = entry.path
    select.dataset.directoryPath = entry.path
    select.dataset.nodeId = directory.id
    select.setAttribute("aria-current", directory.id === this.#navigation.selectedNodeId ? "true" : "false")
    const children = reportDocument.createElement("ol")
    children.className = "file-tree-children"
    children.append(...entry.children.map((child) => this.#projectFileTreeItem(child, searchActive)))
    children.hidden = !expanded
    select.addEventListener("pointerenter", () => {
      this.#actions.previewNode(directory.id)
    })
    select.addEventListener("pointerleave", () => {
      this.#actions.clearPreview(directory.id)
    })
    select.addEventListener("click", () => {
      this.#actions.activateNode(directory.id)
    })
    disclosure.addEventListener("click", () => {
      if (searchActive) {
        return
      }
      if (this.#expandedDirectoryPaths.has(entry.path)) {
        this.#expandedDirectoryPaths.delete(entry.path)
      } else {
        this.#expandedDirectoryPaths.add(entry.path)
      }
      this.#renderProjectFileList()
    })
    row.append(disclosure, select)
    item.append(row, children)
    return item
  }

  #projectFileTreeFileItem(entry: ProjectFileTreeFile): HTMLLIElement {
    const node = this.#nodeById.get(entry.id)
    if (node === undefined || node.kind !== "project-file") {
      throw new Error(`Files tree references missing project node ${entry.id}.`)
    }

    const item = this.#elements.fileList.ownerDocument.createElement("li")
    item.className = "file-tree-file"
    const button = this.#nodeListButton(node, entry.name)
    button.setAttribute("aria-label", node.displayName)
    button.addEventListener("pointerenter", () => {
      this.#actions.previewNode(node.id)
    })
    button.addEventListener("pointerleave", () => {
      this.#actions.clearPreview(node.id)
    })
    item.append(button)
    return item
  }

  #projectFileTreeEmptyMessage(visibleFileCount: number, treeEntryCount: number): string | undefined {
    if (visibleFileCount === 0) {
      const totalProjectFileCount = this.#presentation.nodes.filter(({ kind }) => kind === "project-file").length
      return totalProjectFileCount === 0
        ? "This report contains no project files."
        : "No project files are visible. Select a workspace package to show files."
    }
    if (treeEntryCount === 0) {
      return "No project files or directories match this search."
    }
    return undefined
  }

  #renderSelection(): void {
    const view = this.#view
    if (view === undefined) {
      return
    }
    this.#elements.selectedCycleDetails.hidden = true
    this.#elements.selectedBoundaryDetails.hidden = true
    for (const button of this.#elements.fileList.ownerDocument.querySelectorAll<HTMLElement>(".node-list button[data-node-id]")) {
      button.setAttribute("aria-current", button.dataset.nodeId === this.#navigation.selectedNodeId ? "true" : "false")
    }

    const nodeIdToDisplay = this.#navigation.hoveredNodeId ?? this.#navigation.selectedNodeId
    const node = nodeIdToDisplay === undefined ? undefined : this.#nodeById.get(nodeIdToDisplay)
    const directory = nodeIdToDisplay === undefined ? undefined : this.#directoryById.get(nodeIdToDisplay)
    const entityExists = node !== undefined || directory !== undefined
    this.#elements.selectedEmpty.hidden = entityExists
    this.#elements.selectedDetails.hidden = !entityExists
    if (!entityExists) {
      return
    }

    const projectFile = node?.kind === "project-file"
    this.#elements.selectedNodeType.textContent = directory !== undefined ? "Directory" : projectFile ? "Project file" : "External package"
    this.#elements.selectedPath.textContent = directory === undefined ? (node?.displayName ?? "") : this.#directoryDisplayName(directory)
    for (const element of this.#elements.projectFileDetails) {
      element.hidden = !projectFile
    }
    for (const element of this.#elements.dependencyDetails) {
      element.hidden = directory !== undefined
    }
    for (const element of this.#elements.directoryDetails) {
      element.hidden = directory === undefined
    }
    const couplingMetric = projectFile && node !== undefined ? this.#couplingMetricByNodeId?.get(node.id) : undefined
    for (const element of this.#elements.couplingDetails) {
      element.hidden = couplingMetric === undefined
    }
    if (directory !== undefined) {
      this.#showDirectoryDetails(directory)
      return
    }
    if (node === undefined) {
      throw new Error(`Selected report entity ${nodeIdToDisplay ?? ""} is unavailable.`)
    }
    if (projectFile) {
      this.#showProjectFileDetails(node)
      if (couplingMetric !== undefined) {
        this.#showCouplingDetails(couplingMetric)
      }
    }
    const dependencies = visibleRelationships(view, node.id, "dependency")
    const consumers = visibleRelationships(view, node.id, "consumer")
    this.#elements.selectedDependencies.textContent = String(dependencies.length)
    this.#elements.selectedConsumers.textContent = String(consumers.length)
    this.#renderRelatedNodes(this.#elements.selectedDependencyNodes, dependencies)
    this.#renderRelatedNodes(this.#elements.selectedConsumerNodes, consumers)
  }

  #renderSelectedTreeItem(): void {
    const selectedNodeId = this.#navigation.selectedNodeId
    const searchActive = this.#elements.fileSearch.value.trim().length > 0
    const selectedIsInResults = [...this.#elements.fileList.querySelectorAll<HTMLElement>("button[data-node-id]")].some(
      ({ dataset }) => dataset.nodeId === selectedNodeId,
    )
    const node = selectedNodeId === undefined ? undefined : this.#nodeById.get(selectedNodeId)
    const directory = selectedNodeId === undefined ? undefined : this.#directoryById.get(selectedNodeId)
    const treeEntity = node?.kind === "project-file" || directory !== undefined
    const showSelectedItem = searchActive && treeEntity && !selectedIsInResults
    this.#elements.selectedTreeSection.hidden = !showSelectedItem
    this.#elements.selectedTreeItem.replaceChildren()
    if (!showSelectedItem) {
      return
    }
    if (directory !== undefined) {
      this.#elements.selectedTreeItem.append(this.#directoryListItem(directory, this.#directoryDisplayName(directory)))
      return
    }
    if (node?.kind === "project-file") {
      this.#elements.selectedTreeItem.append(this.#nodeListItem(node, node.displayName, "Project file"))
    }
  }

  #renderNavigation(): void {
    this.#elements.navigationBackButton.disabled = !this.#navigation.canGoBack
    this.#elements.navigationForwardButton.disabled = !this.#navigation.canGoForward
    this.#elements.selectionBreadcrumb.replaceChildren()

    const selectedNodeId = this.#navigation.selectedNodeId
    if (selectedNodeId === undefined) {
      return
    }

    const rootDirectory = this.#requiredDirectoryByPath("")
    this.#elements.selectionBreadcrumb.append(
      this.#breadcrumbButton(this.#presentation.projectName, rootDirectory.id, selectedNodeId === rootDirectory.id),
    )
    const directory = this.#directoryById.get(selectedNodeId)
    const node = this.#nodeById.get(selectedNodeId)
    const directoryPath = directory?.path ?? (node?.kind === "project-file" ? node.path.split("/").slice(0, -1).join("/") : "")
    let currentPath = ""
    for (const segment of directoryPath.split("/").filter((value) => value.length > 0)) {
      currentPath = currentPath.length === 0 ? segment : `${currentPath}/${segment}`
      const pathDirectory = this.#requiredDirectoryByPath(currentPath)
      this.#elements.selectionBreadcrumb.append(
        this.#breadcrumbSeparator(),
        this.#breadcrumbButton(segment, pathDirectory.id, selectedNodeId === pathDirectory.id),
      )
    }

    if (node !== undefined) {
      const current = this.#elements.fileList.ownerDocument.createElement("span")
      current.className = "selection-breadcrumb-current"
      current.textContent = node.kind === "project-file" ? (node.path.split("/").at(-1) ?? node.path) : node.displayName
      this.#elements.selectionBreadcrumb.append(this.#breadcrumbSeparator(), current)
    }
  }

  #breadcrumbButton(label: string, nodeId: string, current: boolean): HTMLButtonElement {
    const button = this.#elements.fileList.ownerDocument.createElement("button")
    button.type = "button"
    button.textContent = label
    button.dataset.nodeId = nodeId
    button.setAttribute("aria-current", current ? "true" : "false")
    button.addEventListener("click", () => {
      this.#actions.activateNode(nodeId)
    })
    return button
  }

  #breadcrumbSeparator(): HTMLSpanElement {
    const separator = this.#elements.fileList.ownerDocument.createElement("span")
    separator.className = "selection-breadcrumb-separator"
    separator.textContent = "/"
    separator.setAttribute("aria-hidden", "true")
    return separator
  }

  #showProjectFileDetails(node: ReportProjectFileNode): void {
    this.#elements.selectedCodeLines.textContent = String(node.lineMetrics.code)
    this.#elements.selectedCommentLines.textContent = String(node.lineMetrics.comment)
    this.#elements.selectedBlankLines.textContent = String(node.lineMetrics.blank)
    this.#elements.selectedCoverage.textContent = node.coverage === undefined ? "Not available" : `${node.coverage}%`
  }

  #showCouplingDetails(metric: CouplingMetric): void {
    this.#elements.selectedFanOut.textContent = String(metric.fanOut)
    this.#elements.selectedFanIn.textContent = String(metric.fanIn)
    this.#elements.selectedRuntimeRelationships.textContent = String(metric.runtimeFanOut + metric.runtimeFanIn)
    this.#elements.selectedTypeOnlyRelationships.textContent = String(metric.typeOnlyFanOut + metric.typeOnlyFanIn)
    this.#elements.selectedCycleMembership.textContent = String(metric.cycleIds.length)
  }

  #showDirectoryDetails(directory: ReportViewDirectory): void {
    this.#elements.selectedParentDirectory.replaceChildren()
    if (directory.parentDirectoryId === undefined) {
      this.#elements.selectedParentDirectory.append(this.#emptyListItem("None"))
    } else {
      const parent = this.#requiredDirectoryById(directory.parentDirectoryId)
      this.#elements.selectedParentDirectory.append(this.#directoryListItem(parent, this.#directoryDisplayName(parent)))
    }

    this.#elements.selectedDirectoryChildren.replaceChildren()
    if (directory.childNodeIds.length === 0) {
      this.#elements.selectedDirectoryChildren.append(this.#emptyListItem("None"))
      return
    }
    for (const childNodeId of directory.childNodeIds) {
      const childDirectory = this.#directoryById.get(childNodeId)
      if (childDirectory !== undefined) {
        this.#elements.selectedDirectoryChildren.append(this.#directoryListItem(childDirectory, childDirectory.label))
        continue
      }
      const childNode = this.#nodeById.get(childNodeId)
      if (childNode?.kind === "project-file") {
        const item = this.#nodeListItem(childNode, childNode.path.split("/").at(-1) ?? childNode.path, "Project file")
        item.querySelector("button")?.setAttribute("aria-label", childNode.path)
        this.#elements.selectedDirectoryChildren.append(item)
      }
    }
  }

  #renderRelatedNodes(container: HTMLElement, relationships: readonly VisibleRelationship[]): void {
    container.replaceChildren()
    if (relationships.length === 0) {
      container.append(this.#emptyListItem("None"))
      return
    }
    for (const relationship of relationships) {
      const node = this.#nodeById.get(relationship.nodeId)
      if (node !== undefined) {
        const kindLabel =
          relationship.kind === "type-only" ? (node.kind === "external-package" ? "Type only · External package" : "Type only") : undefined
        container.append(this.#nodeListItem(node, node.displayName, kindLabel))
      }
    }
  }

  #renderExternalPackageList(): void {
    const view = this.#view
    if (view === undefined) {
      return
    }
    this.#elements.externalPackageList.replaceChildren()
    this.#elements.externalPackageSection.hidden = !view.settings.externalPackages
    if (!view.settings.externalPackages) {
      return
    }
    for (const { reportNode } of view.nodes) {
      if (reportNode.kind === "external-package") {
        this.#elements.externalPackageList.append(this.#nodeListItem(reportNode, reportNode.displayName))
      }
    }
  }

  #nodeListItem(node: ReportNode, label: string, kindLabel?: string): HTMLLIElement {
    // DOM list buttons are keyboard-accessible navigation counterparts to the WebGL nodes.
    const item = this.#elements.fileList.ownerDocument.createElement("li")
    item.append(this.#nodeListButton(node, label, kindLabel))
    return item
  }

  #nodeListButton(node: ReportNode, label: string, kindLabel?: string): HTMLButtonElement {
    const reportDocument = this.#elements.fileList.ownerDocument
    const button = reportDocument.createElement("button")
    button.type = "button"
    button.append(reportDocument.createTextNode(label))
    const displayedKind = kindLabel ?? (node.kind === "external-package" ? "External package" : undefined)
    if (displayedKind !== undefined) {
      const kind = reportDocument.createElement("span")
      kind.className = "node-kind-label"
      kind.textContent = displayedKind
      button.append(kind)
    }
    button.title = node.displayName
    button.dataset.nodeId = node.id
    button.setAttribute("aria-current", node.id === this.#navigation.selectedNodeId ? "true" : "false")
    button.addEventListener("click", () => {
      this.#actions.activateNode(node.id)
    })
    return button
  }

  #directoryListItem(directory: ReportViewDirectory, label: string): HTMLLIElement {
    const reportDocument = this.#elements.fileList.ownerDocument
    const item = reportDocument.createElement("li")
    const button = reportDocument.createElement("button")
    button.type = "button"
    button.append(reportDocument.createTextNode(label))
    const kind = reportDocument.createElement("span")
    kind.className = "node-kind-label"
    kind.textContent = "Directory"
    button.append(kind)
    button.title = this.#directoryDisplayName(directory)
    button.dataset.nodeId = directory.id
    button.setAttribute("aria-label", this.#directoryDisplayName(directory))
    button.setAttribute("aria-current", directory.id === this.#navigation.selectedNodeId ? "true" : "false")
    button.addEventListener("click", () => {
      this.#actions.activateNode(directory.id)
    })
    item.append(button)
    return item
  }

  #emptyListItem(text: string): HTMLLIElement {
    const empty = this.#elements.fileList.ownerDocument.createElement("li")
    empty.className = "relationship-empty"
    empty.textContent = text
    return empty
  }

  #requiredDirectoryByPath(path: string): ReportViewDirectory {
    const directory = this.#directoryByPath.get(path)
    if (directory === undefined) {
      throw new Error(`Files tree references missing project directory ${path}.`)
    }
    return directory
  }

  #requiredDirectoryById(id: string): ReportViewDirectory {
    const directory = this.#directoryById.get(id)
    if (directory === undefined) {
      throw new Error(`Directory details reference missing project directory ${id}.`)
    }
    return directory
  }

  #directoryDisplayName(directory: ReportViewDirectory): string {
    return directory.path === "" ? this.#presentation.projectName : directory.path
  }
}
