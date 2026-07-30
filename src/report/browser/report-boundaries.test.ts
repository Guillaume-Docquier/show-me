import { describe, expect, it } from "vitest"
import {
  boundaryCellId,
  deriveBoundaryDrillDown,
  deriveBoundaryLensResults,
  type BoundaryCell,
  type BoundaryFilterState,
} from "./report-boundaries.js"
import type { ReportScopeState } from "./report-lens.js"
import type { BrowserPresentation, ReportEdge, ReportProjectFileNode } from "./report-presentation.js"

describe("Boundary lens", () => {
  it("derives ordered workspace boundaries with root files and directed counts", () => {
    // Arrange
    const presentation = makePresentation(
      [file("root.ts", "."), file("apps/web/src/main.ts", "apps/web"), file("apps/api/src/server.ts", "apps/api")],
      [
        edge("web-api-runtime", "apps/web/src/main.ts", "apps/api/src/server.ts", "runtime"),
        edge("api-web-type", "apps/api/src/server.ts", "apps/web/src/main.ts", "type-only"),
        edge("api-api-runtime", "apps/api/src/server.ts", "apps/api/src/server.ts", "runtime"),
        edge("root-web", "root.ts", "apps/web/src/main.ts", "runtime"),
      ],
      [
        { path: ".", name: "root" },
        { path: "apps/web", name: "web" },
        { path: "apps/api", name: "api" },
      ],
    )

    // Act
    const results = deriveBoundaryLensResults(presentation, scope(".", "apps/web", "apps/api"), allRelationships())

    // Assert
    expect(results.boundaries.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "workspace:apps/api", label: "api" },
      { id: "workspace:apps/web", label: "web" },
      { id: "root-files", label: "(root files)" },
    ])
    expect(cell(results, "workspace:apps/web", "workspace:apps/api")).toMatchObject({ runtimeCount: 1, typeOnlyCount: 0 })
    expect(cell(results, "workspace:apps/api", "workspace:apps/web")).toMatchObject({ runtimeCount: 0, typeOnlyCount: 1 })
    expect(cell(results, "workspace:apps/api", "workspace:apps/api")).toMatchObject({ runtimeCount: 1, typeOnlyCount: 0 })
    expect(results.relationshipCount).toBe(4)
  })

  it("derives secondary directory boundaries inside one selected workspace", () => {
    // Arrange
    const presentation = makePresentation(
      [
        file("apps/web/index.ts", "apps/web"),
        file("apps/web/components/button.ts", "apps/web"),
        file("apps/web/routes/home.ts", "apps/web"),
        file("apps/api/src/server.ts", "apps/api"),
      ],
      [],
      [
        { path: "apps/web", name: "web" },
        { path: "apps/api", name: "api" },
      ],
    )

    // Act
    const results = deriveBoundaryLensResults(presentation, scope("apps/web"), allRelationships())

    // Assert
    expect(results.boundaries.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "directory:apps/web:components", label: "components" },
      { id: "directory:apps/web:routes", label: "routes" },
      { id: "root-files:apps/web", label: "(root files)" },
    ])
  })

  it("uses first directories and a stable root-files boundary in a single-package project", () => {
    // Arrange
    const presentation = makePresentation([file("index.ts"), file("src/a.ts"), file("tests/a.test.ts")], [], [])

    // Act
    const results = deriveBoundaryLensResults(presentation, scope(), allRelationships())

    // Assert
    expect(results.boundaries.map(({ label }) => label)).toEqual(["src", "tests", "(root files)"])
  })

  it("preserves the first path character for a selected root workspace", () => {
    // Arrange
    const presentation = makePresentation(
      [file("src/a.ts", "."), file("benchmarks/run.ts", "."), file("index.ts", ".")],
      [],
      [{ path: ".", name: "root" }],
    )

    // Act
    const results = deriveBoundaryLensResults(presentation, scope("."), allRelationships())

    // Assert
    expect(results.boundaries.map(({ label }) => label)).toEqual(["benchmarks", "src", "(root files)"])
  })

  it("composes empty workspace scope and relationship-kind filters", () => {
    // Arrange
    const presentation = makePresentation(
      [file("apps/a/src/a.ts", "apps/a"), file("apps/b/src/b.ts", "apps/b")],
      [edge("runtime", "apps/a/src/a.ts", "apps/b/src/b.ts", "runtime"), edge("type", "apps/a/src/a.ts", "apps/b/src/b.ts", "type-only")],
      [
        { path: "apps/a", name: "a" },
        { path: "apps/b", name: "b" },
      ],
    )

    // Act
    const empty = deriveBoundaryLensResults(presentation, scope(), allRelationships())
    const runtime = deriveBoundaryLensResults(presentation, scope("apps/a", "apps/b"), {
      runtimeDependencies: true,
      typeOnlyDependencies: false,
    })

    // Assert
    expect(empty.boundaries).toEqual([])
    expect(empty.relationshipCount).toBe(0)
    expect(runtime.relationshipCount).toBe(1)
    expect(runtime.runtimeCount).toBe(1)
    expect(runtime.typeOnlyCount).toBe(0)
  })

  it("uses every aggregate relationship unchanged in exact boundary and pair drill-down", () => {
    // Arrange
    const presentation = makePresentation(
      [file("src/a.ts"), file("src/b.ts"), file("tests/a.test.ts")],
      [
        edge("internal-runtime", "src/a.ts", "src/b.ts", "runtime"),
        edge("cross-runtime", "src/a.ts", "tests/a.test.ts", "runtime"),
        edge("cross-type", "src/b.ts", "tests/a.test.ts", "type-only"),
      ],
      [],
    )
    const results = deriveBoundaryLensResults(presentation, scope(), allRelationships())

    // Act
    const boundary = deriveBoundaryDrillDown(results, { kind: "boundary", boundaryId: "directory:src" })
    const pair = deriveBoundaryDrillDown(results, {
      kind: "pair",
      sourceBoundaryId: "directory:src",
      targetBoundaryId: "directory:tests",
    })

    // Assert
    expect(boundary?.relationships.map(({ edgeId }) => edgeId)).toEqual(["internal-runtime"])
    expect(pair?.relationships.map(({ edgeId }) => edgeId)).toEqual(["cross-runtime", "cross-type"])
    expect(pair?.relationships).toHaveLength(cell(results, "directory:src", "directory:tests").relationships.length)
  })
})

function cell(results: ReturnType<typeof deriveBoundaryLensResults>, source: string, target: string): BoundaryCell {
  const result = results.cellById.get(boundaryCellId(source, target))
  if (result === undefined) {
    throw new Error(`Missing boundary cell ${source} to ${target}.`)
  }
  return result
}

function makePresentation(
  nodes: readonly ReportProjectFileNode[],
  edges: readonly ReportEdge[],
  workspacePackages: BrowserPresentation["workspacePackages"],
): BrowserPresentation {
  return { projectName: "boundaries", workspacePackages, nodes, edges }
}

function file(path: string, workspacePackage?: string): ReportProjectFileNode {
  return {
    id: `project-file:${path}`,
    kind: "project-file",
    displayName: path,
    path,
    workspacePackage,
    lineMetrics: { code: 1, comment: 0, blank: 0 },
    coverage: undefined,
    color: "#111111",
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

function scope(...workspacePackages: readonly string[]): ReportScopeState {
  return { workspacePackages: new Set(workspacePackages) }
}

function allRelationships(): BoundaryFilterState {
  return { runtimeDependencies: true, typeOnlyDependencies: true }
}
