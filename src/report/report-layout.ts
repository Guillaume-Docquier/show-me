import { createRng, mulberry32Prng } from "@guillaume-docquier/tools-ts"
import { DirectedGraph } from "graphology"
import forceAtlas2 from "graphology-layout-forceatlas2"

const LAYOUT_SEED = 1_984_091
const LAYOUT_ITERATIONS = 500
const NODE_LAYOUT_PADDING = 4

/**
 * A node whose renderer size must be laid out without collisions.
 */
export type ReportLayoutNodeInput = {
  readonly id: string
  readonly size: number
}

/**
 * A directed edge that influences report layout.
 */
export type ReportLayoutEdgeInput = {
  readonly id: string
  readonly source: string
  readonly target: string
}

/**
 * Deterministic renderer-neutral node geometry.
 */
export type ReportLayoutNode = ReportLayoutNodeInput & {
  readonly x: number
  readonly y: number
}

type LayoutNodeAttributes = {
  readonly size: number
  readonly renderedSize: number
  x: number
  y: number
}

/**
 * Lay out report nodes deterministically with rendered-size-aware collision spacing.
 *
 * @param nodes - Visible report nodes and their renderer sizes.
 * @param edges - Visible directed edges between those nodes.
 * @returns Geometry in the same order as the input nodes.
 */
export function layoutReportGraph(
  nodes: readonly ReportLayoutNodeInput[],
  edges: readonly ReportLayoutEdgeInput[],
): readonly ReportLayoutNode[] {
  const graph = new DirectedGraph<LayoutNodeAttributes>()
  const random = createRng(mulberry32Prng(LAYOUT_SEED))

  for (const node of nodes) {
    graph.addNode(node.id, {
      size: node.size + NODE_LAYOUT_PADDING,
      renderedSize: node.size,
      x: random.float() * 2 - 1,
      y: random.float() * 2 - 1,
    })
  }
  for (const edge of edges) {
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target)
  }

  if (graph.order === 1) {
    const onlyNode = graph.nodes()[0]
    if (onlyNode !== undefined) {
      graph.setNodeAttribute(onlyNode, "x", 0)
      graph.setNodeAttribute(onlyNode, "y", 0)
    }
  } else if (graph.order > 1) {
    forceAtlas2.assign(graph, {
      iterations: LAYOUT_ITERATIONS,
      settings: {
        adjustSizes: true,
        // ForceAtlas2's Barnes-Hut branch does not include node radii in its repulsion calculation.
        barnesHutOptimize: false,
        gravity: 1,
        scalingRatio: 4,
        slowDown: 1,
      },
    })
  }

  return nodes.map((node) => {
    const attributes = graph.getNodeAttributes(node.id)
    return { id: node.id, size: attributes.renderedSize, x: attributes.x, y: attributes.y }
  })
}
