import { DirectedGraph } from "graphology"

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

  for (const node of nodes) {
    graph.addNode(node.id, {
      size: node.size + NODE_LAYOUT_PADDING,
      renderedSize: node.size,
      x: 0,
      y: 0,
    })
  }
  for (const edge of edges) {
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target)
  }

  return graph.mapNodes((id, attributes) => ({ id, size: attributes.renderedSize, x: attributes.x, y: attributes.y }))
}
