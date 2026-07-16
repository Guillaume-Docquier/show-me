# 001 Foundation

## Status

Not started.

## Outcome

The repository can build and test the Node analysis code and browser report code through explicit architectural seams. Deterministic example projects exist before substantive analysis behavior is implemented.

## Tasks

- [ ] Establish source directories for analysis, language adapters, coverage, report building, browser rendering, and the CLI.
- [ ] Define the versioned internal analysis types without exposing a public JSON output.
- [ ] Add the scoped package name and `show-me` executable entry.
- [ ] Choose and configure the minimum build tooling needed for the Node CLI and embedded browser bundle.
- [ ] Add `@guillaume-docquier/tools-ts` and use its `Result` and `Timer` abstractions at the intended seams.
- [ ] Establish a fixture-project directory outside the root TypeScript compilation.
- [ ] Add one smallest-possible JavaScript fixture and one TypeScript fixture.
- [ ] Establish temporary-directory helpers for filesystem and CLI tests without module mocks.
- [ ] Document any new vocabulary or durable build decision before completing the milestone.

## Required tests

- [ ] A focused test proves fixture paths and expected data are stable across the test process working directory.
- [ ] A focused test proves project-relative path normalization uses forward slashes.
- [ ] A minimal integration test exercises the analysis application seam with a real fixture.
- [ ] A packaged-CLI smoke test strategy is established, even if HTML generation is introduced in milestone 003.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

None yet.
