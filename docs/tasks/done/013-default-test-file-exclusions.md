# 013 Default Test-File Exclusions

## Status

Complete.

## Outcome

Default analysis omits conventional JavaScript and TypeScript test files so production-code structure is not obscured by test-suite noise.

## Tasks

- [x] Exclude supported files whose basename contains `.test.` or `.spec.` case-insensitively.
- [x] Match anywhere in the basename without matching directory names or bare `test.ts` and `spec.ts` names.
- [x] Filter excluded files before source reading, parsing, line metrics, dependency analysis, coverage matching, and report construction.
- [x] Keep the dependency graph induced by discovered project files: dependencies on an existing excluded target create neither an edge nor an unresolved diagnostic.
- [x] Preserve declaration-file, unsupported-asset, `.gitignore`, and standard-directory exclusions.
- [x] Document the default behavior and defer configurable file selection to dedicated milestones.

## Required tests

- [x] A deterministic fixture covers `.test.` and `.spec.` across `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, and `.cts`.
- [x] Fixture coverage proves case-insensitive matching, markers within a longer basename, near misses, marker-like directories, and ordinary test-directory names.
- [x] Analysis tests prove invalid excluded source is not parsed and excluded sources and targets contribute no metrics, diagnostics, or dependency edges.
- [x] Coverage and report tests prove excluded entries do not reappear as covered files, nodes, counts, or relationships.
- [x] Existing discovery and full regression suites remain green.

## Verification evidence

- `pnpm format:fix`: 153 files formatted successfully.
- `pnpm lint`: passed with zero warnings.
- `pnpm typecheck`: passed.
- Focused Vitest discovery, analysis, coverage, and report suite: 4 files and 35 tests passed.
- `pnpm test`: 12 files and 76 tests passed.
- `pnpm build`: Node and browser builds passed; the browser bundle is 357.3 kB.
- `pnpm test:browser`: all 3 Playwright tests passed in Chromium.

## Discovered gaps

- [Milestone 014](../014-cli-file-selection.md) owns one-invocation CLI overrides for the default test exclusion and additional ignore patterns.
- [Milestone 015](../015-project-configuration.md) owns persistent project configuration after an ADR defines its contract.
