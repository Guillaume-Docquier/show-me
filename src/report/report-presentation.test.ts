import { Result } from "@guillaume-docquier/tools-ts"
import { expect, it } from "vitest"
import type { ProjectAnalysis } from "../analysis/project-analysis.js"
import { ProjectFilePath } from "../project-files/project-file-path.js"
import { buildReportPresentation, nodeSizeForLines, truncatePathFromStart } from "./report-presentation.js"

it("makes node area proportional to the active line count", () => {
  // Arrange
  const smallerLines = 4
  const largerLines = 16

  // Act
  const smallerSize = nodeSizeForLines(smallerLines)
  const largerSize = nodeSizeForLines(largerLines)

  // Assert
  expect((largerSize * largerSize) / (smallerSize * smallerSize)).toBe(4)
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

it("truncates leading directories while preserving the complete filename", () => {
  // Arrange
  const longPath = "packages/application/src/features/accounts/components/account-configuration-panel.tsx"

  // Act
  const truncated = truncatePathFromStart(longPath, 38)

  // Assert
  expect(truncated.startsWith("…")).toBe(true)
  expect(truncated.endsWith("account-configuration-panel.tsx")).toBe(true)
})

function parseProjectFilePath(input: string): ProjectFilePath {
  const result = ProjectFilePath.parse(input)
  if (Result.isFailure(result)) {
    throw new Error(`Invalid test project file path: ${input}`)
  }
  return result.value
}
