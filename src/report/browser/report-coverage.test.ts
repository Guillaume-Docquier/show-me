import { describe, expect, it } from "vitest"
import {
  DEFAULT_COVERAGE_FILTERS,
  deriveCoverageLensResults,
  normalizeCoverageFilters,
  type CoverageFilterState,
} from "./report-coverage.js"
import type { ReportScopeState } from "./report-lens.js"
import type { BrowserPresentation, ReportProjectFileNode } from "./report-presentation.js"

describe("Coverage lens", () => {
  it("uses deterministic defaults and normalizes filter boundaries", () => {
    // Arrange
    const outsideBoundaries: CoverageFilterState = {
      minimumCodeLines: -4.8,
      maximumCoverage: 140,
      includeUnavailableCoverage: false,
    }

    // Act
    const normalized = normalizeCoverageFilters(outsideBoundaries)

    // Assert
    expect(DEFAULT_COVERAGE_FILTERS).toEqual({
      minimumCodeLines: 100,
      maximumCoverage: 80,
      includeUnavailableCoverage: true,
    })
    expect(normalized).toEqual({
      minimumCodeLines: 0,
      maximumCoverage: 100,
      includeUnavailableCoverage: false,
    })
  })

  it("keeps zero, complete, unavailable, and empty-file facts distinct with stable ordering", () => {
    // Arrange
    const presentation = coveragePresentation([
      file("src/zero-b.ts", 120, 0),
      file("src/zero-a.ts", 120, 0),
      file("src/complete.ts", 100, 100),
      file("src/unavailable.ts", 150, undefined),
      file("src/empty.ts", 0, 0),
    ])
    const filters: CoverageFilterState = {
      minimumCodeLines: 0,
      maximumCoverage: 100,
      includeUnavailableCoverage: true,
    }

    // Act
    const results = deriveCoverageLensResults(presentation, allScope(), filters)

    // Assert
    expect(results.matches).toEqual([
      { nodeId: "project-file:src/zero-a.ts", path: "src/zero-a.ts", codeLines: 120, coverage: 0 },
      { nodeId: "project-file:src/zero-b.ts", path: "src/zero-b.ts", codeLines: 120, coverage: 0 },
      { nodeId: "project-file:src/empty.ts", path: "src/empty.ts", codeLines: 0, coverage: 0 },
      { nodeId: "project-file:src/complete.ts", path: "src/complete.ts", codeLines: 100, coverage: 100 },
      { nodeId: "project-file:src/unavailable.ts", path: "src/unavailable.ts", codeLines: 150, coverage: undefined },
    ])
    expect(results.knownCoverageFileCount).toBe(4)
    expect(results.unavailableCoverageFileCount).toBe(1)
  })

  it("composes workspace scope and excludes unavailable coverage independently from zero coverage", () => {
    // Arrange
    const presentation = coveragePresentation(
      [
        file("apps/a/zero.ts", 100, 0, "apps/a"),
        file("apps/a/unavailable.ts", 100, undefined, "apps/a"),
        file("apps/b/zero.ts", 100, 0, "apps/b"),
      ],
      [
        { path: "apps/a", name: "@example/a" },
        { path: "apps/b", name: "@example/b" },
      ],
    )

    // Act
    const results = deriveCoverageLensResults(
      presentation,
      { workspacePackages: new Set(["apps/a"]) },
      {
        minimumCodeLines: 100,
        maximumCoverage: 0,
        includeUnavailableCoverage: false,
      },
    )

    // Assert
    expect(results.matches).toEqual([{ nodeId: "project-file:apps/a/zero.ts", path: "apps/a/zero.ts", codeLines: 100, coverage: 0 }])
    expect(results.scopedFileCount).toBe(2)
    expect(results.knownCoverageFileCount).toBe(1)
    expect(results.unavailableCoverageFileCount).toBe(1)
  })
})

function coveragePresentation(
  nodes: readonly ReportProjectFileNode[],
  workspacePackages: BrowserPresentation["workspacePackages"] = [],
): BrowserPresentation {
  return {
    projectName: "coverage-lens",
    workspacePackages,
    nodes,
    edges: [],
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

function allScope(): ReportScopeState {
  return { workspacePackages: new Set() }
}
