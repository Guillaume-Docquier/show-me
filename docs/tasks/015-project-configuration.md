# 015 Project Configuration

## Status

Not started.

## Outcome

A project can persist Show Me file-selection settings in a commented `show-me.config.json` file at the analyzed project root, with CLI options taking precedence through the same discovery matcher.

## Dependencies

- Milestone 016 establishes the typed file-selection input and built-in defaults. Milestone 014 establishes the CLI override and additional-pattern semantics this milestone reuses.

## Tasks

- [ ] Automatically discover only `show-me.config.json` at the root of the directory being analyzed.
- [ ] Parse the file as JSONC so project configuration can contain comments, then validate and parse the resulting value with Zod.
- [ ] Keep the accepted configuration surface aligned with persistable CLI options. This milestone initially supports only the repeatable CLI `--exclude` option, represented as an `exclude` array:

  ```jsonc
  {
    // Replace the built-in test and spec exclusions.
    "exclude": ["*.test.*", "*.spec.*", "*.generated.*"],
  }
  ```

- [ ] Parse configuration at the project boundary into the same typed file-selection input used by the CLI.
- [ ] Do not introduce configuration schema versioning yet; there are no existing users or configuration migrations to support.
- [ ] Resolve configuration paths and patterns relative to the directory containing `show-me.config.json`, which is the analyzed project root.
- [ ] Implement precedence per configuration value as built-in defaults, then project configuration, then CLI options. An absent value falls back to the next lower-precedence layer; a defined value fully replaces the lower-precedence value and is never additive.
- [ ] Reuse the discovery-owned matcher without duplicating glob or test-file semantics.
- [ ] Keep `.gitignore`, standard excluded directories, declaration files, and unsupported language rules non-overridable unless a later explicit decision changes that boundary.
- [ ] Treat an absent automatically discovered configuration file as normal built-in defaults.
- [ ] Return useful typed failures for unreadable files, malformed JSONC, and values rejected by the Zod schema.
- [ ] Record the durable configuration contract and dependency choices in an ADR if they warrant an architectural decision; the ADR supports the implementation rather than gating or replacing it.
- [ ] Document the implemented configuration contract and examples.

## Required tests

- [ ] Fixture projects cover absent, valid JSONC with comments, malformed JSONC, and values rejected by the Zod schema.
- [ ] Tests prove configuration is discovered from the analyzed project root and its paths and patterns resolve from that root rather than the invocation directory.
- [ ] Precedence tests cover absent values, built-in defaults, defined configuration values, CLI overrides, `.gitignore`, and standard exclusions.
- [ ] Precedence tests prove a defined `exclude` array fully replaces the lower-precedence array, including when it is explicitly empty.
- [ ] Equivalence tests prove the same selection supplied through CLI and configuration produces identical analysis.
- [ ] CLI-to-report tests prove persisted selection affects files, metrics, coverage, and relationships consistently.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

None yet.
