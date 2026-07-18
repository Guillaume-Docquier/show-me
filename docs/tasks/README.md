# Implementation Tasks

This directory tracks milestones, implementation progress, verification evidence, and gaps discovered while building Show Me. It is the repository-local task tracker; GitHub issues are not required.

## Roadmap

| Milestone                                                                       | Status      | Outcome                                                                |
| ------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| [009 Import compatibility](./009-import-compatibility.md)                       | In progress | Add CommonJS, dynamic imports, and broader resolution behavior.        |
| [010 Visualization and UX](./010-visualization-and-ux.md)                       | Not started | Improve report layout, graph focus, and files-tree navigation.         |
| [011 Large-codebase performance](./011-large-codebase-performance.md)           | Not started | Profile and optimize analysis and rendering for large projects.        |
| [014 CLI file selection](./014-cli-file-selection.md)                           | Not started | Include default-excluded tests and add one-invocation ignore patterns. |
| [015 Project configuration](./015-project-configuration.md)                     | Not started | Persist file-selection settings with explicit CLI precedence.          |
| [020 Configurable coverage locations](./020-configurable-coverage-locations.md) | Not started | Configure per-package locations and multiple explicit reports.         |

## Done

Completed milestone files are retained under [`done/`](./done/) as implementation history and verification evidence.

| Milestone                                                                      | Completed  | Outcome                                                             |
| ------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------- |
| [001 Foundation](./done/001-foundation.md)                                     | 2026-07-15 | Established build boundaries, fixtures, and test infrastructure.    |
| [002 File discovery and LOC](./done/002-file-discovery-and-loc.md)             | 2026-07-15 | Added executable-file discovery and deterministic non-blank LOC.    |
| [003 Static visualization](./done/003-static-visualization.md)                 | 2026-07-16 | Added the self-contained interactive graph and hardened its layout. |
| [004 Static ESM imports](./done/004-static-esm-imports.md)                     | 2026-07-16 | Added static runtime ESM dependencies and relationship details.     |
| [005 Coverage](./done/005-coverage.md)                                         | 2026-07-16 | Added optional Istanbul line coverage and coverage-colored nodes.   |
| [006 CLOC line breakdown](./done/006-cloc-line-breakdown.md)                   | 2026-07-16 | Added exclusive line categories and interactive node sizing.        |
| [007 External packages](./done/007-external-packages.md)                       | 2026-07-16 | Added optional package nodes without analyzing installed code.      |
| [008 pnpm workspaces](./done/008-pnpm-workspaces.md)                           | 2026-07-18 | Analyzes and filters all packages in one pnpm workspace.            |
| [012 GitHub Pages report](./done/012-github-pages-report.md)                   | 2026-07-16 | Publishes a validated live visualization of the repository.         |
| [013 Default test-file exclusions](./done/013-default-test-file-exclusions.md) | 2026-07-16 | Removes conventionally named test files from default analysis.      |
| [016 Codebase consolidation](./done/016-codebase-consolidation.md)             | 2026-07-16 | Hardened analysis, report, CLI, build, and package boundaries.      |
| [017 Browser-owned presentation](./done/017-browser-owned-presentation.md)     | 2026-07-18 | Embeds raw analysis and derives presentation in the browser.        |
| [018 LCOV coverage](./done/018-lcov-coverage.md)                               | 2026-07-18 | Imports LCOV and deterministically selects one coverage report.     |
| [019 Monorepo coverage discovery](./done/019-monorepo-coverage-discovery.md)   | 2026-07-18 | Combines conventional coverage from project and package roots.      |

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
