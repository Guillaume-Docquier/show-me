import { buildProjectFileTree, type ProjectFileTreeEntry, type ProjectFileTreeFile } from "./project-file-tree.js"
import type { ReportPanelElements } from "./report-elements.js"
import type { ReportInteractionState } from "./report-interaction.js"
import type { BrowserPresentation, ReportNode, ReportProjectFileNode } from "./report-presentation.js"
import { visibleRelationships, type ReportView, type ReportViewDirectory, type VisibleRelationship } from "./report-view.js"

export type ReportPanelActions = {
  readonly selectNode: (nodeId: string) => void
  readonly focusNode: (nodeId: string) => void
  readonly clearHover: (nodeId: string) => void
  readonly centerNode: (nodeId: string) => void
}

/** Owns the searchable files tree, node details, and package navigation DOM. */
export class ReportPanels {
  readonly #elements: ReportPanelElements
  readonly #presentation: BrowserPresentation
  readonly #nodeById: ReadonlyMap<string, ReportNode>
  readonly #actions: ReportPanelActions
  readonly #collapsedDirectoryPaths = new Set<string>()
  #directoryById = new Map<string, ReportViewDirectory>()
  #directoryByPath = new Map<string, ReportViewDirectory>()
  #view: ReportView | undefined
  #interaction: ReportInteractionState

  public constructor({
    elements,
    presentation,
    initialInteraction,
    actions,
  }: {
    readonly elements: ReportPanelElements
    readonly presentation: BrowserPresentation
    readonly initialInteraction: ReportInteractionState
    readonly actions: ReportPanelActions
  }) {
    this.#elements = elements
    this.#presentation = presentation
    this.#nodeById = new Map(presentation.nodes.map((node) => [node.id, node]))
    this.#actions = actions
    this.#interaction = initialInteraction
    elements.fileSearch.addEventListener("input", () => {
      this.#collapsedDirectoryPaths.clear()
      this.#renderProjectFileList()
    })
  }

  /** Render all panel content affected by a new visible report projection. */
  public renderView(view: ReportView): void {
    this.#view = view
    this.#directoryById = new Map(view.directories.map((directory) => [directory.id, directory]))
    this.#directoryByPath = new Map(view.directories.map((directory) => [directory.path, directory]))
    this.#renderProjectFileList()
    this.#renderExternalPackageList()
    this.#renderSelection()
  }

  /** Render the shared selection/hover state without rebuilding navigation. */
  public renderInteraction(interaction: ReportInteractionState): void {
    this.#interaction = interaction
    this.#renderSelection()
  }

  #renderProjectFileList(): void {
    const view = this.#view
    if (view === undefined) {
      return
    }
    this.#elements.fileList.replaceChildren()
    const visibleProjectFiles = view.nodes.flatMap(({ reportNode }) => (reportNode.kind === "project-file" ? [reportNode] : []))
    const tree = buildProjectFileTree(visibleProjectFiles, this.#elements.fileSearch.value)
    this.#elements.fileList.append(...tree.map((entry) => this.#projectFileTreeItem(entry)))

    const emptyMessage = this.#projectFileTreeEmptyMessage(visibleProjectFiles.length, tree.length)
    this.#elements.fileTreeEmpty.hidden = emptyMessage === undefined
    this.#elements.fileList.hidden = emptyMessage !== undefined
    if (emptyMessage !== undefined) {
      this.#elements.fileTreeEmpty.textContent = emptyMessage
    }
  }

  #projectFileTreeItem(entry: ProjectFileTreeEntry): HTMLLIElement {
    if (entry.kind === "file") {
      return this.#projectFileTreeFileItem(entry)
    }

    const reportDocument = this.#elements.fileList.ownerDocument
    const item = reportDocument.createElement("li")
    item.className = "file-tree-directory"
    const button = reportDocument.createElement("button")
    button.type = "button"
    button.className = "file-tree-directory-toggle"
    button.textContent = entry.name
    button.title = entry.path
    button.dataset.directoryPath = entry.path
    const directory = this.#requiredDirectoryByPath(entry.path)
    button.dataset.nodeId = directory.id
    button.setAttribute("aria-current", directory.id === this.#interaction.selectedNodeId ? "true" : "false")
    const children = reportDocument.createElement("ol")
    children.className = "file-tree-children"
    children.append(...entry.children.map((child) => this.#projectFileTreeItem(child)))
    const expanded = !this.#collapsedDirectoryPaths.has(entry.path)
    button.setAttribute("aria-expanded", String(expanded))
    children.hidden = !expanded
    button.addEventListener("pointerenter", () => {
      this.#actions.focusNode(directory.id)
    })
    button.addEventListener("pointerleave", () => {
      this.#actions.clearHover(directory.id)
    })
    button.addEventListener("click", () => {
      this.#actions.selectNode(directory.id)
      this.#actions.centerNode(directory.id)
      if (this.#collapsedDirectoryPaths.has(entry.path)) {
        this.#collapsedDirectoryPaths.delete(entry.path)
      } else {
        this.#collapsedDirectoryPaths.add(entry.path)
      }
      this.#renderProjectFileList()
    })
    item.append(button, children)
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
      this.#actions.focusNode(node.id)
    })
    button.addEventListener("pointerleave", () => {
      this.#actions.clearHover(node.id)
    })
    button.addEventListener("click", () => {
      this.#actions.centerNode(node.id)
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
      return "No project files match this search."
    }
    return undefined
  }

  #renderSelection(): void {
    const view = this.#view
    if (view === undefined) {
      return
    }
    for (const button of this.#elements.fileList.ownerDocument.querySelectorAll<HTMLElement>(".node-list button[data-node-id]")) {
      button.setAttribute("aria-current", button.dataset.nodeId === this.#interaction.selectedNodeId ? "true" : "false")
    }

    const nodeIdToDisplay = this.#interaction.hoveredNodeId ?? this.#interaction.selectedNodeId
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
    if (directory !== undefined) {
      this.#showDirectoryDetails(directory)
      return
    }
    if (node === undefined) {
      throw new Error(`Selected report entity ${nodeIdToDisplay ?? ""} is unavailable.`)
    }
    if (projectFile) {
      this.#showProjectFileDetails(node)
    }
    const dependencies = visibleRelationships(view, node.id, "dependency")
    const consumers = visibleRelationships(view, node.id, "consumer")
    this.#elements.selectedDependencies.textContent = String(dependencies.length)
    this.#elements.selectedConsumers.textContent = String(consumers.length)
    this.#renderRelatedNodes(this.#elements.selectedDependencyNodes, dependencies)
    this.#renderRelatedNodes(this.#elements.selectedConsumerNodes, consumers)
  }

  #showProjectFileDetails(node: ReportProjectFileNode): void {
    this.#elements.selectedCodeLines.textContent = String(node.lineMetrics.code)
    this.#elements.selectedCommentLines.textContent = String(node.lineMetrics.comment)
    this.#elements.selectedBlankLines.textContent = String(node.lineMetrics.blank)
    this.#elements.selectedCoverage.textContent = node.coverage === undefined ? "Not available" : `${node.coverage}%`
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
    this.#elements.externalPackageSection.hidden = !view.state.externalPackages
    if (!view.state.externalPackages) {
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
    button.setAttribute("aria-current", node.id === this.#interaction.selectedNodeId ? "true" : "false")
    button.addEventListener("click", () => {
      this.#actions.selectNode(node.id)
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
    button.setAttribute("aria-current", directory.id === this.#interaction.selectedNodeId ? "true" : "false")
    button.addEventListener("click", () => {
      this.#actions.selectNode(directory.id)
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
