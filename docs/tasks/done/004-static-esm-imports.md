# 004 Static ESM Imports

## Status

Complete.

## Outcome

The report shows directed runtime dependencies between project files for static ESM imports and re-exports resolved through one project configuration.

## Tasks

- [x] Integrate `oxc-parser` and `oxc-resolver` inside the JavaScript/TypeScript language module.
- [x] Analyze static imports, side-effect imports, named runtime re-exports, and wildcard runtime re-exports.
- [x] Exclude explicitly type-only imports and re-exports.
- [x] Keep mixed declarations when at least one runtime specifier exists.
- [x] Resolve project-file targets through one root `tsconfig.json` or `jsconfig.json`.
- [x] Ignore resolved non-code assets and external npm packages in this milestone.
- [x] Produce diagnostics for unresolved executable-code dependencies without fabricating edges.
- [x] Derive dependency and consumer counts from unique directed edges.
- [x] Display dependency and consumer project files in the selected-node side panel.

## Required tests

- [x] Fixtures cover every supported import and re-export form.
- [x] Fixtures distinguish pure type-only, mixed type/runtime, and ordinary imports used only as types.
- [x] Resolution fixtures cover relative paths, extension substitution, index files, and configured path aliases.
- [x] Tests cover duplicate declarations resolving to one dependency edge, cycles, self-imports, and unresolved executable targets.
- [x] Tests prove Oxc-specific values cannot escape the language-module boundary.
- [x] A CLI-to-report integration test proves expected directed edges and side-panel counts.

## Verification evidence

- `pnpm exec vitest run --silent=true src/languages/javascript-typescript/analyze-javascript-typescript.test.ts src/analysis/analyze-project.test.ts src/report/report-presentation.test.ts src/cli/run-cli.test.ts` — passed 4 files and 15 tests.
- `pnpm checks` — passed formatting, linting, type checking, 11 Vitest files with 32 tests, both builds, and 2 Playwright tests.

## Discovered gaps

None yet.
