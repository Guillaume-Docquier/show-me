# Structure-First Layout Spike

## Status

Experimental. This spike is isolated from `main` and does not amend the accepted
visualization ADRs.

## Question

Can the report make project structure the stable visual baseline and overlay
dependencies afterward, so unusual cross-folder dependencies stand out instead
of pulling the graph into dependency-driven clusters?

## Prototype

The browser derives a directory tree from the visible project-file paths and
adds synthetic directory nodes to the same Graphology graph as the files. The
root directory links to root files and child directories; every other directory
does the same recursively. This creates a structural spanning tree with one
edge per non-root graph node.

ForceAtlas2 positions the combined graph. Structural edges have weight `6`,
while project-file dependency edges have weight `0.25`. The resulting 24:1
ratio makes containment the primary attraction without making dependencies
irrelevant. External-package dependency edges use weight `1.2`: packages are
not assigned to a synthetic directory, so they remain free-floating but stay
near the files that import them.

The presentation keeps these two meanings separate:

- directory nodes are labeled, muted anchors;
- structural edges are thin, faint, dotted, and have no arrowhead;
- dependency edges remain solid, colored, directed arrows.

The structural edges are hidden from Sigma's normal edge renderer and drawn on
a browser-owned canvas behind the dependency arrows. They still participate in
ForceAtlas2 through their graph weight.

## Dogfood Result

The generated report for this worktree contains 92 project files, 45 directory
nodes, 136 structural edges, and 49 project-file dependency arrows. The
structure tree therefore accounts for every file and every non-root directory,
without creating directory boxes or a separate packing system.

A numerical check of the final 5,000-iteration layout found no intersecting
node circles and 9.4 graph units of minimum clearance. Structural edges average
72.2 units long, compared with 92 units for dependency edges, which is
consistent with structure providing the tighter local attraction.

The force graph keeps neighboring directories and their files as recognizable
regions while leaving enough dependency influence for connected regions to
move toward one another. Long dependency arrows now read as cross-structure
coupling rather than being the sole cause of clustering.

## Trade-Offs And Follow-Up Questions

- Directory nodes increase graph order and ForceAtlas2 work. Large-codebase
  profiling should cover the cost of thousands of files and directories.
- Deep single-child folder chains create several directory nodes. A production
  version may collapse those chains into one labeled structural anchor.
- Always-visible directory labels can still become dense in deeply nested
  projects; zoom-aware label thresholds may be preferable after the concept is
  validated.
- The 24:1 attraction ratio is intentionally empirical. It should be exercised
  on projects with different folder depth and dependency density before it
  becomes a product default.
- A production decision should consider whether structure-first becomes the
  default or remains an optional comparison mode beside dependency layout.
- Dependency-distance highlighting can be layered on later, once the spatial
  model itself is trusted; this spike deliberately avoids declaring an edge
  suspicious based only on a threshold.
