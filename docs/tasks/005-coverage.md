# 005 Coverage

## Status

Not started.

## Outcome

The CLI optionally enriches project files from Istanbul `coverage-final.json`, and the report colors nodes by line coverage without confusing missing data with zero coverage.

## Tasks

- [ ] Import and parse Istanbul `coverage-final.json` through a coverage adapter.
- [ ] Normalize coverage file paths against the analyzed project root.
- [ ] Auto-discover `<project-root>/coverage/coverage-final.json` when `--coverage` is absent.
- [ ] Continue successfully with an informational message when automatic coverage is absent.
- [ ] Fail with a typed useful error when an explicit coverage path is missing, unreadable, or invalid.
- [ ] Map 0% line coverage to red, 100% to green, and missing coverage to neutral gray.
- [ ] Show numeric line coverage in the tooltip and selected-node side panel.

## Required tests

- [ ] Coverage fixtures contain explicit covered, partially covered, uncovered, and absent project files.
- [ ] Tests cover absolute and relative coverage paths and Windows and POSIX separators.
- [ ] CLI tests distinguish optional auto-discovery from strict explicit coverage behavior.
- [ ] Focused tests prove color endpoints and interpolation.
- [ ] A report integration test proves missing coverage is neutral rather than zero.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

None yet.
