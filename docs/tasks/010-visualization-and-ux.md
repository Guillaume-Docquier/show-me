# 010 Visualization And UX

## Status

Not started.

## Outcome

The report has a more ergonomic layout, a dedicated and searchable files tree, and graph interactions that reveal relationships without obscuring the information already encoded by node colors.

## Tasks

### Report layout and files tree

- [ ] Revisit the report layout to make it more ergonomic.
- [ ] Give the files tree its own dedicated area instead of combining it with the selected-node details.
- [ ] Move controls out of the top bar so it is no longer overcrowded.
- [ ] Render project files as a collapsible directory hierarchy instead of a flat list of full paths.
- [ ] Add a text search field that filters the files tree.
- [ ] Bring a file node into view when its files-tree entry is hovered, without requiring a click.
- [ ] Show the visible and total project-file counts, with a deliberate empty state when workspace filters hide every file.

### Graph legibility and focus

- [ ] Show labels over file nodes when the graph is zoomed in.
- [ ] Prevent visible directory labels from overlapping, prioritizing the labels that provide the most useful orientation.
- [ ] Keep directory labels readable on hover by providing sufficient foreground and background contrast.
- [ ] Highlight a hovered node together with its direct consumers and dependencies, using distinct treatments for incoming and outgoing relationships.
- [ ] Dim dependency edges by default so relationship highlighting is visually meaningful.
- [ ] Highlight nodes with a border, glow, or another treatment that preserves their existing color.
- [ ] Allow structure edges and dependency edges to be shown or hidden independently without changing the node layout.
- [ ] Add a fit-to-graph or reset-camera control so users can recover the complete graph after panning, zooming, or changing filters.
- [ ] Add a coverage-color legend that explains the scale and the unknown-coverage color.
- [ ] Show the exact coverage value, including unavailable coverage, in project-file hover tooltips.

## Required tests

- [ ] Browser tests cover the dedicated collapsible files-tree area, its search filter, and hover-driven graph navigation.
- [ ] Browser tests cover visible and total project-file counts and the all-workspaces-hidden empty state.
- [ ] Browser tests cover zoom-dependent file labels, directory-label collision handling, and readable directory-label hover styling.
- [ ] Browser tests cover visually distinct consumer and dependency highlighting while verifying that node colors remain unchanged.
- [ ] Browser tests cover independent structure-edge and dependency-edge visibility without node-position changes.
- [ ] Browser tests verify that dependency edges are dimmed outside the active hover neighborhood.
- [ ] Browser tests cover restoring the complete graph view after camera movement and filter changes.
- [ ] Browser tests cover the coverage-color legend and exact hover-tooltip coverage values.

## Verification evidence

Record commands and results here before completion.
