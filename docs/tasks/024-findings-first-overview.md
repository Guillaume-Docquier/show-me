# 024 Findings-First Overview

## Status

Not started.

## Outcome

Opening a report immediately presents a short, explainable set of codebase candidates worth investigating, and every candidate links to the same graph selection and inspector workflow used elsewhere.

## Dependencies

- [Milestone 022](./022-coherent-report-navigation.md) establishes explicit navigation from any report surface.
- [Milestone 023](./done/023-diagnostic-lens-framework.md) establishes the `Overview` lens and lens-specific presentation state.
- [ADR 001](../adr/001-separate-analysis-from-rendering.md) requires findings to be derived in the browser from language-neutral analysis facts.

## Current behavior and problem

The graph encodes code lines, coverage, dependencies, consumers, package ownership, and external usage, but most facts become named and comparable only after selecting a node. The initial graph therefore supports spatial exploration but does not answer which files deserve attention.

Findings are candidates, not verdicts. Show Me can identify unusual facts and relationships. It must not call a cross-directory dependency wrong without an explicit architecture rule.

## Vocabulary

A **finding** is an explainable, browser-derived candidate that combines or ranks existing analysis facts for investigation. It always displays the raw facts that caused it to appear.

## UX contract

- `Overview` opens with a `Findings` panel and keeps the project explorer available as a sibling panel or tab.
- Each finding has a category, entity name, raw metrics, and one concise explanation.
- Activating a finding selects and centers the entity through the navigation contract from Milestone 022.
- Findings are deterministic for the same analysis and active workspace scope.
- Findings respond to workspace-package scope but not to project-tree search.
- Do not use one opaque health or risk score.
- Unknown coverage is never treated as zero coverage.
- Show at most five candidates per category initially, with a way to view the complete deterministic list.
- Hide categories with no candidates rather than rendering empty warning sections.

## Initial finding categories

### Large files with low known coverage

- Determine the upper quartile of code-line counts among visible project files with at least one code line.
- Include files in that quartile whose known coverage is below 80%.
- Sort by coverage ascending, then code lines descending, then path.
- Display both code lines and exact coverage.

### Large files with unavailable coverage

- Use the same upper-quartile code-line threshold.
- Include only files whose coverage is unavailable.
- Sort by code lines descending, then path.
- Label coverage as unavailable, not uncovered.

### Highest fan-out

- Count distinct visible direct dependencies for each project file.
- Display runtime and type-only counts separately.
- Sort by total descending, runtime descending, then path.
- Exclude files with no dependencies.

### Highest fan-in

- Count distinct visible project-file consumers for each project file.
- Display runtime and type-only counts separately.
- Sort by total descending, runtime descending, then path.
- Exclude files with no consumers.

### Dependency cycles

- Find strongly connected components independently for runtime-only relationships and for the combined runtime-plus-type-only graph.
- A component with more than one file is a cycle. A self-edge is also a cycle.
- Report a cycle as `Runtime` when its cycle exists in the runtime-only graph. Report a remaining combined-graph cycle as `Includes type-only dependencies`; do not report the same runtime cycle twice.
- Rank runtime cycles before cycles that require type-only relationships, then by component size descending and stable path order.
- Display the cycle kind, member count, and representative paths.

### Cross-workspace relationships

- Include dependencies whose source and target project files belong to different workspace packages.
- Group by source-target workspace pair and dependency kind.
- Rank groups by relationship count descending, then stable workspace names.
- Call them cross-workspace relationships, not violations.

External-package findings are added by [Milestone 029](./029-external-dependency-lens.md).

## Implementation tasks

- [ ] Add renderer-neutral browser finding types and deterministic derivation helpers.
- [ ] Derive findings from immutable browser presentation plus active workspace scope.
- [ ] Implement deterministic percentile, fan-in, fan-out, strongly connected component, and cross-workspace grouping logic.
- [ ] Keep graph identities and display strings in browser presentation rather than duplicating analysis facts.
- [ ] Render categorized findings in the `Overview` lens with raw metrics and complete accessible names.
- [ ] Support the initial five-item summary and complete list without recomputing a different ranking.
- [ ] Route finding activation through the shared navigation operation.
- [ ] Add deliberate all-clear copy when the active scope produces no findings.
- [ ] Expose semantic finding categories, entity identities, ranks, and counts for browser tests.
- [ ] Measure derivation time with the existing performance profiler and avoid per-render recomputation.

## Required tests

- [ ] Small hand-written fixtures cover each finding category and all tie-break rules.
- [ ] Tests prove unknown coverage is separate from zero coverage.
- [ ] Tests prove runtime and type-only counts remain distinct.
- [ ] Tests prove runtime cycles, cycles that require type-only relationships, duplicate suppression, self-cycles, and acyclic graphs.
- [ ] Tests prove findings update with workspace scope and ignore project-tree search.
- [ ] Browser coverage proves the initial report presents findings before the user knows a file name.
- [ ] Browser coverage activates a finding and verifies selection, centering, inspector details, and navigation history.
- [ ] Browser coverage verifies the five-item summary and complete deterministic list.
- [ ] Performance sentinel coverage prevents findings derivation from materially regressing browser-ready time.

## Documentation

- [ ] Add `Finding` to the glossary.
- [ ] Update the README with every implemented finding category and the distinction between candidates and rule-backed violations.
- [ ] Document the exact deterministic ranking rules so users can interpret why an entity appears.

## Verification evidence

Record commands and results here before completion.

## Non-goals

- A composite code-health score.
- Claims that a high fan-in, high fan-out, cycle, or cross-workspace relationship is inherently wrong.
- Architecture-rule violations.
- Source-code or AST inspection in the browser.

## Discovered gaps

None yet.
