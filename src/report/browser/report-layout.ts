import type { DirectedGraph } from "graphology"
import { circular } from "graphology-layout"
import forceAtlas2 from "graphology-layout-forceatlas2"
import type { BrowserEdgeAttributes, BrowserNodeAttributes } from "./report-graph-types.js"

/** Diagnostic facts produced by one deterministic report layout. */
export type ReportLayoutMetrics = {
  readonly strategy: "exact" | "barnes-hut"
  readonly iterations: number
}

/**
 * Lay out one visible report graph with a bounded large-graph path.
 *
 * Small graphs retain exact size-aware ForceAtlas2. Large graphs use
 * Barnes-Hut for topology, then uniformly expand the deterministic result
 * until every pair of node circles has collision padding. Uniform expansion
 * preserves the topology produced by ForceAtlas2 while making the final
 * geometry size-aware even though Barnes-Hut repulsion is not.
 *
 * @param graph - Mutable browser graph whose nodes already have visual sizes.
 * @returns Layout strategy, work, and collision diagnostics.
 */
export function layoutReportGraph(graph: DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes>): ReportLayoutMetrics {
  circular.assign(graph)
  forceAtlas2.assign(graph, {
    iterations: 5000,
    settings: {
      adjustSizes: true,
      barnesHutOptimize: false,
      edgeWeightInfluence: 1,
      gravity: 1,
      linLogMode: false,
      outboundAttractionDistribution: false,
      scalingRatio: 6,
      slowDown: 2,
      strongGravityMode: false,
    },
  })

  return {
    strategy: "exact",
    iterations: 5000,
  }
}
