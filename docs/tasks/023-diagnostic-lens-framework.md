# 023 Diagnostic Lens Framework

## Status

Not started.

## Outcome

The report offers explicit, task-oriented lenses instead of requiring users to construct every useful view from low-level checkboxes. Only implemented lenses are visible, and each lens applies a deterministic, explainable presentation preset without changing the embedded analysis.

## Dependencies

- [Milestone 022](./022-coherent-report-navigation.md) establishes one navigation and selection contract for every report surface.
- [Milestone 010](./done/010-visualization-and-ux.md) establishes the current controls, edge visibility, coverage encoding, and graph focus.
- [ADR 001](../adr/001-separate-analysis-from-rendering.md) requires the browser to derive presentation from the embedded language-neutral analysis.
- [ADR 003](../adr/003-use-sigma-graphology-forceatlas2.md) keeps graph, layout, rendering, and interaction state in the browser.

## Current behavior and problem

The report exposes code, comment, and blank sizing plus structure, runtime, type-only, external-package, and workspace controls at the same time. The controls are flexible, but the default combines several visual questions into one graph. On a dense project, users must discover useful combinations by trial.

The lens framework is an interaction and presentation model, not a request to serialize another report schema or introduce a frontend framework.

## Vocabulary

A **lens** is a named browser presentation mode that chooses which metrics, nodes, edges, legends, findings, and controls are prominent for one codebase question. A lens never changes authoritative analysis.

## UX contract

- The report initially exposes only lenses that have complete behavior. Do not render disabled placeholders for future milestones.
- This milestone introduces `Overview` and `Structure`.
- `Overview` remains the initial lens. It sizes project files by code lines, colors them by coverage, keeps directory orientation, hides the background dependency hairball, and reveals direct dependency relationships on hover or selection.
- `Structure` emphasizes directories, project files, and containment edges. Dependency relationships remain available in the inspector but are not drawn as background or focus edges.
- Switching lenses applies a deterministic preset. Returning to a previous lens reconstructs the same presentation inputs.
- Workspace-package selection is scope, not a lens. Preserve it across lens changes.
- Persistent selection remains selected when its entity is in the new view. If the entity is unavailable, clear it deliberately and announce the change in the inspector.
- Advanced customization remains possible, but it is secondary to the named presets. Changing an encoding away from a preset makes the active state `Custom` rather than leaving a misleading lens selected.
- Lens-specific legends and controls replace irrelevant global controls. Do not show a control that has no effect in the active lens.
- Direct dependency focus in `Overview` must work even though unfocused background dependency edges are hidden.

## Implementation tasks

- [ ] Define a typed browser-owned lens identity and deterministic preset model.
- [ ] Separate codebase scope, lens preset, advanced overrides, and transient interaction state so they are not one ambiguous state object.
- [ ] Add an accessible lens selector in the report shell.
- [ ] Implement `Overview`, `Structure`, and derived `Custom` states.
- [ ] Teach graph edge rendering to suppress unfocused dependency edges in `Overview` while still drawing the selected or hovered direct neighborhood.
- [ ] Render only controls and legends that affect the active lens.
- [ ] Keep advanced controls available behind a compact secondary affordance.
- [ ] Preserve workspace scope and coherent selection behavior across lens transitions.
- [ ] Expose semantic lens state in the DOM for deterministic browser assertions.
- [ ] Keep lens derivation in browser presentation and report-view code. Do not add lens fields to `ProjectAnalysis`.
- [ ] Keep the browser entrypoint thin by delegating lens transitions to the owning browser components.

## Required tests

- [ ] Focused tests cover preset derivation, `Custom` detection, scope preservation, and deterministic restoration.
- [ ] Browser coverage proves `Overview` is the initial lens and does not render the complete background dependency graph.
- [ ] Browser coverage proves hover and selection still reveal the direct dependency neighborhood in `Overview`.
- [ ] Browser coverage proves `Structure` shows containment without dependency focus decoration.
- [ ] Browser coverage proves irrelevant controls and legends are absent from each lens.
- [ ] Browser coverage proves changing an advanced encoding enters `Custom` and selecting a named lens restores its exact preset.
- [ ] Browser coverage proves selection and workspace scope survive compatible lens transitions and clear deliberately when incompatible.
- [ ] Existing rendered geometry, collision, coverage-color, and interaction tests remain valid.

## Documentation

- [ ] Add `Lens` to the glossary as a browser-owned presentation concept.
- [ ] Update the README with implemented lenses, their defaults, and the location of advanced controls.
- [ ] Amend ADR 003 only if the implementation changes graph or report-view ownership rather than extending the existing browser presentation boundary.

## Verification evidence

Record commands and results here before completion.

## Non-goals

- Findings, coverage diagnostics, coupling diagnostics, boundary aggregation, or external-package analysis.
- Empty tabs for planned lenses.
- Persisting lens state into analysis or project configuration.
- Mobile or narrow-window behavior.

## Discovered gaps

None yet.
