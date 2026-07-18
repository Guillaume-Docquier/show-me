# 019 Monorepo Coverage Discovery

## Status

Complete.

## Outcome

Automatic coverage discovery enriches one repository analysis from standard coverage reports at the project root and at every relevant package root, without requiring package-manager-specific workspace configuration.

## Dependencies

- [Milestone 018](./018-lcov-coverage.md) established the shared Istanbul/LCOV contract and deterministic JSON-before-LCOV selection for one coverage root.

## Deterministic selection and merging

A coverage root is either the project root or a directory below it that contains `package.json` and owns at least one analyzed project file. Package roots are discovered from analyzed-file ancestors, so ignored packages and packages with no matching project files cannot add irrelevant coverage.

For the project root first and then package roots in deterministic project-relative order:

1. Check `<coverage-root>/coverage/coverage-final.json`.
2. If it does not exist, check `<coverage-root>/coverage/lcov.info`.
3. Select at most one report at that root.

All selected reports enrich the same analysis. Relative source paths are resolved from the root that owns their report, while absolute source paths remain matched against the analyzed project root. Repeated source lines across reports retain the maximum hit count. An unreadable or invalid selected report remains fatal and never falls back to the other format at that root.

## Tasks

- [x] Discover relevant package roots without coupling coverage import to one package manager.
- [x] Preserve project-root coverage discovery.
- [x] Apply JSON-before-LCOV selection independently at each project or package root.
- [x] Resolve relative coverage source paths from the root that owns the selected report.
- [x] Merge all selected reports through the existing maximum-hit line-coverage contract.
- [x] Preserve strict selected-report failures and informational absence.
- [x] Keep explicit `--coverage` as one content-recognized report.
- [x] Document automatic monorepo discovery and its current conventional `coverage/` limitation.
- [x] Add a future milestone for configurable coverage locations and multiple explicit reports.

## Required tests

- [x] A generic monorepo fixture or real-filesystem setup contains root, frontend, and backend project files with package manifests.
- [x] Root and package reports enrich the same analysis.
- [x] Relative package-report paths resolve from their package roots.
- [x] Istanbul and LCOV selection remains independent per root.
- [x] Repeated file/line coverage across root and package reports keeps maximum hits.
- [x] A malformed selected package report fails instead of falling back or being skipped.
- [x] A nested coverage directory without a relevant package manifest is ignored.
- [x] CLI-to-report coverage proves package-local reports reach embedded analysis.
- [x] Formatting, linting, type checking, Node tests, builds, browser tests, and dogfood generation pass.

## Verification evidence

- `& .\node_modules\.bin\vitest.ps1 run --silent=true src/coverage/import-coverage.test.ts src/cli/run-cli.test.ts` — passed 2 files and 51 tests.
- `pnpm checks` — formatting and linting passed with zero warnings, type checking passed, all 16 Vitest files and 193 tests passed, both Node and browser builds passed, all 6 Playwright scenarios passed, and the built CLI generated the repository report.
- The built CLI generated a real `text-based-browser-game-1` monorepo report from `backend/coverage/lcov.info`; embedded analysis contained package-relative backend files with covered, uncovered, and partial line-coverage values.

## Discovered gaps

- Per-package coverage directories, filenames, and multiple explicit coverage inputs remain [milestone 020](../020-configurable-coverage-locations.md).
