import { Result } from "@guillaume-docquier/tools-ts"
import { expect, it } from "vitest"
import type { ProjectAnalysis } from "../../analysis/project-analysis.js"
import { ProjectFilePath } from "../../project-files/project-file-path.js"
import { activeLineCount, buildBrowserPresentation, coverageColor, nodeSizeForLines, truncatePathFromStart } from "./report-presentation.js"

it.each([
  [0, 3],
  [1, 3],
  [20, 13.18],
  [300, 24.7],
  [500, 26.91],
  [1_000, 29.9],
  [10_000, 39.86],
] as const)("maps %i active lines to the restrained node size %f", (lines, expectedSize) => {
  // Act
  const size = nodeSizeForLines(lines)

  // Assert
  expect(size).toBeCloseTo(expectedSize, 2)
})

it.each([
  [undefined, "#8fa3b8"],
  [0, "#dc2626"],
  [25, "#e36d17"],
  [50, "#eab308"],
  [75, "#80ab29"],
  [100, "#16a34a"],
] as const)("maps %s line coverage to a deterministic node color", (coverage, expectedColor) => {
  // Act
  const color = coverageColor(coverage)

  // Assert
  expect(color).toBe(expectedColor)
})

it.each([
  [["code"], 10],
  [["comment"], 4],
  [["blank"], 2],
  [["code", "comment"], 14],
  [["code", "blank"], 12],
  [["comment", "blank"], 6],
  [["code", "comment", "blank"], 16],
] as const)("combines active line categories %j", (categories, expectedLines) => {
  // Act
  const lines = activeLineCount({ code: 10, comment: 4, blank: 2 }, categories)

  // Assert
  expect(lines).toBe(expectedLines)
})

it("derives deterministic identities, display data, and relationship indexes from analysis", () => {
  // Arrange
  const sourcePath = parseProjectFilePath("src/source.ts")
  const targetPath = parseProjectFilePath("src/deep/target.ts")
  const analysis: ProjectAnalysis = {
    schemaVersion: 3,
    project: { name: "deterministic" },
    files: [
      {
        path: sourcePath,
        language: "typescript",
        lines: { code: 4, comment: 2, blank: 1 },
        coverage: undefined,
      },
      {
        path: targetPath,
        language: "typescript",
        lines: { code: 16, comment: 4, blank: 2 },
        coverage: { lines: 75 },
      },
    ],
    dependencies: [{ source: sourcePath, target: targetPath, kind: "runtime" }],
    externalPackages: [],
    externalPackageDependencies: [],
    diagnostics: [],
  }

  // Act
  const firstPresentation = buildBrowserPresentation(analysis)
  const secondPresentation = buildBrowserPresentation(analysis)

  // Assert
  expect(firstPresentation).toEqual(secondPresentation)
  expect(firstPresentation).toMatchObject({
    projectName: "deterministic",
    nodes: [
      {
        id: "project-file:src/source.ts",
        kind: "project-file",
        path: "src/source.ts",
        lineMetrics: { code: 4, comment: 2, blank: 1 },
        importedNodeIds: ["project-file:src/deep/target.ts"],
        consumerNodeIds: [],
        color: "#8fa3b8",
      },
      {
        id: "project-file:src/deep/target.ts",
        kind: "project-file",
        path: "src/deep/target.ts",
        lineMetrics: { code: 16, comment: 4, blank: 2 },
        importedNodeIds: [],
        consumerNodeIds: ["project-file:src/source.ts"],
        color: "#80ab29",
      },
    ],
    edges: [
      {
        id: "project-dependency-0",
        kind: "project-file",
        source: "project-file:src/source.ts",
        target: "project-file:src/deep/target.ts",
      },
    ],
  })
})

it("truncates leading directories while preserving the complete filename", () => {
  // Arrange
  const longPath = "packages/application/src/features/accounts/components/account-configuration-panel.tsx"

  // Act
  const truncated = truncatePathFromStart(longPath, 38)

  // Assert
  expect(truncated.startsWith("...")).toBe(true)
  expect(truncated.endsWith("account-configuration-panel.tsx")).toBe(true)
})

function parseProjectFilePath(input: string): ProjectFilePath {
  const result = ProjectFilePath.parse(input)
  if (Result.isFailure(result)) {
    throw new Error(`Invalid test project file path: ${input}`)
  }
  return result.value
}
