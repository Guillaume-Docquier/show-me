# Separate Analysis From Rendering

## Status

Accepted.

## Context

Show Me begins with JavaScript and TypeScript but is intended to support other languages. Its analyzer may eventually move from TypeScript to Rust. The browser visualization should not understand parser ASTs, filesystem access, project configuration, or coverage report formats.

Passing parser-specific data directly to the renderer would make new languages and an analyzer rewrite expensive. A public plugin or JSON API would also freeze extension and serialization contracts before the first implementation has produced operational evidence.

## Decision

Use a versioned, language-neutral internal analysis model as the boundary between project analysis and report generation.

Project-level language modules produce files, metrics, dependencies, and diagnostics in that model. Coverage importers enrich it with normalized per-file coverage. Report generation derives a presentation model, including layout and render-only data, without changing the analysis.

The browser renderer consumes only the embedded presentation model. It cannot depend on Oxc, Node filesystem APIs, source ASTs, or raw coverage formats.

Language modules are internal extension points. The analysis serialization is not initially a public CLI output, and third-party plugins are not an initial goal.

## Consequences

New language modules and a future Rust analyzer can reuse the report pipeline without teaching the renderer language-specific concepts. Coverage and rendering can evolve independently, and tests can exercise stable application seams.

The application must maintain explicit mappings from parser and coverage data into the internal model. Versioning and normalizing that model adds design work, even while it remains private. A public plugin or JSON API requires a later decision after the internal contract has demonstrated stability.
