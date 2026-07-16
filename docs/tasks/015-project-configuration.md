# 015 Project Configuration

## Status

Not started.

## Outcome

A project can persist Show Me file-selection settings in one typed configuration file, with CLI options taking precedence through the same discovery matcher.

## Dependencies

- Milestone 014 establishes reusable file-selection inputs, matching semantics, and CLI behavior.

## Tasks

- [ ] Write and accept an ADR defining the configuration filename, format, discovery location, schema evolution, path base, precedence, and failure behavior before implementation.
- [ ] Parse configuration at the project boundary into the same typed file-selection input used by the CLI.
- [ ] Define and implement precedence as CLI options over project configuration over built-in defaults.
- [ ] Reuse the discovery-owned matcher without duplicating glob or test-file semantics.
- [ ] Keep `.gitignore`, standard excluded directories, declaration files, and unsupported language rules non-overridable unless a later explicit decision changes that boundary.
- [ ] Treat an absent automatically discovered configuration file as normal built-in defaults.
- [ ] Return useful typed failures for unreadable, invalid, or unsupported discovered configuration, subject to the accepted ADR's final contract.
- [ ] Document the configuration contract and examples after the ADR is accepted.

## Required tests

- [ ] Fixture projects cover absent, valid, malformed, and unsupported-version configuration.
- [ ] Tests prove configuration paths resolve from the analyzed project root rather than the invocation directory.
- [ ] Precedence tests cover built-in defaults, configuration, CLI overrides, `.gitignore`, and standard exclusions.
- [ ] Equivalence tests prove the same selection supplied through CLI and configuration produces identical analysis.
- [ ] CLI-to-report tests prove persisted selection affects files, metrics, coverage, and relationships consistently.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

None yet.
