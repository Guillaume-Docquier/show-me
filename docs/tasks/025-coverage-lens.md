# 025 Coverage Lens

## Status

Not started.

## Outcome

Users can deliberately explore coverage risk by combining file size, exact coverage, workspace scope, and explicit thresholds without dependency edges obscuring the question.

## Dependencies

- [Milestone 023](./023-diagnostic-lens-framework.md) establishes deterministic lens presets and lens-specific controls.
- [Milestone 024](./024-findings-first-overview.md) establishes explainable coverage findings and shared finding navigation.
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

- [ ] Add the `Coverage` lens preset and lens-specific state.
- [ ] Define typed coverage-filter state with deterministic defaults.
- [ ] Reuse the normalized coverage and line metrics already present in browser presentation.
- [ ] Render coverage findings with code lines and exact coverage as sortable columns or equivalent scan-friendly rows.
- [ ] Add minimum-code-lines, maximum-coverage, and unavailable-coverage controls with accessible labels and current values.
- [ ] Distinguish graph membership from diagnostic emphasis so filtered-out candidates remain searchable and inspectable.
- [ ] Highlight matching project-file nodes and de-emphasize non-matches without changing their coverage colors.
- [ ] Keep dependency edges and dependency-focus rings out of the coverage preset; relationships remain available in the inspector.
- [ ] Show counts for matching files, known-coverage files, and unavailable-coverage files.
- [ ] Preserve active workspace scope and selection across coverage-filter changes when the selected file remains in scope.
- [ ] Expose semantic filter and result state for browser tests.

## Required tests

- [ ] Focused tests cover default filters, boundary values, zero and 100% coverage, unavailable coverage, empty files, and stable ordering.
- [ ] Tests prove physical code lines and executable-line coverage are never described as the same quantity.
- [ ] Browser coverage proves the lens preset, legend, filters, result counts, graph emphasis, and selection workflow.
- [ ] Browser coverage proves a filtered-out file remains discoverable through search and can be inspected without clearing the coverage filters.
- [ ] Browser coverage proves unavailable coverage can be included and excluded independently from zero coverage.
- [ ] Browser coverage proves workspace scope composes with coverage filters.
- [ ] Existing Istanbul and LCOV equivalence tests continue to produce the same displayed coverage.

## Documentation

- [ ] Update the README with the Coverage lens, defaults, filters, and unknown-coverage semantics.
- [ ] Keep the glossary definitions of Coverage and Line metric aligned with the UI language.
- [ ] Document that Show Me ranks candidates from imported percentages and does not compute exact uncovered source lines.

## Verification evidence

Record commands and results here before completion.

## Non-goals

- Branch, function, or statement coverage.
- An inferred exact uncovered-line count.
- Changing coverage discovery or merge behavior.
- Hiding files permanently from the report.

## Discovered gaps

None yet.
