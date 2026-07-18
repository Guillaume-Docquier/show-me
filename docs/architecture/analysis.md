# Analysis Architecture

Analysis converts files on disk into an internal, language-neutral description that report generation can consume.

## Current implementation

Filesystem and pnpm workspace discovery, normalized project-file paths, CLOC-style physical-line categories, static runtime ESM project and external-package dependency analysis, and Istanbul or LCOV line-coverage enrichment are implemented.

## Project discovery

The project root defaults to the current working directory and may be supplied as the optional positional CLI argument.

Discovery scans beneath the project root, honors `.gitignore`, and applies narrowly defined standard exclusions such as dependency, version-control, coverage, and generated-output directories. It accepts an explicit typed file-selection policy for overrideable conventions while keeping standard directories, `.gitignore`, declaration files, and unsupported languages permanently excluded. It does not use TypeScript project configuration as the authoritative file list. Automatically discovered `tsconfig.json` and `jsconfig.json` files guide dependency resolution for each source file, while filesystem discovery determines which project files exist.

Initial executable extensions are:

- `.js`, `.jsx`, `.mjs`, and `.cjs`;
- `.ts`, `.tsx`, `.mts`, and `.cts`.

TypeScript declaration files such as `.d.ts`, `.d.mts`, and `.d.cts` are excluded. CSS, JSON, SVG, images, and other non-code assets do not become project files or dependency targets.

Supported JavaScript and TypeScript files are also excluded by default when their basename contains `.test.` or `.spec.`, matched case-insensitively and anywhere in the basename. The rule is basename-only: marker-like directory names do not exclude their contents, and bare names such as `test.ts` and `spec.ts` remain project files. Excluded test files are filtered during discovery, before source reading, parsing, line metrics, dependency analysis, coverage matching, and report construction. An included file may resolve an import to an existing excluded test file without creating an edge or unresolved-dependency diagnostic.

Internal analysis callers can restore only this default test-file exclusion through the typed selection policy. User-facing CLI selection and additional ignore-pattern semantics remain milestone 014; configuration-file loading remains milestone 015.

## Internal analysis model

The internal model is versioned even though it is not initially a public CLI format. Its concepts are language-neutral:

- project metadata;
- pnpm workspace packages and per-file ownership when a workspace is present;
- project files with normalized project-relative paths and metrics;
- directed dependencies;
- canonical external-package facts and distinct file-to-package dependencies;
- optional per-file coverage;
- diagnostics that did not prevent useful analysis.

Project-relative paths use forward slashes on every platform. Construction normalizes duplicate separators and lexical dot segments, rejects absolute, project-root-only, and outside-root paths, and compares paths with locale-independent ordinal ordering. One canonical relative path identifies a file within an analysis.

Edges are authoritative. Dependency and consumer counts are derived from edges rather than duplicated as independently maintained data.

## Language modules

A language module operates at project scope so it can use project configuration and resolve relationships across files. The internal JavaScript/TypeScript module uses Oxc's file-based resolution to discover the configuration applicable to each source file, including referenced project configurations. It exposes only language-neutral file analyses, metrics, dependencies, and diagnostics. Oxc parser and resolver values remain contained behind focused adapters.

Language modules are an architectural extension point, not a public plugin API. Adding another language initially means adding another module to the Show Me package. The core model and renderer must not gain language-specific AST types or resolution rules.

## pnpm workspaces

When the project root contains `pnpm-workspace.yaml`, workspace discovery parses its `packages` array and expands positive, negative, and nested patterns to package manifests. The workspace root is always a package. Every analyzed file belongs to its nearest workspace package; files outside selected nested packages, including files beneath an excluded package directory, fall back to root ownership.

Workspace package paths are stable project-relative identities. Package names remain display and request-classification data. The complete ordered package list and file ownership cross the language-neutral analysis boundary so the browser can derive filters without reading package configuration.

The JavaScript and TypeScript analyzer keeps ordinary Oxc resolution first, preserving the `tsconfig.json` or `jsconfig.json` applicable to each source file. If an otherwise bare request names a workspace package, its package exports or conventional source entry point resolve against analyzed files before external-package classification. A matched but unresolved workspace request produces a diagnostic rather than an external-package fact.

## Initial JavaScript and TypeScript dependency rules

The initial JavaScript and TypeScript analyzer recognizes:

- static ESM imports;
- side-effect ESM imports;
- static runtime named re-exports;
- static runtime wildcard re-exports.

Explicitly type-only imports and re-exports are excluded. A mixed declaration remains a runtime dependency when at least one specifier is not marked as type-only. This rule is syntax-based: Show Me does not type-check ordinary imports to determine whether a compiler may later erase them.

CommonJS `require()`, dynamic `import()`, and non-literal dependency expressions are separate future work.

Imports that resolve to unsupported asset types are ignored. An import that should resolve to executable project code but cannot be resolved produces a diagnostic rather than a fabricated edge.

## External packages

Unaliased bare npm requests create canonical external-package facts and distinct file-to-package runtime dependencies. Package classification is syntactic and does not require a package to be installed. External packages never enter project discovery, source reading, parsing, line metrics, or coverage matching, and files beneath `node_modules` remain permanently excluded.

Package subpaths collapse to their package name. For example, `drizzle-orm/pg-core` belongs to `drizzle-orm`, and `@scope/package/subpath` belongs to `@scope/package`.

Relative paths, absolute paths, package-import specifiers beginning with `#`, protocol requests, malformed package roots, Node built-ins, and workspace-owned package requests are not external packages. A request matching a path alias from the source file's automatically discovered `tsconfig.json` or `jsconfig.json`, its relative base configuration, or a referenced project configuration retains project-resolution precedence: a resolved alias creates a project-file dependency, while a missing alias produces the existing unresolved-runtime diagnostic rather than a package fact.

## Line metrics

Each physical line belongs exclusively to code, comment, or blank. A line containing syntax and a comment is code; a line containing only parser-confirmed comment material and whitespace is comment; all other whitespace-only lines are blank. Empty source has zero physical lines. LF, CRLF, and lone CR terminate physical lines, while a final separator does not create a trailing phantom line.

JavaScript and TypeScript dependency requests, diagnostics, and comments come from one Oxc parse. Parser spans prevent comment markers inside strings, template literals, regular expressions, and JSX syntax from being misclassified. An AST-confirmed JSX expression container whose sole content is one block comment counts as comment material, while ordinary object-literal braces remain code. Oxc reports a hashbang as a line comment, so Show Me classifies it consistently as comment.

Code lines size project-file nodes by default. Report controls can combine any non-empty subset of code, comment, and blank counts.

Node size grows with the base-2 logarithm of the selected line count. This keeps ordinary files in the broad 20-to-500-line range visually comparable, while files around 1,000 lines and above stand out without dominating the graph.

## Coverage

Coverage parsers translate Istanbul `coverage-final.json` statement start lines or LCOV `lcov.info` `SF` and `DA` records into one internal contract of source paths and executable-line hit counts. LCOV function and branch records are ignored because analysis stores line coverage only. Repeated source records, repeated LCOV line entries, and multiple Istanbul statements on one line retain the maximum hit count. An Istanbul statement spanning multiple lines belongs to its start line. Percentages are truncated to two decimals, and a report entry with no executable lines is 100% covered.

Coverage paths are normalized against the root that owns each report before matching discovered project files against the overall project root. This lets a package-local report use paths such as `src/app.ts` while analysis still identifies the file as `frontend/src/app.ts`. Absolute and relative paths and Windows and POSIX separators are supported; outside-project and non-project entries are ignored.

When automatic discovery selects reports at multiple project or package roots, their format-neutral executable-line hits enrich one analysis. Repeated files and lines across reports retain the maximum hit count, matching the duplicate behavior within one report.

A project file absent from a coverage report has unknown coverage, not zero coverage. Missing coverage is represented explicitly so the renderer can use a neutral color instead of red.
