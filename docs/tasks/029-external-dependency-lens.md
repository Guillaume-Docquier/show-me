# 029 External Dependency Lens

## Status

Not started.

## Outcome

Users can quickly identify which external packages have the broadest footprint, where each package is used, and whether usage is runtime or type-only without adding every package node to the complete project graph.

## Dependencies

- [Milestone 023](./done/023-diagnostic-lens-framework.md) establishes lens presets.
- [Milestone 024](./done/024-findings-first-overview.md) establishes findings.
- [Milestone 027](./027-boundary-lens.md) establishes workspace and boundary aggregation.
- [Milestone 007](./done/007-external-packages.md) and [Milestone 021](./done/021-type-only-dependencies.md) establish canonical external-package identities and relationship kinds.

## Current behavior and problem

External packages are hidden by default. Enabling them adds every visible package node to the graph, rebuilds layout, and renders a separate unfiltered package list below the project tree. Selecting a package provides its consumers, but the list is alphabetical rather than diagnostic and does not summarize usage by workspace, boundary, or relationship kind.

External package names are dependency facts. Installed package contents, versions, licenses, vulnerabilities, and unused declared dependencies are not present in analysis.

## UX contract

- Add an `External` lens.
- The initial lens view ranks external packages by distinct project-file consumer count rather than displaying every package node in the complete graph.
- Display total, runtime, and type-only consumer counts for each package.
- Group or filter consumers by workspace package and derived or configured boundary when those concepts are available.
- Selecting a package shows one focused package-and-consumers graph. Do not require all external packages to participate in layout.
- Selecting a consumer uses the shared navigation operation and keeps an easy path back to the package.
- Integrate external packages into codebase search. Search results identify their kind and switch to the External lens when activated.
- External search works even when the user has not enabled the old all-packages custom view.
- Add `Most widely used external packages` to `Overview` findings, ranked by distinct consumer count, runtime count, then package name.
- Keep runtime and type-only usage visibly distinct in lists, counts, graph edges, and filters.
- Preserve an advanced custom option to render every external package when desired.

## Implementation tasks

- [ ] Add the `External` lens preset and package-focused report state.
- [ ] Derive deterministic per-package consumer totals split by relationship kind, workspace, and available boundary.
- [ ] Add ranked, searchable, and filterable package results.
- [ ] Add package-and-consumers graph projection that includes one selected package and its visible project-file consumers.
- [ ] Preserve project-file coverage colors and explain external edge kinds.
- [ ] Integrate package activation with shared search, navigation history, inspector, and lens state.
- [ ] Extend `Overview` findings with widely used external packages.
- [ ] Keep the all-packages graph as an advanced `Custom` state rather than the main External lens.
- [ ] Ensure package subpaths continue to collapse to their canonical package root.
- [ ] Avoid reading installed package files or package manifests in the browser.
- [ ] Expose semantic package ranking, grouping, filters, and focus state for browser tests.

## Required tests

- [ ] Focused tests cover scoped packages, subpaths, repeated imports, runtime/type-only precedence, consumers in multiple workspaces, and stable ranking.
- [ ] Tests prove distinct consumer counts do not count repeated declarations twice.
- [ ] Browser coverage proves the initial ranked list does not add every package node to graph layout.
- [ ] Browser coverage proves package selection, focused consumers, grouping, filters, consumer navigation, and navigation back to the package.
- [ ] Browser coverage proves external-package search switches to the External lens and selects the result.
- [ ] Browser coverage proves the Overview finding ranking and exact metrics.
- [ ] Browser coverage proves the advanced all-packages state remains available and deterministic.
- [ ] Performance coverage proves repositories with many package facts do not materially regress initial report readiness.

## Documentation

- [ ] Update the README with the External lens, ranking, grouping, search behavior, defaults, and advanced all-packages view.
- [ ] Preserve the glossary definition that external package nodes do not analyze installed code.
- [ ] Document that Show Me does not provide package version, license, vulnerability, or unused-declaration analysis.

## Verification evidence

Record commands and results here before completion.

## Non-goals

- Reading `node_modules`.
- Package-version, license, security, or upgrade advice.
- Finding unused dependencies declared in package manifests.
- Treating popularity within one codebase as a quality judgment.

## Discovered gaps

None yet.
