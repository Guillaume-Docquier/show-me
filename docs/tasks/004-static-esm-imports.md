# 004 Static ESM Imports

## Status

Not started.

## Outcome

The report shows directed runtime dependencies between project files for static ESM imports and re-exports resolved through one project configuration.

## Tasks

- [ ] Integrate `oxc-parser` and `oxc-resolver` inside the JavaScript/TypeScript language module.
- [ ] Analyze static imports, side-effect imports, named runtime re-exports, and wildcard runtime re-exports.
- [ ] Exclude explicitly type-only imports and re-exports.
- [ ] Keep mixed declarations when at least one runtime specifier exists.
- [ ] Resolve project-file targets through one root `tsconfig.json` or `jsconfig.json`.
- [ ] Ignore resolved non-code assets and external npm packages in this milestone.
- [ ] Produce diagnostics for unresolved executable-code dependencies without fabricating edges.
- [ ] Derive import and consumer counts from unique directed edges.
- [ ] Display imported and consumer project files in the selected-node side panel.

## Required tests

- [ ] Fixtures cover every supported import and re-export form.
- [ ] Fixtures distinguish pure type-only, mixed type/runtime, and ordinary imports used only as types.
- [ ] Resolution fixtures cover relative paths, extension substitution, index files, and configured path aliases.
- [ ] Tests cover duplicate declarations resolving to one dependency edge, cycles, self-imports, and unresolved executable targets.
- [ ] Tests prove Oxc-specific values cannot escape the language-module boundary.
- [ ] A CLI-to-report integration test proves expected directed edges and side-panel counts.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

None yet.
