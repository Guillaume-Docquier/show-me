# 017 Browser-Owned Presentation

## Status

Complete.

## Outcome

The self-contained HTML report embeds the versioned, language-neutral `ProjectAnalysis` as its only project data. When the report opens, the browser derives all presentation and rendering state from that analysis, including graph identities, relationships, display text, node sizes, and colors.

The current user-visible report behavior remains unchanged. Coverage remains the default color input and code lines remain the default size input, but both policies become browser-owned so later visualization controls can change them without regenerating the report.

## Architecture dependencies

- Amend [ADR 001](../../adr/001-separate-analysis-from-rendering.md) before implementation because it currently requires report generation to derive a presentation model and the browser to consume that model.
- Amend [ADR 004](../../adr/004-generate-one-self-contained-html-report.md) so the self-contained report explicitly embeds analysis data rather than presentation data.
- Preserve the existing boundary that browser code cannot depend on Oxc, Node filesystem APIs, source ASTs, project configuration, or raw coverage formats.

## Tasks

- [x] Amend ADRs 001 and 004 to make the embedded `ProjectAnalysis` the Node-to-browser data boundary and presentation derivation a browser responsibility.
- [x] Replace `window.showMePresentation` with an internal analysis handoff whose type and schema version come from `ProjectAnalysis`.
- [x] Make the Node report builder a packaging and escaping boundary only: it embeds the analysis, fixed HTML shell, styles, and prebuilt browser bundle without calculating presentation data.
- [x] Move project title, project-file count, node identity, relationship indexing, display names, tooltip names, external-package presentation, node sizing, and coverage color calculation into `entry.browser.ts`. Any helper extracted for cohesion or testing must remain browser-only under `src/report/browser/` and enter the bundle exclusively through that entrypoint.
- [x] Derive dependency and consumer lists from authoritative analysis edges in the browser instead of embedding duplicated relationship arrays.
- [x] Derive project-file sizes from raw line metrics for every view transition; keep code lines as the initial selection and preserve every non-empty line-category combination.
- [x] Derive project-file colors from raw optional coverage in the browser; keep the current neutral and red-yellow-green behavior without adding color configuration in this milestone.
- [x] Preserve raw diagnostics in the embedded analysis without adding diagnostics UI; presentation of diagnostics remains milestone 010.
- [x] Remove the Node-owned report-presentation schema and production transformation once no report path depends on them.
- [x] Keep project source text and analyzer-specific values out of the generated report.
- [x] Update architecture, glossary, performance, and testing documentation to describe the new data boundary and browser-side presentation phase.
- [x] Update milestone 011 instrumentation language so browser presentation derivation and layout remain separately measurable.

## Required tests

- [x] Report-builder tests prove the embedded project payload is the complete analysis model, including files, dependencies, external packages, coverage, and diagnostics.
- [x] Report-builder tests prove presentation-only values such as colors, rendered sizes, display names, relationship indexes, and graph node IDs are not embedded.
- [x] Hostile project names, paths, package names, and diagnostic messages remain safely escaped inside the inline analysis script.
- [x] The report remains one offline HTML file and does not embed project source contents.
- [x] Browser tests prove the raw analysis produces the current title, file count, graph nodes, edges, tooltips, selection details, and accessible DOM lists.
- [x] Browser tests prove line-category changes recalculate sizes and package visibility rebuilds visible relationships from raw analysis.
- [x] Browser tests prove covered, uncovered, partially covered, and missing-coverage files receive the current colors after browser-side derivation.
- [x] Empty-project and external-package reports still initialize without page errors.
- [x] Playwright scenarios use awaited `test.step(...)` phases rather than one global Arrange/Act/Assert sequence.
- [x] Node tests, type checking, linting, formatting, both builds, and the real-browser suite pass after the old presentation boundary is removed.

## Verification evidence

- `pnpm format:fix` — passed; oxfmt processed 176 files.
- `pnpm lint` — passed with zero warnings.
- `pnpm typecheck` — passed.
- `pnpm test` — passed 14 files and 164 tests.
- `pnpm build` — passed both Node and browser builds; the browser bundle was 401.9 kB.
- `pnpm test:browser` — passed all 5 Chromium scenarios after rebuilding both targets.

## Discovered gaps

- User-configurable color inputs and palettes belong to [milestone 010](../010-visualization-and-ux.md); this milestone only moves the existing coverage-color policy into the browser.
- Surfacing non-fatal analysis diagnostics remains a separate milestone-010 product and accessibility decision.
