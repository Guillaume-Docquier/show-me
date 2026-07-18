# Static Report and CLI

Show Me produces one self-contained HTML file that can be opened locally without a server or network access.

The static report, core CLI behavior, and optional Istanbul coverage import are implemented.

## CLI contract

The initial commands are:

```shell
show-me
show-me path/to/project
show-me --output reports/project.html
show-me path/to/project --coverage path/to/coverage-final.json
```

Defaults and path rules:

- The project root defaults to the directory where the command is invoked.
- The report defaults to `show-me.html` in the directory where the command is invoked.
- A relative `--output` path is resolved from the invocation directory.
- The output file is overwritten without requiring a force flag.
- The command never opens a browser and no browser-opening option is planned.
- Success prints the resolved output path and total execution time, then exits.

The first CLI surface contains only the optional project path, `--output`, `--coverage`, `--help`, and `--version`. There is no Show Me configuration file initially.

## Published repository report

The [live report](https://guillaume-docquier.github.io/show-me/) is a public visualization of this repository's latest validated `main` revision. A GitHub Actions workflow checks formatting, linting, and types, runs Vitest in coverage mode to produce Istanbul-format coverage, builds the package, runs the Chromium browser suite, and then invokes the built CLI with the generated coverage file.

The Pages artifact contains only the generated self-contained report as `index.html`. Report construction stays in the CLI defined above; the workflow only supplies inputs, selects the Pages entry-point filename, packages the static output, and deploys it. See [ADR 005](../adr/005-publish-dogfood-report-with-github-pages.md) for the delivery decision.

## Coverage discovery

When `--coverage` is absent, the CLI looks for `<project-root>/coverage/coverage-final.json`. Missing automatically discovered coverage is informational and analysis continues without it. A present but unreadable or invalid automatic coverage file is an expected fatal command error.

When `--coverage` is supplied, its path is resolved from the invocation directory. A missing, unreadable, or invalid explicit file is an expected fatal command error with a useful message.

## Report contents

The report embeds:

- the browser JavaScript bundle;
- styles;
- the presentation model derived from analysis;
- any other assets required for offline rendering.

The report does not embed source file contents. Analysis JSON is an internal boundary and is not exposed as a separate CLI output.

## Initial visualization

The browser renderer uses Sigma.js over a Graphology directed graph. For the initial view and every interactive transition, it rebuilds the visible graph, assigns deterministic circular starting coordinates, and runs a synchronous 5,000-iteration ForceAtlas2 pass. Size adjustment keeps exact repulsion aware of rendered node radii. Barnes-Hut optimization remains disabled because the library's optimized path does not include individual node radii and allowed large nodes to cover their neighbors.

The initial graph is flat:

- directories do not create group nodes or visual containers;
- nodes have no persistent labels;
- project file node size grows logarithmically with code lines by default;
- external-package nodes have one fixed size and a distinct non-coverage color and type label;
- project files with coverage use a red-yellow-green scale while missing coverage remains neutral gray;
- edges point from an importing file to the imported file;
- pan, zoom, hover, and selection are supported.

Sigma renders node size relative to layout positions so its radii use the same coordinate system as ForceAtlas2's size adjustment. Sigma fits the browser-owned coordinates from the current Graphology graph. The embedded presentation remains renderer-neutral and does not contain layout coordinates; layout geometry does not enter project analysis.

## Line-category controls

An accessible checkbox group combines code, comment, and blank physical lines for node sizing. Code is selected by default. Every non-empty combination is valid; the only selected checkbox is disabled so the active metric cannot become empty.

Changing the active categories recomputes node sizes and browser layout through one report-view state transition. Selection remains active across relayout. Returning to an earlier category combination rebuilds the same ordered layout inputs. Tooltips and the selected-file panel always show the complete three-category breakdown regardless of the sizing selection.

## External-package control

External-package nodes and their edges are hidden by default, so package facts do not perturb the initial file-only layout or relationship counts. An accessible unchecked control reveals all canonical package roots. The same report-view transition rebuilds and lays out the visible Graphology subgraph, combining package visibility with the active line categories.

Package nodes use a fixed size and a distinct purple appearance. Color is not their only cue: the package list, tooltip, and selected-node panel all identify them as external packages. Package details show the project files that import the package and never fabricate line metrics, coverage, or installed-package contents. Hiding packages clears package hover or selection while preserving a selected project file.

## Hover and selection

A hover tooltip follows the pointer with a small offset and flips or clamps at viewport edges. Project-file tooltips show a width-constrained, tail-preserving path plus the complete code, comment, and blank line breakdown, visible import count, consumer count, and coverage when available. Package tooltips show the canonical package root, explicit entity type, and visible relationships. A long file path truncates its beginning so the filename and nearest directories remain visible; CSS may wrap exceptionally long filenames but must not apply a second end-truncating ellipsis.

Clicking a project file node selects and visually highlights only that node. Selection opens a side panel containing:

- the complete path;
- line metrics;
- coverage when available;
- visible imported project files and external packages;
- consumer project files.

Visible file and package entries in the side panel select their corresponding nodes. Clicking empty graph space or the clear-selection control clears selection.

Dependency-neighborhood highlighting, direction-specific emphasis, directory clustering, and focus modes belong to a later visualization and UX milestone.
