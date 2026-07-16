import { Result } from "@guillaume-docquier/tools-ts"
import { expect, it } from "vitest"
import type { ProjectAnalysis } from "../analysis/project-analysis.js"
import { ProjectFilePath } from "../project-files/project-file-path.js"
import { buildReportPresentation, coverageColor, nodeSizeForLines, truncatePathFromStart } from "./report-presentation.js"

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

it("builds deterministic coordinates and dependency metrics", () => {
  // Arrange
  const sourcePath = parseProjectFilePath("src/source.ts")
  const targetPath = parseProjectFilePath("src/deep/target.ts")
  const analysis: ProjectAnalysis = {
    schemaVersion: 1,
    project: { name: "deterministic" },
    files: [
      {
        path: sourcePath,
        language: "typescript",
        lines: { nonBlank: 4 },
        coverage: undefined,
      },
      {
        path: targetPath,
        language: "typescript",
        lines: { nonBlank: 16 },
        coverage: undefined,
      },
    ],
    dependencies: [{ source: sourcePath, target: targetPath, kind: "runtime" }],
    diagnostics: [],
  }

  // Act
  const firstPresentation = buildReportPresentation(analysis)
  const secondPresentation = buildReportPresentation(analysis)

  // Assert
  expect(firstPresentation).toEqual(secondPresentation)
  expect(firstPresentation.nodes.map(({ path, imports, consumers }) => ({ path, imports, consumers }))).toEqual([
    { path: "src/source.ts", imports: 1, consumers: 0 },
    { path: "src/deep/target.ts", imports: 0, consumers: 1 },
  ])
  expect(firstPresentation.edges).toEqual([
    {
      id: "dependency-0",
      source: "src/source.ts",
      target: "src/deep/target.ts",
    },
  ])
})

it("keeps large nodes from overlapping other nodes in large graphs", () => {
  // Arrange
  const files = Array.from({ length: 101 }, (_, index) => ({
    path: parseProjectFilePath(`src/file-${String(index).padStart(3, "0")}.ts`),
    language: "typescript" as const,
    lines: { nonBlank: index === 0 ? 500 : 1 },
    coverage: undefined,
  }))
  const analysis: ProjectAnalysis = {
    schemaVersion: 1,
    project: { name: "large-nodes" },
    files,
    dependencies: [],
    diagnostics: [],
  }

  // Act
  const presentation = buildReportPresentation(analysis)

  // Assert
  const overlaps: string[] = []
  for (let leftIndex = 0; leftIndex < presentation.nodes.length; leftIndex += 1) {
    const left = presentation.nodes[leftIndex]
    if (left === undefined) {
      continue
    }
    for (let rightIndex = leftIndex + 1; rightIndex < presentation.nodes.length; rightIndex += 1) {
      const right = presentation.nodes[rightIndex]
      if (right === undefined) {
        continue
      }
      const centerDistance = Math.hypot(left.x - right.x, left.y - right.y)
      if (centerDistance < left.size + right.size) {
        overlaps.push(`${left.path} overlaps ${right.path}`)
      }
    }
  }
  expect(overlaps).toEqual([])
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

it("truncates the displayed path from the start", () => {
  // Arrange
  const longPath = "fixtures/projects/minimal-typescript/src/index.ts"

  // Act
  const truncated = truncatePathFromStart(longPath)

  // Assert
  expect(truncated).toBe("...ures/projects/minimal-typescript/src/index.ts")
})

function parseProjectFilePath(input: string): ProjectFilePath {
  const result = ProjectFilePath.parse(input)
  if (Result.isFailure(result)) {
    throw new Error(`Invalid test project file path: ${input}`)
  }
  return result.value
}
