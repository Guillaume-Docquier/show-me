import { Result } from "@guillaume-docquier/tools-ts"
import { expect, it } from "vitest"
import { analyzeProject } from "../analysis/analyze-project.js"
import type { ProjectAnalysis } from "../analysis/project-analysis.js"
import { ProjectFilePath } from "../project-files/project-file-path.js"
import { fixtureProjectPath } from "../testing/fixture-project.js"
import {
  EXTERNAL_PACKAGE_NODE_COLOR,
  EXTERNAL_PACKAGE_NODE_SIZE,
  buildReportPresentation,
  activeLineCount,
  coverageColor,
  nodeSizeForLines,
  REPORT_PRESENTATION_SCHEMA_VERSION,
  truncatePathFromStart,
} from "./report-presentation.js"

it("uses presentation schema version 4 for the typed package-node contract", () => {
  // Assert
  expect(REPORT_PRESENTATION_SCHEMA_VERSION).toBe(4)
})

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

it("builds deterministic coordinates and dependency metrics", () => {
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
        coverage: undefined,
      },
    ],
    dependencies: [{ source: sourcePath, target: targetPath, kind: "runtime" }],
    externalPackages: [],
    externalPackageDependencies: [],
    diagnostics: [],
  }

  // Act
  const firstPresentation = buildReportPresentation(analysis)
  const secondPresentation = buildReportPresentation(analysis)

  // Assert
  expect(firstPresentation).toEqual(secondPresentation)
  expect(firstPresentation.schemaVersion).toBe(REPORT_PRESENTATION_SCHEMA_VERSION)
  expect(firstPresentation.nodes).toMatchObject([
    {
      id: "project-file:src/source.ts",
      kind: "project-file",
      path: "src/source.ts",
      lineMetrics: { code: 4, comment: 2, blank: 1 },
      importedNodeIds: ["project-file:src/deep/target.ts"],
      consumerNodeIds: [],
    },
    {
      id: "project-file:src/deep/target.ts",
      kind: "project-file",
      path: "src/deep/target.ts",
      lineMetrics: { code: 16, comment: 4, blank: 2 },
      importedNodeIds: [],
      consumerNodeIds: ["project-file:src/source.ts"],
    },
  ])
  expect(firstPresentation.edges).toEqual([
    {
      id: "project-dependency-0",
      kind: "project-file",
      source: "project-file:src/source.ts",
      target: "project-file:src/deep/target.ts",
    },
  ])
})

it("creates deterministic fixed-size package nodes and package relationship IDs", async () => {
  // Arrange
  const analysis = await analyzeProject({ projectRoot: fixtureProjectPath("external-packages") })
  if (Result.isFailure(analysis)) {
    throw new Error("Fixture analysis failed: " + analysis.error._tag)
  }

  // Act
  const presentation = buildReportPresentation(analysis.value)

  // Assert
  expect(
    presentation.nodes
      .filter((node) => node.kind === "external-package")
      .map(({ id, packageName, size, color, consumerNodeIds }) => ({ id, packageName, size, color, consumerNodeIds })),
  ).toEqual([
    {
      id: "external-package:@scope/package",
      packageName: "@scope/package",
      size: EXTERNAL_PACKAGE_NODE_SIZE,
      color: EXTERNAL_PACKAGE_NODE_COLOR,
      consumerNodeIds: ["project-file:src/consumer.ts", "project-file:src/entry.ts"],
    },
    {
      id: "external-package:react",
      packageName: "react",
      size: EXTERNAL_PACKAGE_NODE_SIZE,
      color: EXTERNAL_PACKAGE_NODE_COLOR,
      consumerNodeIds: ["project-file:src/consumer.ts", "project-file:src/entry.ts"],
    },
  ])
  expect(presentation.edges.filter((edge) => edge.kind === "external-package")).toEqual([
    {
      id: "external-package-dependency-0",
      kind: "external-package",
      source: "project-file:src/consumer.ts",
      target: "external-package:@scope/package",
    },
    {
      id: "external-package-dependency-1",
      kind: "external-package",
      source: "project-file:src/consumer.ts",
      target: "external-package:react",
    },
    {
      id: "external-package-dependency-2",
      kind: "external-package",
      source: "project-file:src/entry.ts",
      target: "external-package:@scope/package",
    },
    {
      id: "external-package-dependency-3",
      kind: "external-package",
      source: "project-file:src/entry.ts",
      target: "external-package:react",
    },
  ])
})

it("keeps large nodes from overlapping other nodes in large graphs", () => {
  // Arrange
  const files = Array.from({ length: 101 }, (_, index) => ({
    path: parseProjectFilePath(`src/file-${String(index).padStart(3, "0")}.ts`),
    language: "typescript" as const,
    lines: { code: index === 0 ? 500 : 1, comment: index === 1 ? 500 : 0, blank: index === 2 ? 500 : 0 },
    coverage: undefined,
  }))
  const analysis: ProjectAnalysis = {
    schemaVersion: 3,
    project: { name: "large-nodes" },
    files,
    dependencies: [],
    externalPackages: [],
    externalPackageDependencies: [],
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
        overlaps.push(`${left.displayName} overlaps ${right.displayName}`)
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
