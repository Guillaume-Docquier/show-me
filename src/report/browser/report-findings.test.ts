import { describe, expect, it } from "vitest"
import type { DependencyKind } from "../../analysis/project-analysis.js"
import { deriveReportFindings, type ReportFinding, type ReportFindingCategory } from "./report-findings.js"
import type { ReportScopeState } from "./report-lens.js"
import type { BrowserPresentation, ReportEdge, ReportProjectFileNode } from "./report-presentation.js"

describe("large-file findings", () => {
  it("uses the nearest-rank upper quartile and keeps zero separate from unavailable coverage", () => {
    // Arrange
    const presentation = presentationWith({
      files: [
        file("src/a.ts", 10, 100),
        file("src/b.ts", 20, 100),
        file("src/c.ts", 30, 100),
        file("src/d.ts", 40, 0),
        file("src/e.ts", 40, 60),
        file("src/f.ts", 50, 60),
        file("src/g.ts", 40, undefined),
        file("src/zero-code.ts", 0, 0),
      ],
    })

    // Act
    const findings = deriveReportFindings(presentation, allScope())

    // Assert
    expect(findingsOf(findings, "large-low-coverage")).toMatchObject([
      { entityName: "src/d.ts", codeLines: 40, coverage: 0 },
      { entityName: "src/f.ts", codeLines: 50, coverage: 60 },
      { entityName: "src/e.ts", codeLines: 40, coverage: 60 },
    ])
    expect(findingsOf(findings, "large-unavailable-coverage")).toMatchObject([{ entityName: "src/g.ts", codeLines: 40 }])
    expect(findings.flatMap(({ findings: categoryFindings }) => categoryFindings).map(({ entityName }) => entityName)).not.toContain(
      "src/zero-code.ts",
    )
  })
})

describe("fan findings", () => {
  it("ranks distinct visible relationships by total, runtime, then path while preserving kinds", () => {
    // Arrange
    const files = [
      file("src/a.ts", 10, 100),
      file("src/b.ts", 10, 100),
      file("src/c.ts", 10, 100),
      file("src/d.ts", 10, 100),
      file("src/e.ts", 10, 100),
    ]
    const presentation = presentationWith({
      files,
      edges: [
        edge("a-b", files[0], files[1], "runtime"),
        edge("a-c", files[0], files[2], "runtime"),
        edge("a-d", files[0], files[3], "type-only"),
        edge("b-c", files[1], files[2], "runtime"),
        edge("b-d", files[1], files[3], "type-only"),
        edge("e-c", files[4], files[2], "type-only"),
      ],
    })

    // Act
    const findings = deriveReportFindings(presentation, allScope())

    // Assert
    expect(findingsOf(findings, "highest-fan-out")).toMatchObject([
      { entityName: "src/a.ts", totalCount: 3, runtimeCount: 2, typeOnlyCount: 1 },
      { entityName: "src/b.ts", totalCount: 2, runtimeCount: 1, typeOnlyCount: 1 },
      { entityName: "src/e.ts", totalCount: 1, runtimeCount: 0, typeOnlyCount: 1 },
    ])
    expect(findingsOf(findings, "highest-fan-in")).toMatchObject([
      { entityName: "src/c.ts", totalCount: 3, runtimeCount: 2, typeOnlyCount: 1 },
      { entityName: "src/d.ts", totalCount: 2, runtimeCount: 0, typeOnlyCount: 2 },
      { entityName: "src/b.ts", totalCount: 1, runtimeCount: 1, typeOnlyCount: 0 },
    ])
  })
})

describe("dependency-cycle findings", () => {
  it("finds runtime, type-involved, and self cycles without duplicating runtime components", () => {
    // Arrange
    const files = [
      file("src/a.ts", 10, 100),
      file("src/b.ts", 10, 100),
      file("src/c.ts", 10, 100),
      file("src/d.ts", 10, 100),
      file("src/e.ts", 10, 100),
      file("src/f.ts", 10, 100),
      file("src/g.ts", 10, 100),
    ]
    const presentation = presentationWith({
      files,
      edges: [
        edge("a-b", files[0], files[1], "runtime"),
        edge("b-a", files[1], files[0], "runtime"),
        edge("c-c", files[2], files[2], "runtime"),
        edge("d-e", files[3], files[4], "type-only"),
        edge("e-f", files[4], files[5], "type-only"),
        edge("f-d", files[5], files[3], "type-only"),
        edge("f-g", files[5], files[6], "runtime"),
      ],
    })

    // Act
    const cycles = findingsOf(deriveReportFindings(presentation, allScope()), "dependency-cycles")

    // Assert
    expect(cycles).toMatchObject([
      {
        cycleKind: "runtime",
        memberPaths: ["src/a.ts", "src/b.ts"],
      },
      {
        cycleKind: "runtime",
        memberPaths: ["src/c.ts"],
      },
      {
        cycleKind: "includes-type-only",
        memberPaths: ["src/d.ts", "src/e.ts", "src/f.ts"],
      },
    ])
  })

  it("omits the cycle category for an acyclic graph", () => {
    // Arrange
    const source = file("src/source.ts", 10, 100)
    const target = file("src/target.ts", 10, 100)
    const presentation = presentationWith({
      files: [source, target],
      edges: [edge("source-target", source, target, "runtime")],
    })

    // Act
    const findings = deriveReportFindings(presentation, allScope())

    // Assert
    expect(findings.map(({ category }) => category)).not.toContain("dependency-cycles")
  })
})

describe("cross-workspace findings and scope", () => {
  it("groups directions and kinds, ranks by count and stable workspace names, and uses display names", () => {
    // Arrange
    const backendA = file("apps/backend/a.ts", 10, 100, "apps/backend")
    const backendB = file("apps/backend/b.ts", 10, 100, "apps/backend")
    const frontendA = file("apps/frontend/a.ts", 10, 100, "apps/frontend")
    const frontendB = file("apps/frontend/b.ts", 10, 100, "apps/frontend")
    const shared = file("packages/shared/index.ts", 10, 100, "packages/shared")
    const presentation = presentationWith({
      workspacePackages: [
        { path: "apps/backend", name: "@example/backend" },
        { path: "apps/frontend", name: "@example/frontend" },
        { path: "packages/shared", name: "@example/shared" },
      ],
      files: [backendA, backendB, frontendA, frontendB, shared],
      edges: [
        edge("backend-a-frontend-a", backendA, frontendA, "runtime"),
        edge("backend-b-frontend-b", backendB, frontendB, "runtime"),
        edge("frontend-a-shared", frontendA, shared, "runtime"),
        edge("frontend-b-shared", frontendB, shared, "type-only"),
      ],
    })

    // Act
    const findings = findingsOf(
      deriveReportFindings(presentation, scope("apps/backend", "apps/frontend", "packages/shared")),
      "cross-workspace-relationships",
    )

    // Assert
    expect(findings).toMatchObject([
      {
        entityName: "@example/backend → @example/frontend",
        dependencyKind: "runtime",
        relationshipCount: 2,
      },
      {
        entityName: "@example/frontend → @example/shared",
        dependencyKind: "runtime",
        relationshipCount: 1,
      },
      {
        entityName: "@example/frontend → @example/shared",
        dependencyKind: "type-only",
        relationshipCount: 1,
      },
    ])
  })

  it("rederives every category from workspace scope alone", () => {
    // Arrange
    const appA = file("apps/a/a.ts", 100, 20, "apps/a")
    const appB = file("apps/b/b.ts", 100, undefined, "apps/b")
    const presentation = presentationWith({
      workspacePackages: [
        { path: "apps/a", name: "a" },
        { path: "apps/b", name: "b" },
      ],
      files: [appA, appB],
      edges: [edge("a-b-runtime", appA, appB, "runtime"), edge("b-a-type", appB, appA, "type-only")],
    })

    // Act
    const completeScope = deriveReportFindings(presentation, scope("apps/a", "apps/b"))
    const appOnlyScope = deriveReportFindings(presentation, scope("apps/a"))

    // Assert
    expect(completeScope.map(({ category }) => category)).toEqual([
      "large-low-coverage",
      "large-unavailable-coverage",
      "highest-fan-out",
      "highest-fan-in",
      "dependency-cycles",
      "cross-workspace-relationships",
    ])
    expect(appOnlyScope.map(({ category }) => category)).toEqual(["large-low-coverage"])
  })
})

function presentationWith({
  files,
  edges = [],
  workspacePackages = [],
}: {
  readonly files: readonly ReportProjectFileNode[]
  readonly edges?: readonly ReportEdge[]
  readonly workspacePackages?: BrowserPresentation["workspacePackages"]
}): BrowserPresentation {
  return {
    projectName: "findings",
    workspacePackages,
    nodes: files,
    edges,
  }
}

function file(path: string, codeLines: number, coverage: number | undefined, workspacePackage?: string): ReportProjectFileNode {
  return {
    id: `project-file:${path}`,
    kind: "project-file",
    displayName: path,
    path,
    workspacePackage,
    lineMetrics: { code: codeLines, comment: 0, blank: 0 },
    coverage,
    color: "#000000",
    size: 1,
  }
}

function edge(
  id: string,
  source: ReportProjectFileNode | undefined,
  target: ReportProjectFileNode | undefined,
  dependencyKind: DependencyKind,
): ReportEdge {
  if (source === undefined || target === undefined) {
    throw new Error(`Test edge ${id} is missing an endpoint.`)
  }
  return {
    id,
    source: source.id,
    target: target.id,
    targetKind: "project-file",
    dependencyKind,
  }
}

function scope(...workspacePackages: readonly string[]): ReportScopeState {
  return { workspacePackages: new Set(workspacePackages) }
}

function allScope(): ReportScopeState {
  return scope()
}

function findingsOf(
  groups: ReadonlyArray<{
    readonly category: ReportFindingCategory
    readonly findings: readonly ReportFinding[]
  }>,
  category: ReportFindingCategory,
): readonly ReportFinding[] {
  return groups.find((group) => group.category === category)?.findings ?? []
}
