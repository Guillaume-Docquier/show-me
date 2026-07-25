# 015 Project Configuration

## Status

Complete.

## Outcome

A project can persist Show Me output, coverage, and file-selection settings in a commented `show-me.config.json` file at the analyzed project root, with CLI options taking precedence independently per value.

## Dependencies

- Milestone 016 establishes the typed file-selection input and built-in defaults. Milestone 014 establishes the CLI override and additional-pattern semantics this milestone reuses.

## Tasks

- [x] Automatically discover only `show-me.config.json` at the root of the directory being analyzed.
- [x] Parse the file as JSONC so project configuration can contain comments, then validate and parse the resulting value with Zod.
- [x] Keep the accepted configuration surface aligned with persistable CLI options: `output` and `coverage` paths plus the complete repeatable CLI `--exclude` value represented as an `exclude` array:

  ```jsonc
  {
    "output": "reports/dependencies.html",
    "coverage": "coverage/lcov.info",
    "exclude": ["*.test.*", "*.spec.*", "*.generated.*"],
  }
  ```

- [x] Parse configuration at the project boundary into the same typed file-selection input used by the CLI.
- [x] Do not introduce configuration schema versioning yet; there are no existing users or configuration migrations to support.
- [x] Resolve configuration paths and patterns relative to the directory containing `show-me.config.json`, which is the analyzed project root.
- [x] Implement precedence per configuration value as built-in defaults, then project configuration, then CLI options. An absent value falls back to the next lower-precedence layer; a defined value fully replaces the lower-precedence value and is never additive.
- [x] Reuse the discovery-owned matcher without duplicating glob or test-file semantics.
- [x] Keep `.gitignore`, standard excluded directories, declaration files, and unsupported language rules non-overridable unless a later explicit decision changes that boundary.
- [x] Treat an absent automatically discovered configuration file as normal built-in defaults.
- [x] Return useful typed failures for unreadable files, malformed JSONC, and values rejected by the Zod schema.
- [x] Record the durable configuration contract and dependency choices in an ADR if they warrant an architectural decision; the ADR supports the implementation rather than gating or replacing it.
- [x] Document the implemented configuration contract and examples.

## Required tests

- [x] Fixture projects cover absent, valid JSONC with comments, malformed JSONC, and values rejected by the Zod schema.
- [x] Tests prove configuration is discovered from the analyzed project root and its paths and patterns resolve from that root rather than the invocation directory.
- [x] Precedence tests cover absent values, built-in defaults, defined configuration values, CLI overrides, `.gitignore`, and standard exclusions.
- [x] Precedence tests prove a defined `exclude` array fully replaces the lower-precedence array, including when it is explicitly empty.
- [x] Equivalence tests prove the same selection supplied through CLI and configuration produces identical analysis.
- [x] CLI-to-report tests prove persisted selection affects files, metrics, coverage, and relationships consistently.
- [x] CLI-to-report tests prove configured output and coverage paths resolve from the project root and CLI paths override them from the invocation directory.

## Verification evidence

- Focused configuration and CLI Vitest suite: 4 files and 64 tests passed.
- `pnpm checks`: formatting and zero-warning lint passed, type checking passed, all 26 Vitest files and 256 tests passed, both builds passed, all 14 Chromium scenarios passed, the performance sentinel passed, and the built CLI generated the dogfood report.

## Discovered gaps

None yet.
