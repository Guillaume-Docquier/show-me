# Analysis Architecture

Analysis converts files on disk into an internal, language-neutral description that report generation can consume.

## Current implementation

Filesystem discovery, normalized project-file paths, CLOC-style physical-line categories, static runtime ESM project and external-package dependency analysis, and Istanbul line-coverage enrichment are implemented.

## Project discovery

The project root defaults to the current working directory and may be supplied as the optional positional CLI argument.

Discovery scans beneath the project root, honors `.gitignore`, and applies narrowly defined standard exclusions such as dependency, version-control, coverage, and generated-output directories. It accepts an explicit typed file-selection policy for overrideable conventions while keeping standard directories, `.gitignore`, declaration files, and unsupported languages permanently excluded. It does not use `tsconfig.json` as the authoritative file list. Project configuration guides dependency resolution, while filesystem discovery determines which project files exist.

Initial executable extensions are:

- `.js`, `.jsx`, `.mjs`, and `.cjs`;
- `.ts`, `.tsx`, `.mts`, and `.cts`.

TypeScript declaration files such as `.d.ts`, `.d.mts`, and `.d.cts` are excluded. CSS, JSON, SVG, images, and other non-code assets do not become project files or dependency targets.

Supported JavaScript and TypeScript files are also excluded by default when their basename contains `.test.` or `.spec.`, matched case-insensitively and anywhere in the basename. The rule is basename-only: marker-like directory names do not exclude their contents, and bare names such as `test.ts` and `spec.ts` remain project files. Excluded test files are filtered during discovery, before source reading, parsing, line metrics, dependency analysis, coverage matching, and report construction. An included file may resolve an import to an existing excluded test file without creating an edge or unresolved-dependency diagnostic.

Internal analysis callers can restore only this default test-file exclusion through the typed selection policy. User-facing CLI selection and additional ignore-pattern semantics remain milestone 014; configuration-file loading remains milestone 015.

## Internal analysis model

The internal model is versioned even though it is not initially a public CLI format. Its concepts are language-neutral:

- project metadata;
- project files with normalized project-relative paths and metrics;
- directed dependencies;
- canonical external-package facts and distinct file-to-package dependencies;
- optional per-file coverage;
- diagnostics that did not prevent useful analysis.

Project-relative paths use forward slashes on every platform. Construction normalizes duplicate separators and lexical dot segments, rejects absolute, project-root-only, and outside-root paths, and compares paths with locale-independent ordinal ordering. One canonical relative path identifies a file within an analysis.

Edges are authoritative. Import and consumer counts are derived from edges rather than duplicated as independently maintained data.

## Language modules

A language module operates at project scope so it can use project configuration and resolve relationships across files. The internal JavaScript/TypeScript module uses Oxc and exposes only language-neutral file analyses, metrics, dependencies, and diagnostics. Oxc parser and resolver values remain contained behind focused adapters.

Language modules are an architectural extension point, not a public plugin API. Adding another language initially means adding another module to the Show Me package. The core model and renderer must not gain language-specific AST types or resolution rules.

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

Relative paths, absolute paths, package-import specifiers beginning with `#`, protocol requests, malformed package roots, and Node built-ins are not external packages. A request matching a configured `tsconfig.json` or `jsconfig.json` path alias retains project-resolution precedence: a resolved alias creates a project-file dependency, while a missing alias produces the existing unresolved-runtime diagnostic rather than a package fact. Milestone 008 will insert workspace-package ownership before external-package classification.

## Line metrics

Each physical line belongs exclusively to code, comment, or blank. A line containing syntax and a comment is code; a line containing only parser-confirmed comment material and whitespace is comment; all other whitespace-only lines are blank. Empty source has zero physical lines. LF, CRLF, and lone CR terminate physical lines, while a final separator does not create a trailing phantom line.

JavaScript and TypeScript dependency requests, diagnostics, and comments come from one Oxc parse. Parser spans prevent comment markers inside strings, template literals, regular expressions, and JSX syntax from being misclassified. An AST-confirmed JSX expression container whose sole content is one block comment counts as comment material, while ordinary object-literal braces remain code. Oxc reports a hashbang as a line comment, so Show Me classifies it consistently as comment.

Code lines size project-file nodes by default. Report controls can combine any non-empty subset of code, comment, and blank counts.

Node size grows with the base-2 logarithm of the selected line count. This keeps ordinary files in the broad 20-to-500-line range visually comparable, while files around 1,000 lines and above stand out without dominating the graph.

## Coverage

The coverage importer reads Istanbul `coverage-final.json` and derives executable-line coverage from statement start lines. Multiple statements on one line use their maximum hit count, a statement spanning multiple lines belongs to its start line, percentages are truncated to two decimals, and a file with no executable lines is 100% covered.

Coverage paths are normalized against the project root before matching discovered project files. Absolute and relative paths and Windows and POSIX separators are supported; outside-root and non-project entries are ignored.

A project file absent from a coverage report has unknown coverage, not zero coverage. Missing coverage is represented explicitly so the renderer can use a neutral color instead of red.
