# 014 CLI File Selection

## Status

Not started.

## Outcome

One CLI invocation can replace Show Me's built-in test and spec exclusions with repeatable project-relative exclusion patterns while preserving non-overridable project-safety exclusions.

## Dependencies

- Milestone 013 establishes the default test-file exclusion and basename semantics this milestone expresses as the built-in exclusion-pattern set.
- Milestone 016 establishes the typed file-selection input and proves that permanent discovery exclusions take precedence. This milestone exposes that seam through the CLI and adds project-relative exclusion patterns.

## Tasks

- [ ] Define one repeatable `--exclude <pattern>` CLI option; do not add a dedicated option for including test files.
- [ ] Keep the existing `.test.` and `.spec.` basename exclusions as the built-in pattern set when no `--exclude` option is supplied.
- [ ] When one or more `--exclude` options are supplied, use exactly those patterns instead of appending them to the built-in test and spec patterns.
- [ ] Require callers that want the built-in exclusions plus additional exclusions to restate the test and spec patterns alongside their additional patterns.
- [ ] Parse the effective exclusion patterns into a typed application input and pass them explicitly from the CLI to analysis and discovery.
- [ ] Define deterministic project-relative pattern semantics and useful argument errors.
- [ ] Express built-in and CLI-supplied exclusions through one discovery-owned matcher that later configuration can reuse.
- [ ] Ensure CLI exclusions can only remove otherwise eligible files and cannot re-include files.
- [ ] Always exclude paths ignored by project `.gitignore` files, independently of the effective `--exclude` patterns.
- [ ] Do not require eligible files to already be tracked by Git; an untracked file remains eligible when it is not ignored or otherwise excluded.
- [ ] Keep standard excluded directories, declaration-file rules, and unsupported language rules permanently effective.
- [ ] Update CLI help and user-facing architecture documentation.
- [ ] Do not load or interpret a Show Me configuration file in this milestone.

## Required tests

- [ ] Parser tests cover the built-in defaults, repeated patterns, replacement semantics, missing values, and invalid patterns.
- [ ] Filesystem integration tests cover the built-in exclusions, a custom pattern set that no longer excludes tests and specs, custom exclusions, and explicitly restated test and spec patterns combined with additional exclusions.
- [ ] Precedence tests prove `.gitignore` and standard directory exclusions remain effective with both built-in and CLI-supplied patterns.
- [ ] CLI-to-report tests prove selection changes files, metrics, coverage, and relationships consistently.
- [ ] Existing default-exclusion fixture expectations remain unchanged without CLI overrides.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

- Persistent settings belong to [milestone 015](./015-project-configuration.md); this milestone must not introduce implicit config loading.
