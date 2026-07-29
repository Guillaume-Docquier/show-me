# 027 Boundary Lens

## Status

Not started.

## Outcome

Users can see how workspace packages and coarse codebase regions depend on one another, then drill from an aggregate relationship into the exact project-file dependencies that create it.

## Dependencies

- [Milestone 023](./done/023-diagnostic-lens-framework.md) establishes lens state and lens-specific surfaces.
- [Milestone 026](./026-coupling-lens.md) establishes coupling metrics, relationship filters, and focused dependency exploration.
- [Milestone 008](./done/008-pnpm-workspaces.md) establishes workspace-package ownership.
- [ADR 001](../adr/001-separate-analysis-from-rendering.md) keeps boundary aggregation in browser presentation unless authoritative analysis must change.

## Current behavior and problem

Workspace packages appear as graph regions and can be hidden independently, but the report does not summarize dependencies between them. In a single-package project, top-level directories provide useful coarse regions, but every project organizes those directories differently.

This milestone reports factual relationships. It does not decide that a relationship is forbidden. Rule-backed violations are introduced by [Milestone 028](./028-configurable-architecture-rules.md).

## Vocabulary

A **boundary** is a named grouping of project files used to aggregate dependencies. Before explicit architecture configuration exists, Show Me derives coarse boundaries from workspace packages and top-level project directories.

## Derived boundary rules

- If the project has more than one workspace package, workspace packages are the primary boundaries.
- Inside a selected workspace package, its first project-relative directory segment is a secondary boundary.
- Root-level project files belong to a stable `(root files)` boundary.
- In a project without multiple workspace packages, first path segments are primary boundaries.
- Boundaries and their ordering are derived deterministically from visible project files.
- A dependency belongs to the boundary pair containing its source and target project files.
- External-package dependencies are excluded from this milestone and handled by Milestone 029.

## UX contract

- Add a `Boundaries` lens.
- Present an accessible directed dependency matrix or equivalent aggregate view with source boundaries as rows and target boundaries as columns.
- Every non-empty cell displays runtime and type-only counts separately.
- Self-boundary cells remain visible because internal coupling is useful context.
- Cross-boundary cells are visually distinct from self-boundary cells but are not labeled violations.
- Selecting a boundary focuses its files and internal relationships.
- Selecting a matrix cell filters the project-file graph and inspector to the exact relationships represented by that source-target pair.
- Display source and target direction explicitly. Do not rely on arrow interpretation alone.
- Workspace scope and runtime/type-only filters update the matrix, graph, counts, and drill-down together.
- Empty scopes and boundary pairs have deliberate explanatory states.

## Implementation tasks

- [ ] Add deterministic browser-owned boundary derivation and aggregate relationship types.
- [ ] Add the `Boundaries` lens preset and directed aggregate view.
- [ ] Render an accessible boundary matrix with stable row and column ordering.
- [ ] Display runtime and type-only counts separately in cells and totals.
- [ ] Add boundary selection and boundary-pair drill-down through the shared navigation and focus contracts.
- [ ] Filter the project-file graph to the selected boundary or boundary pair without mutating embedded analysis.
- [ ] Show the exact underlying dependency list with source path, target path, and relationship kind.
- [ ] Compose workspace scope and relationship-kind filters with aggregation.
- [ ] Expose semantic boundary identities, cell counts, direction, and drill-down state for browser tests.
- [ ] Measure aggregation and matrix rendering against the performance sentinel.

## Required tests

- [ ] Focused tests cover multi-workspace, single-workspace, root-file, empty-boundary, runtime, and type-only cases.
- [ ] Tests prove directed source-target counts and deterministic ordering.
- [ ] Tests prove every aggregate count equals the exact drill-down relationship count.
- [ ] Browser coverage proves boundary and cell selection, graph filtering, inspector details, and return to the complete matrix.
- [ ] Browser coverage proves workspace and relationship-kind filters update every surface consistently.
- [ ] Browser coverage proves cross-boundary relationships are not described as violations.
- [ ] Performance coverage prevents a dense matrix from materially regressing report readiness or interaction.

## Documentation

- [ ] Add `Boundary` to the glossary with the distinction between derived boundaries and configured architecture modules.
- [ ] Update the README with boundary derivation, matrix direction, filters, and non-violation language.
- [ ] Record a discovered gap when repository structure produces boundaries too coarse to be useful; do not add heuristics silently.

## Verification evidence

Record commands and results here before completion.

## Non-goals

- User-defined module names or allowlists.
- Architecture violations.
- External-package aggregation.
- Automatically inferring intended architectural layers.

## Discovered gaps

None yet.
