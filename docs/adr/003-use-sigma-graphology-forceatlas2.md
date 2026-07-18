# Use Sigma, Graphology, And ForceAtlas2

## Status

Accepted.

## Context

The report needs an interactive 2D directed graph with node size based on line count, automatic repulsion, collision avoidance, pan, zoom, hover, and selection. Codebases may contain thousands of files and edges, so browser rendering efficiency matters.

React Flow was considered, but its primary abstraction is an editable node-based UI and it delegates force layout to another library. Cytoscape.js offers an integrated graph and layout ecosystem and remains a credible alternative, especially for compound graphs. D3-force offers low-level control but would require Show Me to build more rendering and interaction infrastructure.

Sigma.js focuses on large interactive graph rendering through WebGL. It uses Graphology as its graph model, and Graphology's ForceAtlas2 implementation provides force-directed layout with an optional node-size-aware mode.

## Decision

Use a stable Sigma.js release for browser rendering, Graphology for the directed presentation graph, and Graphology ForceAtlas2 for initial automatic layout.

Do not introduce React initially. Implement the constrained tooltip and selection side panel with browser APIs around Sigma.

Keep renderer-neutral node and edge facts in the presentation layer. Keep Graphology nodes, layout coordinates, Sigma styles, and interaction state in the browser renderer. None of them belong in the language-neutral project analysis.

The initial graph is flat and has no persistent labels. Directory grouping, dependency-neighborhood emphasis, and richer focus controls are later UX work.

## Consequences

The renderer starts with GPU-backed graph rendering, a purpose-built graph data structure, and a force layout that matches the intended coarse, aerated visual style. Avoiding React keeps the first browser bundle and state model smaller.

Show Me must implement its own tooltip, side panel, accessibility behavior, and any future application-level controls. Three cooperating libraries must be versioned and tested together. If compound directory visualization becomes central, the team may need to revisit Cytoscape.js or add a different layout without changing the analysis contract.

### 2026-07-16 collision-safety amendment

ForceAtlas2's Barnes-Hut implementation does not include individual node radii in its optimized repulsion path, even when size adjustment is enabled. On graphs above the former optimization threshold, large project-file nodes could therefore cover smaller neighbors.

The initial implementation keeps Barnes-Hut disabled and runs a deterministic exact size-aware layout with collision padding. The presentation stores separate collision and rendered radii so layout padding does not change the line-count-to-size contract. Sigma renders sizes relative to layout positions and fits a custom bounding box that includes node radii, keeping the collision geometry and rendered geometry in the same coordinate system.

This is a correctness-first refinement of the accepted library choice, not a new layout architecture. Exact repulsion is quadratic per iteration: a 1,000-node synthetic layout took approximately 1.96 seconds on the development machine. Milestone 011 must profile the complete product and replace this path only with a measured optimization that preserves size-aware collision safety.

### 2026-07-16 interactive-sizing amendment

The deterministic collision-safe ForceAtlas2 operation is shared by initial presentation construction and browser report-view transitions. Selecting a different non-empty combination of code, comment, and blank line metrics changes rendered radii, so the browser recomputes coordinates and its radius-aware bounding box instead of retaining geometry created for stale sizes.

This keeps layout and interaction state in the presentation and renderer layers as originally decided. The shared fixed seed makes returning to an earlier visible graph and size selection reproduce identical geometry. Future visibility controls, beginning with external packages, reuse the same report-view transition rather than introducing independent graph mutation paths.

### 2026-07-16 visible-subgraph amendment

External packages are embedded in the presentation but hidden initially. The browser report-view transition rebuilds one Graphology graph from only the currently visible typed nodes and edges before running the shared layout. Hidden package facts therefore cannot influence default project-file geometry, while enabling packages and changing line categories remain composable dimensions of the same deterministic state transition.

Synthetic package nodes use a fixed collision and rendered size. The renderer clears package hover or selection when packages become hidden and exposes package identity through DOM text in addition to color. This extends the existing flat graph and application-control responsibility without changing the chosen rendering or layout libraries.

### 2026-07-18 browser-layout simplification amendment

The browser renderer now owns all layout coordinates. The embedded analysis contains deterministic project files and dependency facts; the browser derives presentation nodes and edges without positions or separate collision radii. On initial load and every report-view transition, the browser rebuilds the visible Graphology subgraph, uses circular layout to provide deterministic non-degenerate starting coordinates, then runs a synchronous 5,000-iteration ForceAtlas2 pass.

Sigma interprets node sizes relative to layout positions, matching the coordinate system used by ForceAtlas2's size adjustment. Barnes-Hut remains disabled for radius-aware exact repulsion. Sigma now fits the resulting Graphology extent directly; the removed shared layout module, collision padding, fixed random seed, and custom radius-aware bounding box described by the earlier amendments are no longer part of the implementation.

The browser's one report-view transition remains the ownership boundary for line-category sizing, package visibility, selection and hover reconciliation, relationship filtering, and layout. This amendment supersedes the earlier amendments only where they describe the removed shared layout implementation.
