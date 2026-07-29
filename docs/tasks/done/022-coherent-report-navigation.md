# 022 Coherent Report Navigation

## Status

Complete.

Completed on 2026-07-28. The report now has one browser-owned activation contract, persistent selection history, selectable breadcrumbs, canvas clearing, independent directory disclosure, shallow initial expansion, search result counts, direct directory matches, and a selected-item escape hatch for filtered results.

## Outcome

Users can move between the project tree, graph, node relationships, and navigation history without losing their search context or encountering different selection behavior on each surface.

## Dependencies

- [Milestone 010](./010-visualization-and-ux.md) establishes the large-desktop shell, searchable project tree, graph focus, and details panel.
- [Milestone 017](./017-browser-owned-presentation.md) establishes browser-owned presentation and interaction state.
- [Milestone 021](./021-type-only-dependencies.md) establishes typed dependency relationships in the browser.

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
- External-package search and hidden-package activation are added by [Milestone 029](../029-external-dependency-lens.md).
- A compact breadcrumb identifies the persistent selection. Directory segments are selectable; the project name selects the root directory. The breadcrumb remains empty when there is no selection instead of restating the obvious context.
- Clicking empty graph space clears selection. A dedicated clear-selection button is intentionally omitted because it consumes persistent UI space for an action naturally expressed through the canvas.

## Implementation tasks

- [x] Define one browser-owned navigation operation for explicit entity activation so every UI surface uses the same selection, centering, history, and inspector behavior.
- [x] Keep `src/report/browser/entry.browser.ts` as composition-only plumbing; place navigation behavior in the browser class or service that owns the relevant state.
- [x] Add an explicit navigation-history model with back, forward, and clear-selection operations.
- [x] Separate directory disclosure controls from directory selection controls with correct accessible names and states.
- [x] Change the initial expansion policy to top-level-expanded and nested-collapsed.
- [x] Preserve user expansion state across search entry and clearing.
- [x] Extend project search to return direct directory matches as well as project-file matches.
- [x] Add a deterministic result count and deliberate empty state.
- [x] Render the current selection separately when it is excluded by the active search.
- [x] Add a selectable path breadcrumb for the persistent selection.
- [x] Make project-tree, graph, breadcrumb, details-list, and history activation use the same explicit-navigation operation.
- [x] Preserve the existing hover-preview contract and selection fallback when hover ends.
- [x] Ensure navigation never mutates the embedded analysis or the current workspace-package scope.

## Required tests

- [x] Focused tests cover directory expansion defaults, search-driven temporary expansion, clearing search, result counts, direct directory matches, and empty results.
- [x] Focused tests cover history insertion, duplicate suppression, back, forward, and clearing selection.
- [x] Browser coverage activates the same file from the tree, graph, and relationship list and proves identical selection, centering, inspector, and history state.
- [x] Browser coverage proves hover changes the preview without changing the camera, persistent selection, or history.
- [x] Browser coverage proves a selected entity remains reachable while an unrelated search is active.
- [x] Browser coverage proves directory disclosure does not select or move the camera and directory-row activation does not toggle disclosure.
- [x] Browser coverage proves breadcrumb navigation and canvas clear-selection behavior.
- [x] Existing workspace, coverage, external-package, and type-only interaction scenarios continue to pass.

## Documentation

- [x] Update the README report-controls section when the navigation behavior ships.
- [x] Update the glossary if implementation introduces a more specific navigation term than those defined in this milestone. No new domain term was required.
- [x] Record any durable interaction-state ownership decision in architecture documentation.

## Verification evidence

- `pnpm exec vitest run --silent=true src/report/browser/project-file-tree.test.ts src/report/browser/report-navigation.test.ts src/report/build-html-report.test.ts` passed 3 files and 12 tests.
- `pnpm exec playwright test tests/browser/static-report.spec.ts --grep "navigates a collapsible and searchable project-files tree"` passed the focused Task 22 browser workflow.
- `pnpm checks` passed formatting, linting, type checking, 26 Vitest files with 261 tests, 14 Chromium scenarios, the sentinel performance benchmark, both builds, and dogfood report generation.

## Non-goals

- Adding diagnostic findings or lens-specific encodings.
- Searching external packages.
- Mobile or narrow-window layout work.
- Replacing Sigma, Graphology, or ForceAtlas2.

## Discovered gaps

None yet.
