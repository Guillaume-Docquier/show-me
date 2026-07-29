# 022 Coherent Report Navigation

## Status

Not started.

## Outcome

Users can move between the project tree, graph, node relationships, and navigation history without losing their search context or encountering different selection behavior on each surface.

## Dependencies

- [Milestone 010](./done/010-visualization-and-ux.md) establishes the large-desktop shell, searchable project tree, graph focus, and details panel.
- [Milestone 017](./done/017-browser-owned-presentation.md) establishes browser-owned presentation and interaction state.
- [Milestone 021](./done/021-type-only-dependencies.md) establishes typed dependency relationships in the browser.

This is the first milestone in the new report UX sequence. Complete it before adding diagnostic lenses or findings so those surfaces can reuse one navigation contract.

## Current behavior and problem

- Project files and directories are expanded deeply by default, producing project-tree scroll heights of several thousand pixels on ordinary repositories.
- Search filters project files by complete path but does not report the number of matches or include a directory as a direct result.
- A selection reached through the details panel can remain hidden by the active project-tree search.
- A project-tree file click selects and centers the node, while a details-panel relationship click selects without centering.
- A directory row selects the directory, centers it, and expands or collapses it in one click.
- Hover is intentionally a transient preview. It updates graph focus and the details panel without moving the camera, and leaving hover restores the persistent selection.
- Selection and hover are separate state. Preserve that distinction.

## UX contract

- Hover previews an entity and its direct relationships. It never changes the camera, selection history, search query, or collapsed-directory state.
- Explicit activation from the graph, project tree, details panel, or future findings surfaces selects the entity and centers it when it has a visible graph node.
- Re-selecting the current entity does not create a duplicate history entry.
- Back and forward navigation record explicit selections only. Hover never enters history.
- Directory disclosure and directory selection use separate controls. The disclosure control changes only expansion; activating the directory row selects and centers it.
- The initial unfiltered tree expands top-level directories and collapses deeper directories. Search temporarily expands the ancestry of every match.
- Clearing search restores the user's pre-search expansion state instead of expanding every directory.
- Search matches project-file and directory paths case-insensitively, displays an exact result count, and does not change graph membership.
- If the selected entity does not match the current search, keep a clearly labeled selected-item row visible outside the filtered results.
- External-package search and hidden-package activation are added by [Milestone 029](./029-external-dependency-lens.md).
- A compact breadcrumb identifies the persistent selection. Directory segments are selectable; the project name selects the root directory.
- An explicit way to clear selection is available near the breadcrumb or inspector. Clicking the graph stage may continue to clear selection, but it must not be the only discoverable mechanism.

## Implementation tasks

- [ ] Define one browser-owned navigation operation for explicit entity activation so every UI surface uses the same selection, centering, history, and inspector behavior.
- [ ] Keep `src/report/browser/entry.browser.ts` as composition-only plumbing; place navigation behavior in the browser class or service that owns the relevant state.
- [ ] Add an explicit navigation-history model with back, forward, and clear-selection operations.
- [ ] Separate directory disclosure controls from directory selection controls with correct accessible names and states.
- [ ] Change the initial expansion policy to top-level-expanded and nested-collapsed.
- [ ] Preserve user expansion state across search entry and clearing.
- [ ] Extend project search to return direct directory matches as well as project-file matches.
- [ ] Add a deterministic result count and deliberate empty state.
- [ ] Render the current selection separately when it is excluded by the active search.
- [ ] Add a selectable path breadcrumb for the persistent selection.
- [ ] Make project-tree, graph, breadcrumb, details-list, and history activation use the same explicit-navigation operation.
- [ ] Preserve the existing hover-preview contract and selection fallback when hover ends.
- [ ] Ensure navigation never mutates the embedded analysis or the current workspace-package scope.

## Required tests

- [ ] Focused tests cover directory expansion defaults, search-driven temporary expansion, clearing search, result counts, direct directory matches, and empty results.
- [ ] Focused tests cover history insertion, duplicate suppression, back, forward, and clearing selection.
- [ ] Browser coverage activates the same file from the tree, graph, and relationship list and proves identical selection, centering, inspector, and history state.
- [ ] Browser coverage proves hover changes the preview without changing the camera, persistent selection, or history.
- [ ] Browser coverage proves a selected entity remains reachable while an unrelated search is active.
- [ ] Browser coverage proves directory disclosure does not select or move the camera and directory-row activation does not toggle disclosure.
- [ ] Browser coverage proves breadcrumb navigation and explicit clear-selection behavior.
- [ ] Existing workspace, coverage, external-package, and type-only interaction scenarios continue to pass.

## Documentation

- [ ] Update the README report-controls section when the navigation behavior ships.
- [ ] Update the glossary if implementation introduces a more specific navigation term than those defined in this milestone.
- [ ] Record any durable interaction-state ownership decision in architecture documentation.

## Verification evidence

Record commands and results here before completion.

## Non-goals

- Adding diagnostic findings or lens-specific encodings.
- Searching external packages.
- Mobile or narrow-window layout work.
- Replacing Sigma, Graphology, or ForceAtlas2.

## Discovered gaps

None yet.
