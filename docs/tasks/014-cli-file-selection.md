# 014 CLI File Selection

## Status

Not started.

## Outcome

One CLI invocation can restore conventionally named test files and apply additional project-relative ignore patterns while preserving non-overridable project-safety exclusions.

## Dependencies

- Milestone 013 establishes the default test-file exclusion and basename semantics this milestone makes configurable.

## Tasks

- [ ] Define CLI options that can include default-excluded test files and accept repeatable additional ignore patterns.
- [ ] Parse file-selection arguments into a typed application input and pass them explicitly from the CLI to analysis and discovery.
- [ ] Keep default behavior unchanged when no selection options are supplied.
- [ ] Define deterministic project-relative pattern semantics and useful argument errors.
- [ ] Ensure restoring test files overrides only the default `.test.` and `.spec.` rule.
- [ ] Ensure CLI selection cannot re-include files excluded by `.gitignore`, standard excluded directories, declaration-file rules, or unsupported language rules.
- [ ] Keep matching in one discovery-owned implementation that later configuration can reuse.
- [ ] Update CLI help and user-facing architecture documentation.
- [ ] Do not load or interpret a Show Me configuration file in this milestone.

## Required tests

- [ ] Parser tests cover defaults, repeated patterns, duplicate options, missing values, and invalid patterns.
- [ ] Filesystem integration tests cover default exclusion, restored test files, extra ignore patterns, and combined options.
- [ ] Precedence tests prove `.gitignore` and standard directory exclusions remain effective.
- [ ] CLI-to-report tests prove selection changes files, metrics, coverage, and relationships consistently.
- [ ] Existing default-exclusion fixture expectations remain unchanged without CLI overrides.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

- Persistent settings belong to [milestone 015](./015-project-configuration.md); this milestone must not introduce implicit config loading.
