# Separate Analysis From Rendering

## Status

Accepted.

## Context

Show Me begins with JavaScript and TypeScript but is intended to support other languages. Its analyzer may eventually move from TypeScript to Rust. The browser visualization should not understand parser ASTs, filesystem access, project configuration, or coverage report formats.

Passing parser-specific data directly to the renderer would make new languages and an analyzer rewrite expensive. A public plugin or JSON API would also freeze extension and serialization contracts before the first implementation has produced operational evidence.

## Decision

Use the versioned, language-neutral `ProjectAnalysis` as the Node-to-browser data boundary.

Project-level language modules produce files, metrics, dependencies, and diagnostics in that model. Coverage importers enrich it with normalized per-file coverage. The Node report builder packages and safely embeds the complete analysis with the fixed HTML shell, styles, and prebuilt browser bundle without deriving presentation data.

The browser derives graph identities, display text, relationship indexes, node sizes, and colors from the embedded analysis, then creates browser-only graph, layout, rendering, and interaction state. Browser code cannot depend on Oxc, Node filesystem APIs, source ASTs, project configuration, or raw coverage formats.

Language modules are internal extension points. The analysis serialization is not initially a public CLI output, and third-party plugins are not an initial goal.

## Consequences

New language modules and a future Rust analyzer can reuse the report pipeline without teaching the browser language-specific concepts. Coverage and rendering can evolve independently, and tests can exercise the embedded analysis boundary plus browser-owned presentation behavior.

The application must maintain explicit mappings from parser and coverage data into the internal model. Versioning and normalizing that model adds design work, even while it remains private. A public plugin or JSON API requires a later decision after the internal contract has demonstrated stability.

### 2026-07-18 browser-owned presentation amendment

The initial implementation derived and embedded a separate Node-owned presentation schema. That duplicated authoritative dependency facts into node relationship arrays and fixed coverage-color, line-sizing, display, and identity policies before the report reached the browser.

The embedded `ProjectAnalysis` now replaces that schema as the single project payload. Presentation remains a useful browser-internal concept, but it is derived on load and is not a serialized Node contract. This keeps report generation a packaging boundary and lets later browser controls change presentation policy without regenerating the report.
