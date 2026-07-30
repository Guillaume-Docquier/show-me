# Implementation Tasks

This directory tracks milestones, implementation progress, verification evidence, and gaps discovered while building Show Me. It is the repository-local task tracker; GitHub issues are not required.

## Roadmap

Milestones 024 through 030 continue the ordered report-UX sequence established by completed milestones 022 and 023. Implement them in numeric order because each milestone establishes interaction or presentation contracts used by the next. Milestone 020 is independent and may be scheduled separately.

| Milestone                                                                       | Status      | Outcome                                                                                    |
| ------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| [020 Configurable coverage locations](./020-configurable-coverage-locations.md) | Not started | Configure per-package locations and multiple explicit reports.                             |
| [028 Configurable architecture rules](./028-configurable-architecture-rules.md) | Not started | Declare modules and allowed directions, then report exact rule-backed violations.          |
| [029 External dependency lens](./029-external-dependency-lens.md)               | Not started | Rank external packages and explore their consumers without adding every package to layout. |
| [030 Report workspace polish](./030-report-workspace-polish.md)                 | Not started | Reclaim graph space, improve long-path readability, and preserve spatial context.          |

## Done

Completed milestone files are retained under [`done/`](./done/) as implementation history and verification evidence.

| Milestone                                                                      | Completed  | Outcome                                                                         |
| ------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------- |
| [001 Foundation](./done/001-foundation.md)                                     | 2026-07-15 | Established build boundaries, fixtures, and test infrastructure.                |
| [002 File discovery and LOC](./done/002-file-discovery-and-loc.md)             | 2026-07-15 | Added executable-file discovery and deterministic non-blank LOC.                |
| [003 Static visualization](./done/003-static-visualization.md)                 | 2026-07-16 | Added the self-contained interactive graph and hardened its layout.             |
| [004 Static ESM imports](./done/004-static-esm-imports.md)                     | 2026-07-16 | Added static runtime ESM dependencies and relationship details.                 |
| [005 Coverage](./done/005-coverage.md)                                         | 2026-07-16 | Added optional Istanbul line coverage and coverage-colored nodes.               |
| [006 CLOC line breakdown](./done/006-cloc-line-breakdown.md)                   | 2026-07-16 | Added exclusive line categories and interactive node sizing.                    |
| [007 External packages](./done/007-external-packages.md)                       | 2026-07-16 | Added optional package nodes without analyzing installed code.                  |
| [008 pnpm workspaces](./done/008-pnpm-workspaces.md)                           | 2026-07-18 | Analyzes and filters all packages in one pnpm workspace.                        |
| [009 Import compatibility](./done/009-import-compatibility.md)                 | 2026-07-25 | Adds CommonJS, dynamic imports, and broader resolution behavior.                |
| [010 Visualization and UX](./done/010-visualization-and-ux.md)                 | 2026-07-25 | Delivers large-desktop navigation, interpretation, and graph focus.             |
| [011 Large-codebase performance](./done/011-large-codebase-performance.md)     | 2026-07-25 | Adds measured five-million-line analysis and collision-safe rendering.          |
| [012 GitHub Pages report](./done/012-github-pages-report.md)                   | 2026-07-16 | Publishes a validated live visualization of the repository.                     |
| [013 Default test-file exclusions](./done/013-default-test-file-exclusions.md) | 2026-07-16 | Removes conventionally named test files from default analysis.                  |
| [014 CLI file selection](./done/014-cli-file-selection.md)                     | 2026-07-25 | Replaces built-in test exclusions with one-invocation patterns.                 |
| [015 Project configuration](./done/015-project-configuration.md)               | 2026-07-25 | Persists CLI settings with explicit per-value precedence.                       |
| [016 Codebase consolidation](./done/016-codebase-consolidation.md)             | 2026-07-16 | Hardened analysis, report, CLI, build, and package boundaries.                  |
| [017 Browser-owned presentation](./done/017-browser-owned-presentation.md)     | 2026-07-18 | Embeds raw analysis and derives presentation in the browser.                    |
| [018 LCOV coverage](./done/018-lcov-coverage.md)                               | 2026-07-18 | Imports LCOV and deterministically selects one coverage report.                 |
| [019 Monorepo coverage discovery](./done/019-monorepo-coverage-discovery.md)   | 2026-07-18 | Combines conventional coverage from project and package roots.                  |
| [021 Type-only dependencies](./done/021-type-only-dependencies.md)             | 2026-07-25 | Tracks, distinguishes, and filters explicitly type-only dependencies.           |
| [022 Coherent report navigation](./done/022-coherent-report-navigation.md)     | 2026-07-28 | Unifies search, selection, centering, disclosure, breadcrumbs, and history.     |
| [023 Diagnostic lens framework](./done/023-diagnostic-lens-framework.md)       | 2026-07-29 | Replaces checkbox-first setup with deterministic Overview and Structure lenses. |
| [024 Findings-first overview](./done/024-findings-first-overview.md)           | 2026-07-29 | Opens on explainable coverage, coupling, cycle, and workspace candidates.       |
| [025 Coverage lens](./done/025-coverage-lens.md)                               | 2026-07-29 | Explores file size and imported coverage through explicit filters and emphasis. |
| [026 Coupling lens](./done/026-coupling-lens.md)                               | 2026-07-29 | Reveals direct hubs, relationship direction, filtered cycles, and group focus.  |
| [027 Boundary lens](./done/027-boundary-lens.md)                               | 2026-07-29 | Aggregates directed workspace and directory dependencies with exact drill-down. |

## Workflow

1. Set one milestone to `In progress` here and in its task file.
2. Keep the milestone narrow. Split a large implementation step into checked sub-tasks in its file rather than expanding unrelated scope.
3. Add or update deterministic fixtures and tests with each behavior. Do not create a later testing phase.
4. Record newly discovered gaps immediately under the active milestone. Move deferred gaps to the appropriate future milestone instead of losing them.
5. Record exact verification commands and results before marking a milestone complete.
6. Mark the milestone `Complete` only when its outcome, required tests, documentation, and verification criteria are satisfied.
7. Move the completed milestone file into `done/` and add it to the dedicated table above.

## Testing rule

Every production slice ships with the test that proves it. Prefer end-to-end and integration coverage through real files and public seams. Use focused unit or property tests only for algorithmic behavior. Never defer examples and regression coverage merely because the implementation is still early.

A bug fix must add a fixture or focused regression test that reproduces the failure. Dogfooding Show Me on this repository supplements those fixtures; it does not replace them.

See the full [testing strategy](../architecture/testing.md).

## Performance rule

Correctness comes first, but milestones must preserve the analysis and measurement seams needed for later optimization. The final performance milestone profiles the complete product against the documented large-codebase workload rather than relying on speculative micro-optimizations.

See the full [performance guidance](../architecture/performance.md).

## Milestone file structure

Each milestone records:

- the user-visible outcome;
- implementation tasks;
- tests that must exist before completion;
- verification evidence;
- gaps and follow-up discoveries.

Keep completed checkboxes as durable history. Do not delete a discovered gap when it is deferred; link it to the milestone that owns the follow-up.
