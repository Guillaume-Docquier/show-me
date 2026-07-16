# 003 Static Visualization

## Status

Not started.

## Outcome

Running `show-me` generates one offline HTML report containing an automatically spaced file graph with hover and selected-file details.

## Tasks

- [ ] Build a presentation model from internal analysis without leaking renderer types into analysis.
- [ ] Embed browser JavaScript, CSS, and presentation data in one HTML file.
- [ ] Render project files with Sigma.js over a directed Graphology graph.
- [ ] Apply deterministic ForceAtlas2 layout with node-size-aware spacing.
- [ ] Make node area proportional to the active line count.
- [ ] Add pan, zoom, constrained hover tooltips, selection, and the file detail side panel.
- [ ] Preserve filenames when truncating long tooltip paths.
- [ ] Highlight only the selected node and support selection through side-panel file entries.
- [ ] Implement CLI defaults, output overwrite, completion path, and elapsed-time output.
- [ ] Keep the command from opening a browser.

## Required tests

- [ ] Report-builder tests prove the output is self-contained and source file contents are not embedded.
- [ ] CLI integration tests cover default and explicit project paths, explicit output paths, overwrite behavior, and failure reporting.
- [ ] Presentation tests prove node area scaling, deterministic initial data, and tail-preserving path truncation.
- [ ] A real-browser interaction test covers hover, select, side-panel navigation, and clearing selection.
- [ ] Visual fixtures use fixed layout seeds and viewport dimensions.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

None yet.
