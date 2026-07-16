# Implementation Tasks

This directory tracks milestones, implementation progress, verification evidence, and gaps discovered while building Show Me. It is the repository-local task tracker; GitHub issues are not required.

## Roadmap

| Milestone                                                             | Status      | Outcome                                                                  |
| --------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------ |
| [001 Foundation](./001-foundation.md)                                 | Complete    | Establish build boundaries, fixtures, and test infrastructure.           |
| [002 File discovery and LOC](./002-file-discovery-and-loc.md)         | Not started | Discover executable project files and count non-blank lines.             |
| [003 Static visualization](./003-static-visualization.md)             | Not started | Generate and interact with the initial self-contained graph report.      |
| [004 Static ESM imports](./004-static-esm-imports.md)                 | Not started | Add directed runtime file dependencies through Oxc.                      |
| [005 Coverage](./005-coverage.md)                                     | Not started | Discover or import Istanbul coverage and color project files.            |
| [006 CLOC line breakdown](./006-cloc-line-breakdown.md)               | Not started | Separate code, comment, and blank lines and control node sizing.         |
| [007 External packages](./007-external-packages.md)                   | Not started | Add optional synthetic npm package nodes without analyzing dependencies. |
| [008 pnpm workspaces](./008-pnpm-workspaces.md)                       | Not started | Analyze and filter all packages in one pnpm workspace.                   |
| [009 Import compatibility](./009-import-compatibility.md)             | Not started | Add CommonJS, dynamic imports, and broader resolution behavior.          |
| [010 Visualization and UX](./010-visualization-and-ux.md)             | Not started | Improve navigation, focus, clustering, and accessibility.                |
| [011 Large-codebase performance](./011-large-codebase-performance.md) | Not started | Profile and optimize analysis and rendering for large projects.          |

## Workflow

1. Set one milestone to `In progress` here and in its task file.
2. Keep the milestone narrow. Split a large implementation step into checked sub-tasks in its file rather than expanding unrelated scope.
3. Add or update deterministic fixtures and tests with each behavior. Do not create a later testing phase.
4. Record newly discovered gaps immediately under the active milestone. Move deferred gaps to the appropriate future milestone instead of losing them.
5. Record exact verification commands and results before marking a milestone complete.
6. Mark the milestone `Complete` only when its outcome, required tests, documentation, and verification criteria are satisfied.

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
