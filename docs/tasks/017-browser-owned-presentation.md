# 017 Browser-Owned Presentation

## Status

Not started.

## Outcome

The self-contained HTML report embeds the versioned, language-neutral `ProjectAnalysis` as its only project data. When the report opens, the browser derives all presentation and rendering state from that analysis, including graph identities, relationships, display text, node sizes, and colors.

The current user-visible report behavior remains unchanged. Coverage remains the default color input and code lines remain the default size input, but both policies become browser-owned so later visualization controls can change them without regenerating the report.

## Architecture dependencies

- Amend [ADR 001](../adr/001-separate-analysis-from-rendering.md) before implementation because it currently requires report generation to derive a presentation model and the browser to consume that model.
- Amend [ADR 004](../adr/004-generate-one-self-contained-html-report.md) so the self-contained report explicitly embeds analysis data rather than presentation data.
- Preserve the existing boundary that browser code cannot depend on Oxc, Node filesystem APIs, source ASTs, project configuration, or raw coverage formats.

## Tasks

- [ ] Amend ADRs 001 and 004 to make the embedded `ProjectAnalysis` the Node-to-browser data boundary and presentation derivation a browser responsibility.
- [ ] Replace `window.showMePresentation` with an internal analysis handoff whose type and schema version come from `ProjectAnalysis`.
- [ ] Make the Node report builder a packaging and escaping boundary only: it embeds the analysis, fixed HTML shell, styles, and prebuilt browser bundle without calculating presentation data.
- [ ] Move project title, project-file count, node identity, relationship indexing, display names, tooltip names, external-package presentation, node sizing, and coverage color calculation into `entry.browser.ts`. Any helper extracted for cohesion or testing must remain browser-only under `src/report/browser/` and enter the bundle exclusively through that entrypoint.
- [ ] Derive import and consumer lists from authoritative analysis edges in the browser instead of embedding duplicated relationship arrays.
- [ ] Derive project-file sizes from raw line metrics for every view transition; keep code lines as the initial selection and preserve every non-empty line-category combination.
- [ ] Derive project-file colors from raw optional coverage in the browser; keep the current neutral and red-yellow-green behavior without adding color configuration in this milestone.
- [ ] Preserve raw diagnostics in the embedded analysis without adding diagnostics UI; presentation of diagnostics remains milestone 010.
- [ ] Remove the Node-owned report-presentation schema and production transformation once no report path depends on them.
- [ ] Keep project source text and analyzer-specific values out of the generated report.
- [ ] Update architecture, glossary, performance, and testing documentation to describe the new data boundary and browser-side presentation phase.
- [ ] Update milestone 011 instrumentation language so browser presentation derivation and layout remain separately measurable.

## Required tests

- [ ] Report-builder tests prove the embedded project payload is the complete analysis model, including files, dependencies, external packages, coverage, and diagnostics.
- [ ] Report-builder tests prove presentation-only values such as colors, rendered sizes, display names, relationship indexes, and graph node IDs are not embedded.
- [ ] Hostile project names, paths, package names, and diagnostic messages remain safely escaped inside the inline analysis script.
- [ ] The report remains one offline HTML file and does not embed project source contents.
- [ ] Browser tests prove the raw analysis produces the current title, file count, graph nodes, edges, tooltips, selection details, and accessible DOM lists.
- [ ] Browser tests prove line-category changes recalculate sizes and package visibility rebuilds visible relationships from raw analysis.
- [ ] Browser tests prove covered, uncovered, partially covered, and missing-coverage files receive the current colors after browser-side derivation.
- [ ] Empty-project and external-package reports still initialize without page errors.
- [ ] Playwright scenarios use awaited `test.step(...)` phases rather than one global Arrange/Act/Assert sequence.
- [ ] Node tests, type checking, linting, formatting, both builds, and the real-browser suite pass after the old presentation boundary is removed.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

- User-configurable color inputs and palettes belong to [milestone 010](./010-visualization-and-ux.md); this milestone only moves the existing coverage-color policy into the browser.
- Surfacing non-fatal analysis diagnostics remains a separate milestone-010 product and accessibility decision.
