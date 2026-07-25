import type { DirectedGraph } from "graphology"
import { circular } from "graphology-layout"
import forceAtlas2 from "graphology-layout-forceatlas2"
import type { BrowserEdgeAttributes, BrowserNodeAttributes } from "./report-graph-types.js"

const EXACT_LAYOUT_NODE_LIMIT = 200
const EXACT_LAYOUT_ITERATIONS = 500
const APPROXIMATE_LAYOUT_ITERATIONS = 250
const COLLISION_PADDING = 1

/** Diagnostic facts produced by one deterministic report layout. */
export type ReportLayoutMetrics = {
  readonly strategy: "exact" | "barnes-hut"
  readonly iterations: number
  readonly collisionScale: number
  readonly minimumClearance: number | undefined
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
  const approximate = graph.order > EXACT_LAYOUT_NODE_LIMIT
  const iterations = approximate ? APPROXIMATE_LAYOUT_ITERATIONS : EXACT_LAYOUT_ITERATIONS
  forceAtlas2.assign(graph, {
    iterations,
    settings: {
      adjustSizes: !approximate,
      barnesHutOptimize: approximate,
      barnesHutTheta: 0.5,
      edgeWeightInfluence: 1,
      gravity: 1,
      linLogMode: false,
      outboundAttractionDistribution: false,
      scalingRatio: 6,
      slowDown: 2,
      strongGravityMode: false,
    },
  })

  const collisionScale = applyCollisionScale(graph)
  return {
    strategy: approximate ? "barnes-hut" : "exact",
    iterations,
    collisionScale,
    minimumClearance: minimumNodeClearance(graph),
  }
}

function applyCollisionScale(graph: DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes>): number {
  const nodes = graph.nodes()
  if (nodes.length < 2) {
    return 1
  }

  const center = nodes.reduce(
    (total, node) => {
      const attributes = graph.getNodeAttributes(node)
      return { x: total.x + attributes.x, y: total.y + attributes.y }
    },
    { x: 0, y: 0 },
  )
  center.x /= nodes.length
  center.y /= nodes.length

  let collisionScale = 1
  for (const [index, left] of nodes.entries()) {
    const leftAttributes = graph.getNodeAttributes(left)
    for (const right of nodes.slice(index + 1)) {
      const rightAttributes = graph.getNodeAttributes(right)
      const distance = Math.hypot(leftAttributes.x - rightAttributes.x, leftAttributes.y - rightAttributes.y)
      const requiredDistance = leftAttributes.size + rightAttributes.size + COLLISION_PADDING
      if (distance === 0) {
        throw new Error(`Layout produced coincident graph nodes ${JSON.stringify(left)} and ${JSON.stringify(right)}.`)
      }
      collisionScale = Math.max(collisionScale, requiredDistance / distance)
    }
  }

  if (collisionScale > 1) {
    graph.updateEachNodeAttributes((_node, attributes) => ({
      ...attributes,
      x: center.x + (attributes.x - center.x) * collisionScale,
      y: center.y + (attributes.y - center.y) * collisionScale,
    }))
  }
  return collisionScale
}

function minimumNodeClearance(graph: DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes>): number | undefined {
  const nodes = graph.nodes()
  let minimumClearance: number | undefined
  for (const [index, left] of nodes.entries()) {
    const leftAttributes = graph.getNodeAttributes(left)
    for (const right of nodes.slice(index + 1)) {
      const rightAttributes = graph.getNodeAttributes(right)
      const clearance =
        Math.hypot(leftAttributes.x - rightAttributes.x, leftAttributes.y - rightAttributes.y) - leftAttributes.size - rightAttributes.size
      minimumClearance = minimumClearance === undefined ? clearance : Math.min(minimumClearance, clearance)
    }
  }
  return minimumClearance
}
