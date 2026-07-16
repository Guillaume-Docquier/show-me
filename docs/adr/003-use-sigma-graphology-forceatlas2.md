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

Keep Graphology nodes, layout coordinates, Sigma styles, and interaction state in the presentation and renderer layers. They do not belong in the language-neutral project analysis.

The initial graph is flat and has no persistent labels. Directory grouping, dependency-neighborhood emphasis, and richer focus controls are later UX work.

## Consequences

The renderer starts with GPU-backed graph rendering, a purpose-built graph data structure, and a force layout that matches the intended coarse, aerated visual style. Avoiding React keeps the first browser bundle and state model smaller.

Show Me must implement its own tooltip, side panel, accessibility behavior, and any future application-level controls. Three cooperating libraries must be versioned and tested together. If compound directory visualization becomes central, the team may need to revisit Cytoscape.js or add a different layout without changing the analysis contract.

### 2026-07-16 collision-safety amendment

ForceAtlas2's Barnes-Hut implementation does not include individual node radii in its optimized repulsion path, even when size adjustment is enabled. On graphs above the former optimization threshold, large project-file nodes could therefore cover smaller neighbors.

The initial implementation keeps Barnes-Hut disabled and runs a deterministic exact size-aware layout with collision padding. The presentation stores separate collision and rendered radii so layout padding does not change the line-count-to-size contract. Sigma renders sizes relative to layout positions and fits a custom bounding box that includes node radii, keeping the collision geometry and rendered geometry in the same coordinate system.

This is a correctness-first refinement of the accepted library choice, not a new layout architecture. Exact repulsion is quadratic per iteration: a 1,000-node synthetic layout took approximately 1.96 seconds on the development machine. Milestone 011 must profile the complete product and replace this path only with a measured optimization that preserves size-aware collision safety.
