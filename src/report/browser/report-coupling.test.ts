import { describe, expect, it } from "vitest"
import { deriveCouplingLensResults, type CouplingFilterState } from "./report-coupling.js"
import type { BrowserPresentation, ReportEdge, ReportProjectFileNode } from "./report-presentation.js"

describe("Coupling lens", () => {
  it("derives direct degree, runtime/type-only splits, self edges, and stable ranking", () => {
    // Arrange
    const presentation = couplingPresentation(
      [file("a.ts"), file("b.ts"), file("c.ts"), file("isolated.ts")],
      [
        edge("runtime-a-b", "a.ts", "b.ts", "runtime"),
        edge("duplicate-a-b", "a.ts", "b.ts", "runtime"),
        edge("type-a-b", "a.ts", "b.ts", "type-only"),
        edge("type-b-a", "b.ts", "a.ts", "type-only"),
        edge("self-c", "c.ts", "c.ts", "runtime"),
      ],
    )

    // Act
    const results = deriveCouplingLensResults(presentation, { workspacePackages: new Set() }, allRelationships())

    // Assert
    expect(results.metrics).toEqual([
      {
        nodeId: "project-file:a.ts",
        path: "a.ts",
        fanOut: 1,
        fanIn: 1,
        totalDegree: 2,
        runtimeFanOut: 1,
        runtimeFanIn: 0,
        typeOnlyFanOut: 0,
        typeOnlyFanIn: 1,
        cycleIds: [expect.stringContaining("includes-type-only")],
      },
      {
        nodeId: "project-file:b.ts",
        path: "b.ts",
        fanOut: 1,
        fanIn: 1,
        totalDegree: 2,
        runtimeFanOut: 0,
        runtimeFanIn: 1,
        typeOnlyFanOut: 1,
        typeOnlyFanIn: 0,
        cycleIds: [expect.stringContaining("includes-type-only")],
      },
      {
        nodeId: "project-file:c.ts",
        path: "c.ts",
        fanOut: 1,
        fanIn: 1,
        totalDegree: 2,
        runtimeFanOut: 1,
        runtimeFanIn: 1,
        typeOnlyFanOut: 0,
        typeOnlyFanIn: 0,
        cycleIds: [expect.stringContaining("runtime")],
      },
      {
        nodeId: "project-file:isolated.ts",
        path: "isolated.ts",
        fanOut: 0,
        fanIn: 0,
        totalDegree: 0,
        runtimeFanOut: 0,
        runtimeFanIn: 0,
        typeOnlyFanOut: 0,
        typeOnlyFanIn: 0,
        cycleIds: [],
      },
    ])
    expect(results.edges.map(({ id }) => id)).toEqual(["runtime-a-b", "type-b-a", "self-c"])
  })

  it("updates metrics and cycles consistently for runtime and type-only filters", () => {
    // Arrange
    const presentation = couplingPresentation(
      [file("a.ts"), file("b.ts"), file("c.ts")],
      [
        edge("a-b", "a.ts", "b.ts", "runtime"),
        edge("b-a", "b.ts", "a.ts", "runtime"),
        edge("b-c", "b.ts", "c.ts", "type-only"),
        edge("c-b", "c.ts", "b.ts", "type-only"),
      ],
    )

    // Act
    const runtime = deriveCouplingLensResults(
      presentation,
      { workspacePackages: new Set() },
      {
        runtimeDependencies: true,
        typeOnlyDependencies: false,
        showBackgroundDependencies: false,
      },
    )
    const typeOnly = deriveCouplingLensResults(
      presentation,
      { workspacePackages: new Set() },
      {
        runtimeDependencies: false,
        typeOnlyDependencies: true,
        showBackgroundDependencies: false,
      },
    )

    // Assert
    expect(runtime.cycles.map(({ kind, memberPaths }) => ({ kind, memberPaths }))).toEqual([
      { kind: "runtime", memberPaths: ["a.ts", "b.ts"] },
    ])
    expect(typeOnly.cycles.map(({ kind, memberPaths }) => ({ kind, memberPaths }))).toEqual([
      { kind: "includes-type-only", memberPaths: ["b.ts", "c.ts"] },
    ])
    expect(runtime.metricByNodeId.get("project-file:c.ts")?.totalDegree).toBe(0)
    expect(typeOnly.metricByNodeId.get("project-file:a.ts")?.totalDegree).toBe(0)
  })

  it("keeps direct relationships distinct from a transitive path", () => {
    // Arrange
    const presentation = couplingPresentation(
      [file("a.ts"), file("b.ts"), file("c.ts")],
      [edge("a-b", "a.ts", "b.ts", "runtime"), edge("b-c", "b.ts", "c.ts", "runtime")],
    )

    // Act
    const results = deriveCouplingLensResults(presentation, { workspacePackages: new Set() }, allRelationships())

    // Assert
    expect(results.metricByNodeId.get("project-file:a.ts")).toMatchObject({ fanOut: 1, fanIn: 0, totalDegree: 1 })
    expect(results.edges.some(({ source, target }) => source === "project-file:a.ts" && target === "project-file:c.ts")).toBe(false)
  })
})

function couplingPresentation(nodes: readonly ReportProjectFileNode[], edges: readonly ReportEdge[]): BrowserPresentation {
  return { projectName: "coupling", workspacePackages: [], nodes, edges }
}

function file(path: string): ReportProjectFileNode {
  return {
    id: `project-file:${path}`,
    kind: "project-file",
    displayName: path,
    path,
    workspacePackage: undefined,
    lineMetrics: { code: 100, comment: 0, blank: 0 },
    coverage: 50,
    color: "#000000",
    size: 1,
  }
}

function edge(id: string, source: string, target: string, dependencyKind: ReportEdge["dependencyKind"]): ReportEdge {
  return {
    id,
    source: `project-file:${source}`,
    target: `project-file:${target}`,
    targetKind: "project-file",
    dependencyKind,
  }
}

function allRelationships(): CouplingFilterState {
  return {
    runtimeDependencies: true,
    typeOnlyDependencies: true,
    showBackgroundDependencies: false,
  }
}
