# 001 Foundation

## Status

Complete.

## Outcome

The repository can build and test the Node analysis code and browser report code through explicit architectural seams. Deterministic example projects exist before substantive analysis behavior is implemented.

## Tasks

- [x] Establish source directories for analysis, language adapters, coverage, report building, browser rendering, and the CLI.
- [x] Define the versioned internal analysis types without exposing a public JSON output.
- [x] Add the scoped package name and `show-me` executable entry.
- [x] Choose and configure the minimum build tooling needed for the Node CLI and embedded browser bundle.
- [x] Add `@guillaume-docquier/tools-ts` and establish `Result` error seams. `Timer` owns successful CLI timing in milestone 003.
- [x] Establish a fixture-project directory outside the root TypeScript compilation.
- [x] Add one smallest-possible JavaScript fixture and one TypeScript fixture.
- [x] Establish temporary-directory helpers for filesystem and CLI tests without module mocks.
- [x] Document any new vocabulary or durable build decision before completing the milestone.

## Required tests

- [x] A focused test proves fixture paths and expected data are stable across the test process working directory.
- [x] A focused test proves project-relative path normalization uses forward slashes.
- [x] A minimal integration test exercises the analysis application seam with a real fixture.
- [x] A packaged-CLI smoke test strategy is established, with the built entry exercised now and full report integration owned by milestone 003.

## Verification evidence

- `oxfmt .`: 53 files formatted successfully.
- `oxlint --max-warnings 0`: passed.
- `tsc --noEmit`: passed.
- `vitest run --silent`: 5 files and 10 tests passed.
- `pnpm build`: Node CLI and browser bundle built successfully under the pinned Node 26 runtime.
- `node dist/cli/entry.cli.js --help`: built executable printed CLI help and exited successfully.

## Discovered gaps

None yet.
