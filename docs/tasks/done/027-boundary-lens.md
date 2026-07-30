# 027 Boundary Lens

## Status

Complete.

## Outcome

Users can see how workspace packages and coarse codebase regions depend on one another, then drill from an aggregate relationship into the exact project-file dependencies that create it.

## Dependencies

- [Milestone 023](./023-diagnostic-lens-framework.md) establishes lens state and lens-specific surfaces.
- [Milestone 026](./026-coupling-lens.md) establishes coupling metrics, relationship filters, and focused dependency exploration.
- [Milestone 008](./008-pnpm-workspaces.md) establishes workspace-package ownership.
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

- [x] Add deterministic browser-owned boundary derivation and aggregate relationship types.
- [x] Add the `Boundaries` lens preset and directed aggregate view.
- [x] Render an accessible boundary matrix with stable row and column ordering.
- [x] Display runtime and type-only counts separately in cells and totals.
- [x] Add boundary selection and boundary-pair drill-down through the shared navigation and focus contracts.
- [x] Filter the project-file graph to the selected boundary or boundary pair without mutating embedded analysis.
- [x] Show the exact underlying dependency list with source path, target path, and relationship kind.
- [x] Compose workspace scope and relationship-kind filters with aggregation.
- [x] Expose semantic boundary identities, cell counts, direction, and drill-down state for browser tests.
- [x] Measure aggregation and matrix rendering against the performance sentinel.

## Required tests

- [x] Focused tests cover multi-workspace, single-workspace, root-file, empty-boundary, runtime, and type-only cases.
- [x] Tests prove directed source-target counts and deterministic ordering.
- [x] Tests prove every aggregate count equals the exact drill-down relationship count.
- [x] Browser coverage proves boundary and cell selection, graph filtering, inspector details, and return to the complete matrix.
- [x] Browser coverage proves workspace and relationship-kind filters update every surface consistently.
- [x] Browser coverage proves cross-boundary relationships are not described as violations.
- [x] Performance coverage measures aggregation and matrix rendering in the existing large-codebase sentinel.

## Documentation

- [x] Add `Boundary` to the glossary with the distinction between derived boundaries and configured architecture modules.
- [x] Update the README with boundary derivation, matrix direction, filters, and non-violation language.
- [x] Record a discovered gap when repository structure produces boundaries too coarse to be useful; do not add heuristics silently.

## Verification evidence

- `pnpm exec vitest run --silent=true src/report/browser/report-boundaries.test.ts src/report/browser/report-lens.test.ts src/report/browser/report-view.test.ts` passed 3 files and 15 tests.
- `pnpm test:browser -- --grep "drills from directed boundary aggregates"` passed the complete boundary workflow in Chromium.
- `pnpm checks` passed formatting, zero-warning lint, type checking, all 31 Vitest files and 284 tests, both builds, all 19 Chromium scenarios, the performance sentinel, and dogfood report generation. Boundary aggregation plus matrix rendering took 4.9 ms and 5.1 ms in the sentinel browser runs.

## Non-goals

- User-defined module names or allowlists.
- Architecture violations.
- External-package aggregation.
- Automatically inferring intended architectural layers.

## Discovered gaps

- First directory segments can be too coarse in repositories that place most code below one shared directory such as `src`. Show Me reports that structure as-is. Configured architecture modules in Milestone 028 are the explicit refinement path; this milestone does not infer hidden layers.
