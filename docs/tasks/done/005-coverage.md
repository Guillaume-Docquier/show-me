# 005 Coverage

## Status

Complete.

## Outcome

The CLI optionally enriches project files from Istanbul `coverage-final.json`, and the report colors nodes by line coverage without confusing missing data with zero coverage.

## Tasks

- [x] Import and parse Istanbul `coverage-final.json` through a coverage adapter.
- [x] Normalize coverage file paths against the analyzed project root.
- [x] Auto-discover `<project-root>/coverage/coverage-final.json` when `--coverage` is absent.
- [x] Continue successfully with an informational message when automatic coverage is absent.
- [x] Fail with a typed useful error when an explicit coverage path is missing, unreadable, or invalid.
- [x] Map 0% line coverage to red, 100% to green, and missing coverage to neutral gray.
- [x] Show numeric line coverage in the tooltip and selected-node side panel.

## Required tests

- [x] Coverage fixtures contain explicit covered, partially covered, uncovered, and absent project files.
- [x] Tests cover absolute and relative coverage paths and Windows and POSIX separators.
- [x] CLI tests distinguish optional auto-discovery from strict explicit coverage behavior.
- [x] Focused tests prove color endpoints and interpolation.
- [x] A report integration test proves missing coverage is neutral rather than zero.

## Verification evidence

- `pnpm exec vitest run --silent=true src/coverage/import-istanbul-coverage.test.ts src/cli/run-cli.test.ts src/report/report-presentation.test.ts src/report/build-html-report.test.ts`: 4 files and 46 tests passed.
- `pnpm checks`: formatting and lint passed with zero warnings, type checking passed, all 12 Vitest files and 66 tests passed, both Node and browser builds passed, and all 3 Playwright tests passed.

## Discovered gaps

- LCOV import and deterministic multi-format discovery were completed by [milestone 018](./018-lcov-coverage.md). That follow-up preserved this milestone's path normalization, percentage calculation, optional automatic absence, and strict explicit-file failure semantics while generalizing the importer beyond Istanbul.
