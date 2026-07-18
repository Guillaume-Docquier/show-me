# 020 Configurable Coverage Locations

## Status

Not started.

## Outcome

Repositories can configure different coverage-report locations for the project root and individual package roots, and can explicitly supply more than one report when conventional automatic discovery is insufficient.

## Dependencies

- [Milestone 015](./015-project-configuration.md) establishes persistent project configuration and CLI precedence.
- [Milestone 019](./done/019-monorepo-coverage-discovery.md) establishes automatic multi-root discovery and report merging.

## Tasks

- [ ] Define project configuration for default and package-specific coverage candidates without coupling it to one package manager.
- [ ] Support package-relative directories and filenames instead of requiring `coverage/coverage-final.json` or `coverage/lcov.info`.
- [ ] Define deterministic precedence between explicit CLI inputs, package-specific configuration, repository defaults, and conventional discovery.
- [ ] Support multiple explicit coverage inputs without overloading one `--coverage` path.
- [ ] Preserve content-based format recognition and strict selected-report failures.
- [ ] Define duplicate-report and duplicate-line behavior using the existing maximum-hit merge contract.
- [ ] Produce useful diagnostics that identify the package root and configured candidate involved in a failure.
- [ ] Document configuration and migration from the single-path CLI behavior.

## Required tests

- [ ] Configuration tests cover one shared convention and different frontend/backend locations.
- [ ] CLI tests cover multiple explicit reports and precedence over configured discovery.
- [ ] Tests cover missing optional candidates and unreadable or invalid selected candidates.
- [ ] Equivalent configured Istanbul and LCOV inputs enrich one analysis deterministically.
- [ ] End-to-end report coverage proves configured reports from multiple package roots are combined.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

None yet.
