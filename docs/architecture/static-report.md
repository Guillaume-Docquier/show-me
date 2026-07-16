# Static Report and CLI

Show Me produces one self-contained HTML file that can be opened locally without a server or network access.

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

## Coverage discovery

Without `--coverage`, the CLI looks for `<project-root>/coverage/coverage-final.json`. If it is absent, the CLI prints an informational message and continues without coverage.

When `--coverage` is supplied, a missing, unreadable, or invalid file is an expected fatal command error with a useful message.

## Report contents

The report embeds:

- the browser JavaScript bundle;
- styles;
- the presentation model derived from analysis;
- any other assets required for offline rendering.

The report does not embed source file contents. Analysis JSON is an internal boundary and is not exposed as a separate CLI output.

## Initial visualization

The renderer uses Sigma.js over a Graphology directed graph. ForceAtlas2 supplies automatic repulsion and spacing that account for node size.

The initial graph is flat:

- directories do not create group nodes or visual containers;
- nodes have no persistent labels;
- project file node area is proportional to the active line metric;
- edges point from an importing file to the imported file;
- pan, zoom, hover, and selection are supported.

The renderer consumes presentation data only. Layout coordinates and render-only styling belong to the presentation model, not the project analysis.

## Hover and selection

A hover tooltip shows a width-constrained, tail-preserving file path plus line count, import count, consumer count, and coverage when available. A long path truncates its beginning so the filename and nearest directories remain visible.

Clicking a project file node selects and visually highlights only that node. Selection opens a side panel containing:

- the complete path;
- line metrics;
- coverage when available;
- imported project files;
- consumer project files.

File entries in the side panel select their corresponding nodes. Clicking empty graph space or closing the panel clears selection.

Dependency-neighborhood highlighting, direction-specific emphasis, directory clustering, and focus modes belong to a later visualization and UX milestone.
