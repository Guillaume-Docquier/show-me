# 026 Coupling Lens

## Status

Complete.

Completed on 2026-07-29. The Coupling lens now ranks visible direct degree, preserves coverage fills, filters runtime and type-only relationships consistently, suppresses background graph noise, explains overlapping dependency and consumer roles, and supports selectable cycle-group focus with ordinary member navigation.

## Outcome

Users can identify dependency hubs, high fan-out files, heavily consumed files, and cycles without structure edges or unrelated dependency edges turning the graph into a hairball.

## Dependencies

- [Milestone 023](./done/023-diagnostic-lens-framework.md) establishes deterministic lenses and custom presentation state.
- [Milestone 024](./done/024-findings-first-overview.md) establishes fan-in, fan-out, and cycle derivation.
- [Milestone 021](./done/021-type-only-dependencies.md) establishes runtime and type-only relationship kinds.
- [ADR 003](../adr/003-use-sigma-graphology-forceatlas2.md) establishes the graph renderer, layout, and browser ownership.

## Current behavior and problem

The report can show or hide structure and dependency edges and can focus a selected node's direct neighborhood. On dense projects, focused cyan and orange rings overlap, the background graph remains difficult to trace, and the graph key explains edge kinds but not focused dependency versus consumer direction.

High fan-in, high fan-out, and cycles are facts for investigation. They are not automatically defects.

## UX contract

- Add a `Coupling` lens.
- Hide structure edges by default and make runtime/type-only relationship filters prominent.
- Size project-file nodes by total visible direct degree in this lens. A project file with no visible relationships uses the minimum project-file size.
- Preserve coverage as the node fill so coupling can be investigated without losing coverage context.
- Add explicit fan-in, fan-out, runtime, type-only, and cycle indicators in the findings list and inspector.
- Unfocused dependency edges are hidden or strongly suppressed. Hover or selection reveals the direct neighborhood with clearly explained dependency and consumer colors.
- A node that is both a dependency and consumer uses two distinguishable treatments without covering its fill.
- The active focus legend explains dependency direction, consumer direction, selected-node treatment, and runtime/type-only edge style together.
- Provide an option to show all background dependencies for advanced exploration. Enter `Custom` when it diverges from the lens preset.
- Cycles are selectable as a group. Selecting a cycle focuses its members and internal edges; selecting an individual member returns to ordinary node focus.
- Do not display transitive relationships as direct relationships.

## Implementation tasks

- [x] Add the `Coupling` lens preset and degree-based sizing.
- [x] Reuse the deterministic relationship indexes and strongly connected components from Milestone 024.
- [x] Add renderer-neutral coupling metrics to browser presentation without extending embedded analysis.
- [x] Update graph focus decoration so dense neighborhoods remain distinguishable and node coverage fill stays visible.
- [x] Render a focus-specific legend when a project file or cycle is active.
- [x] Add scan-friendly fan-in, fan-out, relationship-kind, and cycle details to the inspector.
- [x] Support cycle-group selection and internal-edge emphasis.
- [x] Add runtime and type-only filters that update metrics, findings, cycle membership, and rendered relationships consistently.
- [x] Add an advanced background-edge control without changing the deterministic node layout when node membership and sizing are unchanged.
- [x] Preserve explicit navigation, search, history, and workspace scope.
- [x] Expose semantic coupling metrics and focus state for browser tests; use composited screenshot evidence only for visual treatments.

## Required tests

- [x] Focused tests cover degree sizing, runtime/type-only splits, duplicate-edge collapse, self-edges, overlapping dependency/consumer roles, runtime cycles, and cycles that require type-only relationships.
- [x] Tests prove direct and transitive relationships remain distinct.
- [x] Browser coverage proves the initial coupling view has no structure-edge noise and does not render the complete background hairball.
- [x] Browser coverage proves focused dependency and consumer relationships, overlapping roles, legends, and preserved coverage fill.
- [x] Browser coverage proves cycle-group selection and return to individual-node selection.
- [x] Browser coverage proves runtime/type-only filters update rankings, counts, cycles, and graph emphasis together.
- [x] Browser coverage proves the advanced background-edge control does not move nodes.
- [x] Performance sentinel coverage measures coupling derivation and dense focus rendering.

## Documentation

- [x] Update the README with the Coupling lens, metrics, defaults, filters, and direction legend.
- [x] Document that high coupling and cycles are investigation candidates, not rule violations.
- [x] Amend ADR 003 only if implementation changes renderer or layout ownership. No amendment was needed.

## Verification evidence

- `pnpm exec vitest run --silent=true src/report/browser/report-coupling.test.ts src/report/browser/report-lens.test.ts src/report/browser/report-view.test.ts src/report/browser/report-findings.test.ts src/report/build-html-report.test.ts src/performance/performance-profiler.test.ts` passed 6 files and 22 tests.
- `pnpm exec playwright test --grep "explores direct coupling"` passed the complete Coupling lens browser workflow.
- `pnpm checks` passed formatting, zero-warning lint, type checking, all 30 Vitest files and 277 tests, both builds, all 18 Chromium scenarios, the performance sentinel, and dogfood report generation. Coupling derivation took 1.2 ms and 1.1 ms in the sentinel browser runs.
- Browser inspection of the generated dogfood report confirmed 96 files with direct relationships, 164 visible relationships, 3 cycle groups, degree-based sizing, coverage fills, and zero initial structure or dependency edges. The README screenshot was refreshed from this report.

## Non-goals

- Transitive-closure visualization by default.
- An opaque maintainability score.
- Architecture-rule enforcement.
- Replacing the selected graph libraries without a new ADR.

## Discovered gaps

None yet.
