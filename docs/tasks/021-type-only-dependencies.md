# 021 Type-Only Dependencies

## Status

Not started.

## Outcome

The report tracks explicitly type-only JavaScript and TypeScript dependencies, displays their arrows distinctly from runtime, structure, and external-runtime edges, and lets users filter type-only relationships out without discarding them from analysis.

## Dependencies

- [Milestone 004](./done/004-static-esm-imports.md) establishes syntax-only ESM classification and the rule that mixed declarations are runtime dependencies.
- [Milestone 007](./done/007-external-packages.md) establishes external-package facts, styling, and visibility controls.
- [Milestone 017](./done/017-browser-owned-presentation.md) establishes immutable analysis facts and browser-owned presentation derivation.

## Tasks

- [ ] Retain explicitly type-only static ESM imports and re-exports as authoritative dependency facts instead of dropping them during JavaScript and TypeScript analysis.
- [ ] Keep classification syntax-only: do not type-check ordinary imports to infer whether TypeScript erases them.
- [ ] Resolve type-only requests through the same project-file, workspace-package, path-alias, and external-package precedence as runtime requests.
- [ ] Represent runtime and type-only dependency kinds at the language-neutral analysis boundary and update its versioned schema deliberately.
- [ ] Collapse every repeated source-target relationship to one edge, with runtime taking precedence whenever any declaration or specifier for that relationship is runtime.
- [ ] Derive type-only presentation edges and relationship details from the authoritative analysis without duplicating dependency state.
- [ ] Show type-only dependencies by default and add an independent report control that can hide their edges without mutating the embedded analysis.
- [ ] Compose type-only visibility with workspace-package filters and external-package visibility, including external packages referenced only by type-only dependencies.
- [ ] Render type-only arrows in a color distinct from project-file runtime arrows, external-package runtime arrows, and structure edges, and identify the new edge kind in the graph key.
- [ ] Amend the relevant analysis, static-report, glossary, and ADR documentation when implementing the changed dependency contract.

## Required tests

- [ ] Parser fixtures cover type-only imports, named re-exports, wildcard re-exports, mixed specifiers, and declarations whose ordinary imports are used only as types.
- [ ] Analysis tests prove a pure type-only relationship is retained while mixed declarations and separate runtime-plus-type-only declarations produce one runtime edge.
- [ ] Resolution tests cover type-only project-relative, configured alias, workspace-package, and external-package requests, including unresolved project-code targets.
- [ ] Browser tests prove type-only arrows are visible by default, use a distinct graph-key and edge treatment, can be hidden independently, and return deterministically when restored.
- [ ] Browser tests prove type-only visibility composes with workspace and external-package controls and does not expose an external package whose only currently visible relationships are filtered out.
- [ ] Existing runtime dependency counts, consumer relationships, and styling remain unchanged for analyses without type-only dependencies.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

None yet.
