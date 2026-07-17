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

Line-classification fixtures use hand-written code, comment, and blank expectations. Algorithm tests cover LF, CRLF, lone CR, final separators, parser offsets, and syntax ambiguities, and assert that the three exclusive categories sum to the documented physical-line total. Browser sizing tests exercise every non-empty category combination, selection persistence, changed intermediate geometry, and exact deterministic geometry when toggling back.

External-package fixtures hand-write bare, subpath, scoped, repeated, and alias-lookalike requests. Filesystem integration proves package facts are available when uninstalled and that hostile `node_modules` contents never become project files, parser inputs, metrics, or diagnostics. Browser tests compare default geometry with an equivalent package-free presentation, then cover visibility, relationship filtering, selection clearing, accessible type cues, and combined line-metric transitions.

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
