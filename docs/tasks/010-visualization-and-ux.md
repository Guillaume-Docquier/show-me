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
- [ ] Add a text search field that filters the files tree.
- [ ] Bring a file node into view when its files-tree entry is hovered, without requiring a click.

### Graph legibility and focus

- [ ] Show labels over file nodes when the graph is zoomed in.
- [ ] Keep directory labels readable on hover by providing sufficient foreground and background contrast.
- [ ] Highlight a hovered node together with its direct consumers and dependencies.
- [ ] Dim dependency edges by default so relationship highlighting is visually meaningful.
- [ ] Highlight nodes with a border, glow, or another treatment that preserves their existing color.
- [ ] Allow structure edges and dependency edges to be shown or hidden independently without changing the node layout.

## Required tests

- [ ] Browser tests cover the dedicated files-tree area, its search filter, and hover-driven graph navigation.
- [ ] Browser tests cover zoom-dependent file labels and readable directory-label hover styling.
- [ ] Browser tests cover consumer and dependency highlighting while verifying that node colors remain unchanged.
- [ ] Browser tests cover independent structure-edge and dependency-edge visibility without node-position changes.
- [ ] Browser tests verify that dependency edges are dimmed outside the active hover neighborhood.

## Verification evidence

Record commands and results here before completion.
