# Testing Strategy

Testing begins with each capability. It is not a stabilization phase after implementation.

## Confidence model

Prefer the smallest real seam that proves user-visible behavior:

1. End-to-end tests for the packaged CLI and generated report workflow.
2. Integration tests through the real filesystem, Oxc adapters, coverage importer, report builder, and renderer boundaries.
3. Focused unit or property tests for line classification, normalization, color interpolation, and other genuinely algorithmic behavior.

Do not use module mocks. Tests should exercise production code through dependency injection, temporary directories, and deterministic fixture projects.

## Fixture projects

Example projects are durable product assets and regression inputs. Store them outside the root TypeScript compilation so they may represent different module modes, malformed files, unsupported syntax, or intentionally incomplete projects.

Each fixture should be small, named for the behavior it proves, and contain hand-written expected analysis data. Do not compute expected dependencies or line metrics with a second implementation of the production algorithm.

Add or extend a fixture whenever implementation reveals a gap. A bug fix is incomplete until the observed failure is represented by a focused regression fixture or test.

The repository itself is a useful dogfooding target, but it is not deterministic enough to replace focused fixtures.

## Assertions

Assertions should optimize failure output:

- compare normalized project-relative paths rather than absolute machine paths;
- compare semantic dependency pairs rather than opaque graph IDs;
- sort unordered collections before comparison;
- assert line categories and coverage percentages explicitly;
- avoid snapshots of the complete generated HTML when a smaller structural assertion identifies the failure better.

## Determinism

Tests must control path normalization, line endings, initial graph positions, and any randomness used by layout. Rendering fixtures should use a fixed seed and stable viewport dimensions where visual or browser assertions require them.

Canvas regressions should be split across observable seams: presentation tests assert geometry such as representative node sizes and circle intersections, while real-browser tests assert hover, tooltip placement, path visibility, selection, and navigation. Screenshots are reserved for failures that cannot be identified more precisely.

## Performance verification

Correctness tests remain the first gate. Performance work uses separate deterministic benchmark projects, records the environment and phase-level measurements, and verifies that optimization does not change semantic analysis results. See the [performance guidance](./performance.md).

## Milestone completion

A milestone is not complete until:

- its behavior is covered at the appropriate real seam;
- new examples and discovered gaps are recorded;
- focused tests, type checking, linting, and formatting pass;
- the active task file records the verification evidence;
- documentation and glossary changes are included when vocabulary or behavior changed.

Every milestone task file contains required test work. If implementation must be split, the tests for the first delivered behavior stay in the same slice rather than being deferred to a later task.
