# 010 Visualization And UX

## Status

Not started.

## Outcome

On large desktop displays, the report dedicates most of its space to navigating large codebases through an ergonomic layout, a searchable files tree, and graph interactions that reveal relationships without obscuring the information already encoded by node colors.

Narrow-window and mobile behavior are outside this milestone.

## Increments

Implement these increments in order. Each increment delivers a usable improvement and includes its browser proof in the same change.

### 1. Ergonomic desktop shell

**Outcome:** The report has stable, dedicated regions that make effective use of a large desktop canvas.

- [ ] Revisit the report layout to make it more ergonomic for large codebases.
- [ ] Give the files tree its own dedicated area instead of combining it with the selected-node details.
- [ ] Move controls out of the top bar so it is no longer overcrowded.
- [ ] Add browser coverage that verifies the graph, files tree, selected-node details, and controls remain usable together at a large desktop viewport.

### 2. Navigable files tree

**Outcome:** Users can locate and preview files without scanning a flat list of full paths.

- [ ] Render project files as a collapsible directory hierarchy.
- [ ] Add a text search field that filters the files tree.
- [ ] Bring a file node into view when its files-tree entry is hovered, without requiring a click.
- [ ] Show the visible and total project-file counts, with a deliberate empty state when workspace filters hide every file.
- [ ] Add browser coverage for expanding and collapsing directories, filtering the tree, hover-driven graph navigation, visible counts, and the all-workspaces-hidden state.

### 3. Graph orientation and labels

**Outcome:** Users can recover their position in the graph and read useful labels at the appropriate zoom level.

- [ ] Show labels over file nodes when the graph is zoomed in.
- [ ] Prevent visible directory labels from overlapping, prioritizing the labels that provide the most useful orientation.
- [ ] Keep directory labels readable on hover by providing sufficient foreground and background contrast.
- [ ] Add a fit-to-graph or reset-camera control so users can recover the complete graph after panning, zooming, or changing filters.
- [ ] Add browser coverage for zoom-dependent file labels, directory-label collision handling, readable directory-label hover styling, and restoring the complete graph view.

### 4. Coverage interpretation

**Outcome:** Node colors are understandable without requiring selection, while exact coverage remains available on demand.

- [ ] Add a coverage-color legend that explains the scale and the unknown-coverage color.
- [ ] Show the exact coverage value, including unavailable coverage, in project-file hover tooltips.
- [ ] Add browser coverage for the coverage-color legend and exact hover-tooltip coverage values.

### 5. Edge visibility

**Outcome:** Users can control graph density without changing where nodes are placed.

- [ ] Allow structure edges and dependency edges to be shown or hidden independently without changing the node layout.
- [ ] Dim dependency edges by default so later relationship highlighting is visually meaningful.
- [ ] Add browser coverage for independent edge visibility, unchanged node positions, and dimmed dependency edges.

### 6. Dependency neighborhood focus

**Outcome:** Hovering a node makes its immediate incoming and outgoing dependency neighborhood clear without hiding node metrics.

- [ ] Highlight a hovered node together with its direct consumers and dependencies.
- [ ] Use distinct treatments for incoming and outgoing relationships and emphasize their corresponding edges.
- [ ] Highlight nodes with a border, glow, or another treatment that preserves their existing color.
- [ ] Add browser coverage that distinguishes consumers from dependencies, limits emphasis to the direct neighborhood, keeps unrelated dependency edges dimmed, and verifies that node colors remain unchanged.

## Required tests

- [ ] Each increment's browser proof is added in the same change as its production behavior.
- [ ] The complete browser suite covers the increments working together in the production report.

## Verification evidence

Record commands and results here before completion.
