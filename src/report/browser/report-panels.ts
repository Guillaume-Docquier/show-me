import { buildProjectFileTree, type ProjectFileTreeEntry, type ProjectFileTreeFile } from "./project-file-tree.js"
import type { ReportPanelElements } from "./report-elements.js"
import type { ReportInteractionState } from "./report-interaction.js"
import type { BrowserPresentation, ReportNode, ReportProjectFileNode } from "./report-presentation.js"
import { visibleRelationships, type ReportView } from "./report-view.js"

export type ReportPanelActions = {
  readonly selectNode: (nodeId: string) => void
  readonly focusNode: (nodeId: string) => void
  readonly clearHover: () => void
  readonly centerNode: (nodeId: string) => void
}

/** Owns the searchable files tree, node details, and package navigation DOM. */
export class ReportPanels {
  readonly #elements: ReportPanelElements
  readonly #presentation: BrowserPresentation
  readonly #nodeById: ReadonlyMap<string, ReportNode>
  readonly #actions: ReportPanelActions
  readonly #collapsedDirectoryPaths = new Set<string>()
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
    const children = reportDocument.createElement("ol")
    children.className = "file-tree-children"
    children.append(...entry.children.map((child) => this.#projectFileTreeItem(child)))
    const expanded = !this.#collapsedDirectoryPaths.has(entry.path)
    button.setAttribute("aria-expanded", String(expanded))
    children.hidden = !expanded
    button.addEventListener("click", () => {
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
    button.addEventListener("pointerleave", this.#actions.clearHover)
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
    this.#elements.selectedEmpty.hidden = node !== undefined
    this.#elements.selectedDetails.hidden = node === undefined
    if (node === undefined) {
      return
    }

    const projectFile = node.kind === "project-file"
    this.#elements.selectedNodeType.textContent = projectFile ? "Project file" : "External package"
    this.#elements.selectedPath.textContent = node.displayName
    for (const element of this.#elements.projectFileDetails) {
      element.hidden = !projectFile
    }
    if (projectFile) {
      this.#showProjectFileDetails(node)
    }
    const dependencyNodeIds = visibleRelationships(view, node.dependencyNodeIds)
    const consumerNodeIds = visibleRelationships(view, node.consumerNodeIds)
    this.#elements.selectedDependencies.textContent = String(dependencyNodeIds.length)
    this.#elements.selectedConsumers.textContent = String(consumerNodeIds.length)
    this.#renderRelatedNodes(this.#elements.selectedDependencyNodes, dependencyNodeIds)
    this.#renderRelatedNodes(this.#elements.selectedConsumerNodes, consumerNodeIds)
  }

  #showProjectFileDetails(node: ReportProjectFileNode): void {
    this.#elements.selectedCodeLines.textContent = String(node.lineMetrics.code)
    this.#elements.selectedCommentLines.textContent = String(node.lineMetrics.comment)
    this.#elements.selectedBlankLines.textContent = String(node.lineMetrics.blank)
    this.#elements.selectedCoverage.textContent = node.coverage === undefined ? "Not available" : `${node.coverage}%`
  }

  #renderRelatedNodes(container: HTMLElement, relatedNodeIds: readonly string[]): void {
    container.replaceChildren()
    if (relatedNodeIds.length === 0) {
      const empty = container.ownerDocument.createElement("li")
      empty.className = "relationship-empty"
      empty.textContent = "None"
      container.append(empty)
      return
    }
    for (const nodeId of relatedNodeIds) {
      const node = this.#nodeById.get(nodeId)
      if (node !== undefined) {
        container.append(this.#nodeListItem(node))
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
        this.#elements.externalPackageList.append(this.#nodeListItem(reportNode))
      }
    }
  }

  #nodeListItem(node: ReportNode): HTMLLIElement {
    // DOM list buttons are keyboard-accessible navigation counterparts to the WebGL nodes.
    const item = this.#elements.fileList.ownerDocument.createElement("li")
    item.append(this.#nodeListButton(node, node.displayName))
    return item
  }

  #nodeListButton(node: ReportNode, label: string): HTMLButtonElement {
    const reportDocument = this.#elements.fileList.ownerDocument
    const button = reportDocument.createElement("button")
    button.type = "button"
    button.append(reportDocument.createTextNode(label))
    if (node.kind === "external-package") {
      const kind = reportDocument.createElement("span")
      kind.className = "node-kind-label"
      kind.textContent = "External package"
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
}
