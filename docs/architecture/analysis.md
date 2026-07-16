# Analysis Architecture

Analysis converts files on disk into an internal, language-neutral description that report generation can consume.

## Project discovery

The project root defaults to the current working directory and may be supplied as the optional positional CLI argument.

Discovery scans beneath the project root, honors `.gitignore`, and applies narrowly defined standard exclusions such as dependency, version-control, coverage, and generated-output directories. It does not use `tsconfig.json` as the authoritative file list. Project configuration guides dependency resolution, while filesystem discovery determines which project files exist.

Initial executable extensions are:

- `.js`, `.jsx`, `.mjs`, and `.cjs`;
- `.ts`, `.tsx`, `.mts`, and `.cts`.

TypeScript declaration files such as `.d.ts`, `.d.mts`, and `.d.cts` are excluded. CSS, JSON, SVG, images, and other non-code assets do not become project files or dependency targets.

## Internal analysis model

The internal model is versioned even though it is not initially a public CLI format. Its concepts are language-neutral:

- project metadata;
- project files with normalized project-relative paths and metrics;
- directed dependencies;
- optional per-file coverage;
- diagnostics that did not prevent useful analysis.

Project-relative paths use forward slashes on every platform. A normalized relative path identifies a file within one analysis.

Edges are authoritative. Import and consumer counts are derived from edges rather than duplicated as independently maintained data.

## Language modules

A language module operates at project scope so it can use project configuration and resolve relationships across files. The initial JavaScript/TypeScript module is internal and uses Oxc.

Language modules are an architectural extension point, not a public plugin API. Adding another language initially means adding another module to the Show Me package. The core model and renderer must not gain language-specific AST types or resolution rules.

## Initial JavaScript and TypeScript dependency rules

The first import-analysis milestone recognizes:

- static ESM imports;
- side-effect ESM imports;
- static runtime named re-exports;
- static runtime wildcard re-exports.

Explicitly type-only imports and re-exports are excluded. A mixed declaration remains a runtime dependency when at least one specifier is not marked as type-only. This rule is syntax-based: Show Me does not type-check ordinary imports to determine whether a compiler may later erase them.

CommonJS `require()`, dynamic `import()`, and non-literal dependency expressions are separate future work.

Imports that resolve to unsupported asset types are ignored. An import that should resolve to executable project code but cannot be resolved produces a diagnostic rather than a fabricated edge.

## External packages

External npm dependencies are excluded initially. A later milestone will create one synthetic node for each imported package without reading or analyzing installed package files.

Package subpaths collapse to their package name. For example, `drizzle-orm/pg-core` belongs to `drizzle-orm`, and `@scope/package/subpath` belongs to `@scope/package`.

## Line metrics

The initial line metric counts non-blank physical lines and includes comments. A later CLOC-style milestone classifies blank, comment, and code lines separately. At that point, code lines become the default node-sizing metric and the UI may combine any of the three categories.

Node area is proportional to the selected line count. Render radius therefore grows with the square root of that count so large files do not dominate the graph disproportionately.

## Coverage

The initial coverage importer reads Istanbul `coverage-final.json` and derives line coverage for project files. Coverage paths are normalized against the project root before matching project files.

A project file absent from a coverage report has unknown coverage, not zero coverage. Missing coverage is represented explicitly so the renderer can use a neutral color instead of red.
