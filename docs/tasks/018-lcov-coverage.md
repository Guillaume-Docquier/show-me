# 018 LCOV Coverage

## Status

Not started.

## Outcome

The CLI imports line coverage from either Istanbul `coverage-final.json` or LCOV `lcov.info` and enriches the same format-agnostic `ProjectAnalysis`. Automatic discovery checks the standard coverage directory deterministically, selects one report, and never merges or parses both formats.

## Dependencies

- [Milestone 005](./done/005-coverage.md) established coverage path normalization, optional automatic discovery, strict explicit-file failures, and the format-agnostic per-file coverage stored in analysis.
- [Milestone 017](./done/017-browser-owned-presentation.md) changed the embedded report boundary but not the coverage contract. Implementing this milestone after 017 avoids migrating report-facing coverage assertions twice.

## Deterministic selection

When `--coverage` is absent, check these exact candidates in order:

1. `<project-root>/coverage/coverage-final.json`
2. `<project-root>/coverage/lcov.info`

This precedence intentionally prefers the existing native-`JSON.parse` path when both files exist and avoids reading or parsing the second report. Selection depends only on the fixed candidate order, never filesystem enumeration order. Once a candidate is selected, an unreadable or invalid report is a typed fatal error; do not fall back to the other format and hide the selected report's failure.

For an explicit `--coverage` path, read the file once and select exactly one parser from its content: a first non-whitespace `{` selects Istanbul JSON, while a first non-empty LCOV `TN:` or `SF:` record selects LCOV. Any other prefix is an unsupported-format failure. A selected parser failure remains that format's invalid-report failure; do not invoke the other parser as a fallback.

## Tasks

- [ ] Define one internal parsed-coverage contract containing project-file paths and executable-line hit counts, independent of Istanbul and LCOV syntax.
- [ ] Refactor the current Istanbul importer so parsing, shared path normalization, line-percentage calculation, and immutable analysis enrichment have distinct ownership.
- [ ] Parse LCOV source-file records (`SF`), line hit records (`DA`), and record boundaries (`end_of_record`) into the shared coverage contract.
- [ ] Define deterministic behavior for repeated source records and repeated line entries; preserve the existing maximum-hit behavior for duplicate executable lines.
- [ ] Ignore LCOV function and branch data because `ProjectAnalysis` currently stores line coverage only.
- [ ] Preserve the current semantics that no executable lines means 100% coverage and a project file absent from the selected report has unknown coverage.
- [ ] Reuse the existing cross-platform coverage-path normalization and canonical project-file matching for both formats.
- [ ] Add automatic discovery with the fixed `coverage-final.json` then `lcov.info` precedence and stop after selecting one existing candidate.
- [ ] Support either format through an explicit `--coverage <path>` using deterministic format recognition; do not silently try both parsers after a parse failure.
- [ ] Generalize Istanbul-specific error types and CLI formatting into useful coverage read, unsupported-format, and invalid-report failures.
- [ ] Keep automatic absence of both candidates informational and preserve strict failures for missing explicit paths.
- [ ] Update CLI help, analysis architecture, static-report documentation, glossary, and coverage task history with both supported formats and the discovery rule.
- [ ] Keep the GitHub Pages workflow's explicit `coverage-final.json` input unchanged unless a measured reason justifies switching it.

## Required tests

- [ ] Hand-written LCOV fixtures cover covered, partially covered, uncovered, empty, and absent project files.
- [ ] LCOV parser tests cover multiple source records, repeated files and lines, optional DA checksums, zero-hit lines, ignored function and branch records, and malformed or incomplete records.
- [ ] Equivalent Istanbul and LCOV fixtures produce identical per-file coverage in `ProjectAnalysis`, including percentage truncation.
- [ ] Path tests cover absolute and relative LCOV `SF` paths, Windows and POSIX separators, case behavior, outside-root files, and files absent from project analysis.
- [ ] Automatic discovery tests cover JSON only, LCOV only, neither format, and both formats.
- [ ] When both formats exist, tests prove JSON is selected and LCOV is neither parsed nor merged.
- [ ] A valid LCOV file beside an invalid selected JSON file does not mask the JSON failure.
- [ ] Explicit coverage tests cover both formats, relative-path resolution from the invocation directory, missing files, unsupported formats, and malformed selected input.
- [ ] CLI-to-report coverage proves either format produces the same browser-visible coverage values and colors after milestone 017.
- [ ] Focused parser and CLI tests, type checking, linting, formatting, builds, and browser coverage pass.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

- Recursive coverage-report discovery and merging multiple reports are intentionally out of scope. Add them only for a concrete multi-report workflow with explicit precedence and merge semantics.
- Branch and function coverage require analysis-model and visualization decisions beyond this line-coverage milestone.
