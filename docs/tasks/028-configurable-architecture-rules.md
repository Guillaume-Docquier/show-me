# 028 Configurable Architecture Rules

## Status

Not started.

## Outcome

Repositories can declare named architecture modules and allowed directed dependencies, and the report identifies exact rule-backed violations without confusing ordinary cross-boundary relationships with defects.

## Dependencies

- [Milestone 027](./027-boundary-lens.md) establishes factual boundary aggregation and drill-down.
- [Milestone 015](./done/015-project-configuration.md) and [ADR 007](../adr/007-use-jsonc-and-zod-for-project-configuration.md) establish strict root JSONC configuration and per-value translation.
- [ADR 001](../adr/001-separate-analysis-from-rendering.md) establishes the versioned language-neutral analysis boundary.
- [Milestone 024](./024-findings-first-overview.md) establishes explainable findings.

This milestone changes configuration and authoritative analysis. Write and accept a new ADR before implementation. If the accepted design differs from the baseline contract below, update this task before writing production code.

## Current behavior and problem

Show Me can identify cross-workspace and cross-directory relationships, but it cannot know whether those relationships are intended. Repository structure is evidence of a boundary, not an allowlist.

Architecture rules must be explicit, directed, deterministic, and language-neutral. Raw project configuration must not be embedded in the report.

## Baseline configuration contract

Extend `show-me.config.json` with an optional `architecture` object:

```jsonc
{
  "architecture": {
    "modules": [
      { "name": "frontend", "include": ["frontend/**"] },
      { "name": "backend", "include": ["backend/**"] },
      { "name": "shared", "include": ["packages/shared/**"] },
    ],
    "allowedDependencies": [
      { "from": "frontend", "to": "shared" },
      { "from": "backend", "to": "shared", "kinds": ["runtime"] },
    ],
  },
}
```

### Module rules

- Module names are unique, non-empty user-facing identifiers.
- `include` contains one or more case-insensitive, project-relative path patterns.
- Reuse the repository's documented path-pattern behavior where compatible; do not invent operating-system-specific matching.
- A project file may match at most one configured module. Overlap is a configuration error that identifies the file and matching modules.
- A file that matches no module belongs to the visible `Unassigned` group.
- Empty modules are allowed but reported as configuration diagnostics so stale rules are visible.

### Dependency rules

- Dependencies inside one configured module are allowed.
- A cross-module project-file dependency is allowed only when an `allowedDependencies` entry matches its directed `from`, `to`, and relationship kind.
- `kinds` is optional and defaults to both `runtime` and `type-only`.
- Unknown module names, empty kind arrays, and duplicate rules are configuration errors.
- Dependencies involving `Unassigned` are reported separately but are not violations until the project assigns those files.
- External-package dependencies are outside this rule system.
- Repeated source-target relationships continue to follow the existing runtime-precedence contract.

## Analysis contract

- Configuration loading translates patterns and rules into typed application inputs.
- Node-side analysis assigns project files to configured modules and evaluates project-file dependency rules.
- Bump the internal analysis schema deliberately.
- Embed normalized module identities, file membership, rules needed for explanation, violations, and unassigned-file diagnostics in the language-neutral analysis.
- Do not embed raw JSONC, source patterns that are not needed by the report, or configuration-library objects.
- Browser presentation derives module labels, counts, finding rows, graph identity, and interaction state from those facts.

## UX contract

- Add configured modules to the `Boundaries` lens without removing factual workspace and directory views.
- Mark only rule-backed relationships as `Violation`.
- Every violation explains source file, target file, source module, target module, dependency kind, and the missing allowed direction.
- Add `Architecture violations` to `Overview` findings when rules exist.
- Display unassigned files and empty modules as configuration gaps, not dependency violations.
- Projects without `architecture` configuration keep all existing behavior and never display a violation count of zero as if rules had been evaluated.
- Selecting a violation focuses its exact source, target, and edge.
- Filters for runtime/type-only and workspace scope update the visible violation list without changing the authoritative analysis.

## Implementation tasks

- [ ] Write a new ADR covering schema, path matching, module assignment, default-deny cross-module rules, analysis ownership, and report presentation.
- [ ] Extend the strict Zod project-configuration schema and typed CLI application input.
- [ ] Add deterministic module assignment with overlap, empty-module, and unassigned-file diagnostics.
- [ ] Extend the versioned language-neutral analysis with normalized architecture facts and violations.
- [ ] Evaluate directed runtime and type-only project-file dependencies against allowed rules.
- [ ] Extend browser presentation, findings, boundary aggregation, inspector details, and graph focus for modules and violations.
- [ ] Add configuration failures that identify the exact field, module, pattern, and conflicting file or rule.
- [ ] Preserve behavior for projects without architecture configuration.
- [ ] Keep external-package relationships outside architecture-rule evaluation.
- [ ] Update configuration examples and all user-visible documentation in the same milestone.

## Required tests

- [ ] Configuration tests cover valid modules, comments, trailing commas, unknown keys, duplicate names, unknown rule references, invalid kinds, and overlapping patterns.
- [ ] Analysis fixtures cover allowed, forbidden, internal, runtime, type-only, unassigned, empty-module, and repeated relationships.
- [ ] Tests prove rule direction matters and omitted `kinds` means runtime plus type-only.
- [ ] Tests prove external-package dependencies are ignored by architecture rules.
- [ ] Report-builder tests prove normalized architecture facts are embedded while raw configuration is not.
- [ ] Browser coverage proves module aggregation, violation findings, violation focus, explanation text, filters, and unassigned diagnostics.
- [ ] Browser coverage proves a report without configured architecture rules does not imply that zero violations were evaluated.
- [ ] CLI and end-to-end tests prove configuration paths remain project-relative and cross-platform.

## Documentation

- [ ] Add the accepted ADR to the ADR index.
- [ ] Add configured architecture modules and violations to the glossary.
- [ ] Update the README configuration table with type, default, precedence, complete examples, and failure behavior.
- [ ] Update the README report-capabilities and limitations sections.
- [ ] Record the analysis schema version change and migration implications in architecture documentation.

## Verification evidence

Record commands and results here before completion.

## Non-goals

- Inferring intended architecture without configuration.
- Automatically rewriting imports.
- Governing dependencies on external packages.
- A general policy language, regular-expression engine, or executable configuration file.

## Discovered gaps

None yet.
