import { performance } from "node:perf_hooks"
import { DirectedGraph } from "graphology"
import { describe, expect, it } from "vitest"
import type { BrowserEdgeAttributes, BrowserNodeAttributes } from "./report-graph-types.js"
import { layoutReportGraph } from "./report-layout.js"

describe("layoutReportGraph", () => {
  it("uses exact size-aware layout for an ordinary graph", () => {
    // Arrange
    const graph = buildGraph(12)

    // Act
    const metrics = layoutReportGraph(graph)

    // Assert
    expect(metrics).toEqual({
      strategy: "exact",
      iterations: 500,
      collisionScale: expect.any(Number),
      minimumClearance: expect.any(Number),
    })
    expectNoNodeIntersections(graph)
  })

  it("keeps a deterministic 300-node sentinel collision-free within a stable coarse budget", () => {
    // Arrange
    const first = buildGraph(300)
    const second = buildGraph(300)

    // Act
    const startedAt = performance.now()
    const firstMetrics = layoutReportGraph(first)
    const durationMilliseconds = performance.now() - startedAt
    const secondMetrics = layoutReportGraph(second)

    // Assert
    expect(firstMetrics.strategy).toBe("barnes-hut")
    expect(firstMetrics.iterations).toBe(250)
    expect(firstMetrics.minimumClearance).toBeGreaterThanOrEqual(0.999)
    expect(secondMetrics).toEqual(firstMetrics)
    expect(graphPositions(second)).toEqual(graphPositions(first))
    expectNoNodeIntersections(first)
    expect(durationMilliseconds).toBeLessThan(5_000)
  })
})

function buildGraph(nodeCount: number): DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes> {
  const graph = new DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes>()
  for (let index = 0; index < nodeCount; index += 1) {
    graph.addNode(`node-${String(index).padStart(4, "0")}`, {
      x: 0,
      y: 0,
      size: 4 + (index % 23),
      color: "#000000",
      nodeKind: "project-file",
    })
  }
  for (let index = 0; index < nodeCount; index += 1) {
    graph.addDirectedEdgeWithKey(
      `edge-${index}`,
      `node-${String(index).padStart(4, "0")}`,
      `node-${String((index + 1) % nodeCount).padStart(4, "0")}`,
      {
        edgeKind: "dependency",
        dependencyTargetKind: "project-file",
        dependencyKind: "runtime",
        weight: 1,
      },
    )
  }
  return graph
}

function graphPositions(
  graph: DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes>,
): ReadonlyArray<{ readonly id: string; readonly x: number; readonly y: number }> {
  return graph.nodes().map((id) => {
    const { x, y } = graph.getNodeAttributes(id)
    return { id, x, y }
  })
}

function expectNoNodeIntersections(graph: DirectedGraph<BrowserNodeAttributes, BrowserEdgeAttributes>): void {
  const nodes = graph.nodes()
  for (const [index, left] of nodes.entries()) {
    const leftAttributes = graph.getNodeAttributes(left)
    for (const right of nodes.slice(index + 1)) {
      const rightAttributes = graph.getNodeAttributes(right)
      const distance = Math.hypot(leftAttributes.x - rightAttributes.x, leftAttributes.y - rightAttributes.y)
      expect(distance, `${left} intersects ${right}`).toBeGreaterThanOrEqual(leftAttributes.size + rightAttributes.size)
    }
  }
}
