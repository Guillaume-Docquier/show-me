# Static Report and CLI

Show Me produces one self-contained HTML file that can be opened locally without a server or network access.

The static report, core CLI behavior, and optional Istanbul or LCOV coverage import are implemented.

## CLI contract

The initial commands are:

```shell
show-me
show-me path/to/project
show-me --output reports/project.html
show-me path/to/project --coverage path/to/coverage-final.json
show-me path/to/project --coverage path/to/lcov.info
show-me --exclude "*.generated.*"
show-me --exclude "*.test.*" --exclude "*.spec.*" --exclude "*.generated.*"
```

Defaults and path rules:

- The project root defaults to the directory where the command is invoked.
- The report defaults to `show-me.html` in the directory where the command is invoked.
- A relative `--output` path is resolved from the invocation directory.
- The analyzed project root may contain one automatically discovered `show-me.config.json` JSONC file.
- Relative configured `output` and `coverage` paths are resolved from the analyzed project root.
- Repeatable `--exclude` patterns replace the built-in `*.test.*` and `*.spec.*` exclusions for that invocation.
- The output file is overwritten without requiring a force flag.
- The command never opens a browser and no browser-opening option is planned.
- Success prints the resolved output path and total execution time, then exits.

The CLI surface contains the optional project path, `--output`, `--coverage`, repeatable `--exclude`, `--help`, and `--version`. Project configuration can supply `output`, `coverage`, and the same complete exclusion-pattern set when the corresponding CLI option is absent. Precedence is applied independently per value: CLI, then project configuration, then the existing default. Exclusion patterns use the project-relative semantics documented in [analysis architecture](./analysis.md), and defined arrays are never additive.

## Published repository report

The [live report](https://guillaume-docquier.github.io/show-me/) is a public visualization of this repository's latest validated `main` revision. A GitHub Actions workflow checks formatting, linting, and types, runs Vitest in coverage mode to produce Istanbul-format coverage, builds the package, runs the Chromium browser suite, and then invokes the built CLI with the generated coverage file.

The Pages artifact contains only the generated self-contained report as `index.html`. Report construction stays in the CLI defined above; the workflow only supplies inputs, selects the Pages entry-point filename, packages the static output, and deploys it. See [ADR 005](../adr/005-publish-dogfood-report-with-github-pages.md) for the delivery decision.

## Coverage discovery

When neither CLI nor project configuration supplies coverage, the CLI discovers coverage roots from the project root and the nearest `package.json` ancestor of every analyzed file. This recognizes package roots in pnpm workspaces and other JavaScript or TypeScript monorepos without coupling discovery to one workspace-file format. Roots are processed as the project root followed by package roots in deterministic project-relative order.

At each root, the CLI checks `<coverage-root>/coverage/coverage-final.json` and then `<coverage-root>/coverage/lcov.info`. The first existing report at that root is selected exclusively; the lower-precedence format is never parsed there. Reports selected at different roots are combined into one analysis, resolving relative source paths from the root that owns each report and retaining maximum hits for repeated executable lines. Missing automatic coverage everywhere is informational. A selected but unreadable or invalid report is an expected fatal command error and never falls back to the other format at that root.

When `--coverage` or configured `coverage` is supplied, the effective path is read once. CLI paths resolve from the invocation directory; configured paths resolve from the project root. A first non-whitespace `{` selects the Istanbul parser, while a first non-empty `TN:` or `SF:` record selects LCOV. Any other prefix is unsupported. A missing, unreadable, unsupported, or invalid explicit file is an expected fatal command error with a useful message; parser failures never invoke the other parser. The command still accepts one explicit report; configurable per-package locations and multiple explicit inputs remain [milestone 020](../tasks/020-configurable-coverage-locations.md).

## Report contents

The report embeds:

- the browser JavaScript bundle;
- styles;
- the complete versioned `ProjectAnalysis`;
- any other assets required for offline rendering.

The report does not embed source file contents. The analysis handoff is an internal Node-to-browser boundary and is not exposed as a separate CLI output.

## Initial visualization

The browser renderer uses Sigma.js over a Graphology directed graph. For the initial view and every interactive transition, it rebuilds the visible graph, assigns deterministic circular starting coordinates, and runs a synchronous 5,000-iteration ForceAtlas2 pass. Size adjustment keeps exact repulsion aware of rendered node radii. Barnes-Hut optimization remains disabled because the library's optimized path does not include individual node radii and allowed large nodes to cover their neighbors.

The browser entrypoint is a composition root. It parses the fixed report DOM, creates the current view and edge-visibility state, and connects controls, panels, navigation, and the graph controller. Renderer-neutral visibility and sizing decisions live in the pure report-view transition. Controls own input creation and event binding. Panels own the searchable tree and details DOM. The navigation controller owns persistent selection, transient preview, explicit-selection history, and the one activation operation used by every report surface. The graph controller owns Graphology, Sigma, layout, camera, and a rendered copy of navigation state. Its internal modules separately contain Canvas overlays, zoom-aware label eligibility, drawing functions, renderer types, and browser-test diagnostics. This keeps the timeline visible in the entrypoint without exposing shared ambient state across browser features.

The initial graph is flat:

- directories do not create group nodes or visual containers;
- nodes have no persistent labels;
- project file node size grows logarithmically with code lines by default;
- external-package nodes have one fixed size and a distinct non-coverage color and type label;
- project files with coverage use a red-yellow-green scale while missing coverage remains neutral gray;
- edges point from a consumer to its dependency;
- runtime project-file, runtime external-package, type-only, and structure arrows use distinct graph-key treatments;
- pan, zoom, hover, and selection are supported.

Sigma renders node size relative to layout positions so its radii use the same coordinate system as ForceAtlas2's size adjustment. Sigma fits the browser-owned coordinates from the current Graphology graph. The embedded analysis contains no presentation identities or layout coordinates; the browser derives renderer-neutral presentation before creating Graphology and Sigma state.

## Line-category controls

An accessible checkbox group combines code, comment, and blank physical lines for node sizing. Code is selected by default. Every non-empty combination is valid; the only selected checkbox is disabled so the active metric cannot become empty.

Changing the active categories recomputes node sizes and browser layout through one report-view state transition. Selection remains active across relayout. Returning to an earlier category combination rebuilds the same ordered layout inputs. The node-details panel always shows the complete three-category breakdown regardless of the sizing selection.

## External-package control

External-package nodes and their edges are hidden by default, so package facts do not perturb the initial file-only layout or relationship counts. An accessible unchecked control reveals the canonical package roots referenced by currently visible project files. The same report-view transition rebuilds and lays out the visible Graphology subgraph, combining package visibility with the active line categories and workspace-package filters.

Package nodes use a fixed size and a distinct purple appearance. Color is not their only cue: the package list and node-details panel identify them as external packages. Package details show the project files that consume the package and never fabricate line metrics, coverage, or installed-package contents. Hiding packages clears package hover or selection while preserving a selected project file.

## Type-only dependency control

Explicitly type-only dependencies are visible by default and use lime arrows distinct from runtime project-file, runtime external-package, and structure edges. Their relationship entries are labeled in node details. A checked independent control removes type-only edges from the current view without changing the embedded analysis; project-file nodes remain visible, while an external package disappears when all of its currently eligible relationships are type-only.

Type-only visibility participates in the same report-view transition as workspace-package and external-package visibility. Returning to an earlier combination reconstructs the same ordered node and edge inputs before deterministic layout. The render-only dependency-edge control remains broader and hides both runtime and type-only arrows without rebuilding the graph.

## Workspace-package controls

A pnpm workspace report shows one checked control for every workspace package, including the root. All packages are visible initially. Disabling a package removes its owned files, incident cross-package edges, file-list entries, and external packages with no remaining visible consumer without changing the embedded analysis.

Package filters compose with line-category sizing and external-package visibility through the same report-view transition. A project-file edge remains visible only while both owning packages are enabled. Re-enabling packages reconstructs the complete graph from immutable presentation facts.

## Hover and selection

Hovering a project file, external package, or directory temporarily shows that node's complete information in the right-hand details panel without changing click selection. Project-file details include the complete path, code, comment, and blank line breakdown, visible dependency count, consumer count, and coverage when available. Package details show the canonical package root, explicit entity type, and visible relationships. Directory details show its parent directory and direct child directories and project files. Moving the pointer away restores the selected node's details or the empty state when no node is selected. The graph does not render a pointer-following tooltip.

Explicit activation from the graph, project tree, breadcrumb, relationship lists, or history uses one navigation transition. It selects and visually highlights the entity, records non-duplicate selection history, and centers the visible graph node. Back and forward move through explicit selections only. Hover never changes the camera or history. Clicking empty graph space clears persistent selection without erasing its history. The report deliberately has no dedicated clear-selection button because the canvas gesture is natural and preserves space for navigation and details.

The selection breadcrumb starts at the project root and exposes every directory segment as a navigation target. It remains empty when there is no persistent selection. Placeholder text such as `No selection` only repeats the surrounding empty state and is deliberately omitted. Project-file selection opens a side panel containing:

- the complete path;
- line metrics;
- coverage when available;
- visible project-file and external-package dependencies;
- consumer project files.

Directory selection shows its direct parent and children as selectable navigation entries. Selecting or hovering a directory emphasizes its incident structure edges and dims unrelated structure and dependency edges. Directory disclosure uses a separate accessible control, so expanding or collapsing never changes selection or camera position.

The unfiltered project tree initially expands top-level directories and collapses deeper directories. Case-insensitive search matches complete project-file and directory paths, reports the exact number of direct matches, and temporarily expands matching ancestry without changing graph membership. Clearing search restores the user's expansion state. When the persistent selection is excluded by a search, a labeled selected-item row remains available outside the filtered results.

Dependency-neighborhood highlighting, direction-specific emphasis, directory clustering, and focus modes belong to a later visualization and UX milestone.
