# 003 Static Visualization

## Status

Complete.

## Outcome

Running `show-me` generates one offline HTML report containing an automatically spaced file graph with hover and selected-file details.

## Tasks

- [x] Build a presentation model from internal analysis without leaking renderer types into analysis.
- [x] Embed browser JavaScript, CSS, and presentation data in one HTML file.
- [x] Render project files with Sigma.js over a directed Graphology graph.
- [x] Apply deterministic ForceAtlas2 layout with node-size-aware spacing.
- [x] Make node area proportional to the active line count.
- [x] Add pan, zoom, constrained hover tooltips, selection, and the file detail side panel.
- [x] Preserve filenames when truncating long tooltip paths.
- [x] Highlight only the selected node and support selection through side-panel file entries.
- [x] Implement CLI defaults, output overwrite, completion path, and elapsed-time output.
- [x] Keep the command from opening a browser.

## Required tests

- [x] Report-builder tests prove the output is self-contained and source file contents are not embedded.
- [x] CLI integration tests cover default and explicit project paths, explicit output paths, overwrite behavior, and failure reporting.
- [x] Presentation tests prove node area scaling, deterministic initial data, and tail-preserving path truncation.
- [x] A real-browser interaction test covers hover, select, side-panel navigation, and clearing selection.
- [x] Visual fixtures use fixed layout seeds and viewport dimensions.

## Verification evidence

- `pnpm format:fix`: 83 files formatted successfully.
- `pnpm lint`: passed with zero warnings.
- `pnpm typecheck`: passed.
- `pnpm test`: 10 files and 26 tests passed.
- `pnpm build`: Node CLI built and the Sigma browser bundle was produced at 355.1 KB.
- `pnpm test:browser`: fixed 1280 × 800 Chromium test passed hover, selection, clearing, and side-panel navigation.
- `node dist/cli/entry.cli.js fixtures/projects/minimal-javascript --output show-me-phase3-smoke.html`: wrote a 368,682-byte offline report in 3.3 ms; inspection found no external script or HTTP references.

## Discovered gaps

- Project dependency edges remain empty until static runtime ESM analysis is implemented in milestone 004.
- Coverage discovery and `--coverage` import remain owned by milestone 005; an explicit coverage option currently returns a clear unsupported-feature error.
- Dependency-neighborhood emphasis and richer graph navigation remain owned by milestone 010.
- ForceAtlas2 currently runs a fixed synchronous iteration count. Milestone 011 owns profiling and large-graph layout optimization.
