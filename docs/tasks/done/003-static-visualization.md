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
- [x] Keep large project-file nodes from overlapping smaller nodes.
- [x] Scale node size logarithmically with the active line count so ordinary files remain visually comparable.
- [x] Add pan, zoom, constrained hover tooltips, selection, and the file detail side panel.
- [x] Position hover tooltips near the pointer and keep them inside the viewport.
- [x] Preserve filenames when truncating long tooltip paths.
- [x] Highlight only the selected node and support selection through side-panel file entries.
- [x] Implement CLI defaults, output overwrite, completion path, and elapsed-time output.
- [x] Keep the command from opening a browser.

## Required tests

- [x] Report-builder tests prove the output is self-contained and source file contents are not embedded.
- [x] CLI integration tests cover default and explicit project paths, explicit output paths, overwrite behavior, and failure reporting.
- [x] Presentation tests prove representative node sizes, deterministic initial data, tail-preserving path truncation, and collision-free placement beyond the former 100-node optimization threshold.
- [x] A real-browser interaction test covers hover, pointer-relative tooltip placement, unclipped tail-preserving paths, selection, side-panel navigation, and clearing selection.
- [x] Visual fixtures use fixed layout seeds and viewport dimensions.

## Verification evidence

- `pnpm format:fix`: passed.
- `pnpm lint`: passed with zero warnings.
- `pnpm typecheck`: passed.
- `pnpm test`: 10 files and 28 tests passed.
- `pnpm build`: Node CLI built and the Sigma browser bundle was produced at 357.2 KB.
- `pnpm test:browser`: fixed 1280 x 800 Chromium test passed hover, tooltip positioning and truncation, selection, clearing, and side-panel navigation.
- `node dist/cli/entry.cli.js ../text-based-browser-game-1/`: generated a 182-node report in 114.5 ms with no node-circle intersections; the nearest pair retained approximately 9.25 layout units of clearance.
- A 1,000-node synthetic ForceAtlas2 layout completed in approximately 1.96 seconds on the development machine. This is diagnostic evidence, not a performance budget.

## Discovered gaps

- Project dependency edges remain empty until static runtime ESM analysis is implemented in milestone 004.
- Coverage discovery and `--coverage` import remain owned by milestone 005; an explicit coverage option currently returns a clear unsupported-feature error.
- Dependency-neighborhood emphasis and richer graph navigation remain owned by milestone 010.
- Collision-safe ForceAtlas2 currently uses a fixed synchronous exact-repulsion pass because the library's Barnes-Hut path ignores node radii. Milestone 011 owns profiling and a size-aware large-graph optimization.
