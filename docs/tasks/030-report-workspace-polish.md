# 030 Report Workspace Polish

## Status

Not started.

## Outcome

The completed diagnostic workflow gives the graph as much useful large-desktop space as possible, keeps long code paths readable, and preserves users' spatial context when a presentation change does not require a new layout.

## Dependencies

- [Milestones 022 through 029](./022-coherent-report-navigation.md) establish the final navigation surfaces, lenses, findings, filters, matrices, rules, and external-package workflow.
- [Milestone 010](./done/010-visualization-and-ux.md) establishes the current fixed large-desktop shell.
- [ADR 003](../adr/003-use-sigma-graphology-forceatlas2.md) defines when graph membership or node sizing requires deterministic layout reconstruction.

Do this after the diagnostic surfaces exist. Polishing the current permanent control band before lens-specific controls are known would create avoidable rework.

## Current behavior and problem

The report uses fixed left and right sidebars plus a permanent controls region below the graph. At a 1280 by 720 review viewport, the graph occupied 720 by 488 pixels. Long file paths and relationship names can require horizontal scrolling. Low-level controls and legends consume space even when they are not relevant to the user's current question.

Large desktop remains the target. Narrow-window and mobile redesign are outside scope.

## UX contract

- The left navigation/findings region and right inspector are independently collapsible and resizable within documented large-desktop limits.
- Collapsing or resizing a panel immediately gives the graph the released space and refreshes Sigma without rebuilding analysis or layout.
- Lens selection, primary lens controls, and the active legend remain visible in a compact toolbar.
- Advanced controls are available on demand and do not permanently consume graph height.
- Long paths wrap or use deliberate middle elision with the complete path available accessibly. Ordinary workflows must not require horizontal panel scrolling.
- The inspector groups metrics, dependencies, consumers, boundaries, and diagnostics into sections appropriate to the active entity and lens.
- Empty inspector space teaches the essential interactions concisely: search, hover to preview, select to persist, wheel to zoom, drag to pan, and fit to recover.
- Preserve camera position and node coordinates when presentation changes leave graph node identities and sizes unchanged.
- When membership or sizing changes, use the deterministic report-view transition required by ADR 003 and make the transition understandable rather than pretending the old geometry is valid.
- Fit-to-view accounts for the current graph viewport after panel resizing.
- Session UI state does not need persistence across closing or reopening the self-contained report.

## Implementation tasks

- [ ] Replace the permanent bottom control band with a compact lens toolbar and on-demand advanced controls.
- [ ] Add independent collapse controls for navigation/findings and inspector regions.
- [ ] Add bounded pointer and keyboard resizing for both side regions.
- [ ] Refresh the graph viewport and overlays without recomputing layout when only available screen space changes.
- [ ] Remove horizontal scrolling from ordinary file-tree, relationship-list, and inspector workflows.
- [ ] Add lens-appropriate inspector sections and collapse long secondary sections.
- [ ] Add concise interaction guidance to the empty inspector and accessible help text.
- [ ] Audit every lens for irrelevant controls, duplicated legends, and unused permanent chrome.
- [ ] Preserve camera and coordinates for render-only edge visibility, panel resizing, inspector changes, search, findings expansion, and other non-layout state.
- [ ] Continue deterministic layout reconstruction for membership and node-size changes.
- [ ] Verify fit-to-view, labels, hover overlays, and focus decorations after arbitrary supported panel sizes.
- [ ] Measure resize and lens-transition responsiveness against the performance sentinel.

## Required tests

- [ ] Browser coverage verifies both panels open, collapsed, and resized at 1920 by 1080 and 1440 by 900.
- [ ] Browser coverage proves panel resizing expands the graph viewport without changing graph coordinates.
- [ ] Browser coverage proves fit-to-view uses the resized viewport and keeps rendered nodes within bounds.
- [ ] Browser coverage proves long paths remain readable without horizontal panel scrolling.
- [ ] Browser coverage verifies the toolbar and advanced controls for every implemented lens.
- [ ] Browser coverage proves render-only changes preserve coordinates and camera state.
- [ ] Browser coverage proves membership and sizing changes still use deterministic reconstruction.
- [ ] Browser coverage verifies empty-state interaction guidance and keyboard-accessible panel controls.
- [ ] The complete browser suite proves all diagnostic workflows remain usable together.

## Documentation

- [ ] Update the README screenshot after the shell changes materially.
- [ ] Update the README report-controls and interaction guidance.
- [ ] Record supported large-desktop verification sizes and retain the explicit narrow-window/mobile limitation.
- [ ] Amend ADR 003 only if layout ownership or reconstruction rules change.

## Verification evidence

Record commands and results here before completion.

## Non-goals

- Mobile or narrow-window redesign.
- Persisting report UI state outside the current page session.
- Replacing the graph renderer or layout algorithm.
- Changing the self-contained single-file report contract.

## Discovered gaps

None yet.
