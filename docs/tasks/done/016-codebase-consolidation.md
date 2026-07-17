# 016 Codebase Consolidation

## Status

Complete.

## Outcome

The implemented analysis, report, CLI, build, and package pipelines have cohesive ownership, deterministic contracts, and regression coverage suitable for the next file-selection and configuration milestones without changing default user behavior.

## Tasks

- [x] Make project-file paths canonical, in-root identities with deterministic ordering.
- [x] Establish typed file-selection input while separating overrideable test conventions from permanent discovery exclusions.
- [x] Centralize JavaScript and TypeScript file support and contain Oxc parser and resolver concerns behind focused adapters.
- [x] Align the language module with ADR 001 by producing file analyses, metrics, dependencies, and diagnostics.
- [x] Preserve the distinction between unresolved requests and resolved files outside the selected analysis.
- [x] Keep structured non-blank line metrics through the presentation and renderer boundaries.
- [x] Define the presentation schema version once and remove unused or independently reconstructed report data.
- [x] Source CLI version information from package metadata and strengthen argument and write-failure handling.
- [x] Harden inline HTML serialization and real built-report browser coverage.
- [x] Clean stale build output before aggregate builds and formally expose only the package CLI.
- [x] Remove inherited configuration and stale current-state documentation.

## Required tests

- [x] Path tests cover separator and dot normalization, absolute paths, project-root paths, escapes, and deterministic mixed-case/non-ASCII ordering.
- [x] Discovery tests cover unchanged defaults, test-file restoration, and non-overridable `.gitignore`, standard-directory, declaration-file, and unsupported-file exclusions.
- [x] Language tests cover hand-written file metrics, parser diagnostics, resolver initialization failures, excluded resolved targets, and deterministic dependencies and diagnostics.
- [x] Report tests cover structured line metrics, schema versioning, relationship data, hostile paths and project names, Unicode, and script-closing input.
- [x] CLI tests cover help, version, missing and duplicate option values, positional argument limits, report-writing failures, and built-bin behavior.
- [x] A real-browser empty-project test exercises the built CLI and browser bundle without page errors.
- [x] Packaging verification proves stale output is removed and the packed artifact exposes the CLI without a programmatic package surface.

## Verification evidence

- `pnpm checks`: passed sequentially, including formatting 159 files, zero-warning lint, typechecking, 12 Vitest files with 111 tests, a clean node and browser build, and 4 Playwright tests.
- The browser build produced `dist/report/browser.js` at 357.3 kB.
- An aggregate build removed a seeded `dist/stale.js` file before producing fresh output.
- `node dist/cli/entry.cli.js --version`: printed `0.0.1` from the built CLI.
- A package deep import failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`, confirming there is no programmatic package surface.
- `pnpm pack --dry-run`: passed after its clean prepack build and reported the prospective `guillaume-docquier-show-me-0.0.1.tgz` payload containing the built CLI and report artifacts plus package metadata, without source, test, or documentation directories.

## Discovered gaps

- Milestone 014 still owns user-facing CLI file-selection options and additional ignore-pattern semantics.
- Milestone 015 still owns configuration-file discovery, schema, parsing, and precedence.
- Milestone 010 owns the product decision for surfacing non-fatal analysis diagnostics.
- Milestone 011 owns measurement of the current all-source-text memory lifetime before any concurrency or streaming change.
