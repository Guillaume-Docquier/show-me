# 025 Coverage Lens

## Status

Complete.

Completed on 2026-07-29. The Coverage lens now combines inclusive physical code-line and imported executable-line coverage thresholds, keeps unavailable coverage distinct, presents exact sortable results and scoped counts, preserves full search and inspection, hides dependency noise, and emphasizes matches without replacing coverage fills.

## Outcome

Users can deliberately explore coverage risk by combining file size, exact coverage, workspace scope, and explicit thresholds without dependency edges obscuring the question.

## Dependencies

- [Milestone 023](./done/023-diagnostic-lens-framework.md) establishes deterministic lens presets and lens-specific controls.
- [Milestone 024](./done/024-findings-first-overview.md) establishes explainable coverage findings and shared finding navigation.
- [Milestone 005](./done/005-coverage.md) and [Milestone 018](./done/018-lcov-coverage.md) establish normalized project-file coverage.

## Current behavior and problem

Coverage is encoded as project-file color, code lines are encoded as node size, and exact coverage appears in the inspector. That combination is useful, but the default graph also contains structure and dependency information, overview-scale file labels are sparse, and users cannot filter directly for large files below a coverage threshold.

Coverage is the percentage of executable lines reported by imported coverage data. Code-line count is a separate physical-line metric. Do not multiply them and present the result as an exact uncovered-line count.

## UX contract

- Add a `Coverage` lens.
- The default coverage presentation sizes project files by code lines, colors them by coverage, keeps enough directory context for orientation, and hides dependency edges.
- The lens displays exact coverage and code-line values in its finding list and inspector.
- Provide a minimum-code-lines filter and a maximum-coverage filter.
- Provide an explicit include/exclude control for unavailable coverage.
- Filtering changes the diagnostic result set and graph emphasis. It must not silently delete files from authoritative analysis.
- Files outside the diagnostic thresholds remain available through search and navigation.
- Unknown coverage has its own color, filter state, count, and finding category.
- Selecting a result uses the shared navigation contract and preserves the active coverage filters.
- The legend explains the coverage scale and active size encoding in the same region as the lens controls.

## Implementation tasks

- [x] Add the `Coverage` lens preset and lens-specific state.
- [x] Define typed coverage-filter state with deterministic defaults.
- [x] Reuse the normalized coverage and line metrics already present in browser presentation.
- [x] Render coverage findings with code lines and exact coverage as sortable columns or equivalent scan-friendly rows.
- [x] Add minimum-code-lines, maximum-coverage, and unavailable-coverage controls with accessible labels and current values.
- [x] Distinguish graph membership from diagnostic emphasis so filtered-out candidates remain searchable and inspectable.
- [x] Highlight matching project-file nodes and de-emphasize non-matches without changing their coverage colors.
- [x] Keep dependency edges and dependency-focus rings out of the coverage preset; relationships remain available in the inspector.
- [x] Show counts for matching files, known-coverage files, and unavailable-coverage files.
- [x] Preserve active workspace scope and selection across coverage-filter changes when the selected file remains in scope.
- [x] Expose semantic filter and result state for browser tests.

## Required tests

- [x] Focused tests cover default filters, boundary values, zero and 100% coverage, unavailable coverage, empty files, and stable ordering.
- [x] Tests prove physical code lines and executable-line coverage are never described as the same quantity.
- [x] Browser coverage proves the lens preset, legend, filters, result counts, graph emphasis, and selection workflow.
- [x] Browser coverage proves a filtered-out file remains discoverable through search and can be inspected without clearing the coverage filters.
- [x] Browser coverage proves unavailable coverage can be included and excluded independently from zero coverage.
- [x] Browser coverage proves workspace scope composes with coverage filters.
- [x] Existing Istanbul and LCOV equivalence tests continue to produce the same displayed coverage.

## Documentation

- [x] Update the README with the Coverage lens, defaults, filters, and unknown-coverage semantics.
- [x] Keep the glossary definitions of Coverage and Line metric aligned with the UI language.
- [x] Document that Show Me ranks candidates from imported percentages and does not compute exact uncovered source lines.

## Verification evidence

- `pnpm exec vitest run --silent=true src/report/browser/report-coverage.test.ts src/report/browser/report-lens.test.ts src/report/build-html-report.test.ts` passed 3 files and 9 tests.
- `pnpm exec playwright test --grep "filters coverage risk"` passed the complete Coverage lens browser workflow.
- `pnpm checks` passed formatting, zero-warning lint, type checking, all 29 Vitest files and 273 tests, both builds, all 17 Chromium scenarios, the performance sentinel, and dogfood report generation.
- Browser inspection of the generated dogfood report confirmed 24 default matches, 23 files with known coverage, 125 with unavailable coverage, zero rendered dependency edges, and 24 fill-preserving emphasis rings. The README screenshot was refreshed from this report.

## Non-goals

- Branch, function, or statement coverage.
- An inferred exact uncovered-line count.
- Changing coverage discovery or merge behavior.
- Hiding files permanently from the report.

## Discovered gaps

None yet.
