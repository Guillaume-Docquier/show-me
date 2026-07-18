import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Result } from "@guillaume-docquier/tools-ts"
import { describe, expect, it } from "vitest"
import { analyzeProject } from "../analysis/analyze-project.js"
import { PROJECT_ANALYSIS_SCHEMA_VERSION, type ProjectAnalysis } from "../analysis/project-analysis.js"
import { ProjectFilePath } from "../project-files/project-file-path.js"
import { fixtureProjectPath } from "../testing/fixture-project.js"
import { withTemporaryDirectory } from "../testing/temporary-directory.js"
import { normalizeCoverageFilePath } from "./coverage-analysis.js"
import { importCoverage, importDiscoveredCoverage } from "./import-coverage.js"

const EXPECTED_FIXTURE_COVERAGE = [
  { path: "src/absent.ts", coverage: undefined },
  { path: "src/covered.ts", coverage: 100 },
  { path: "src/empty.ts", coverage: 100 },
  { path: "src/multiline.ts", coverage: 100 },
  { path: "src/one-third.ts", coverage: 33.33 },
  { path: "src/partial.ts", coverage: 50 },
  { path: "src/same-line-mixed.ts", coverage: 100 },
  { path: "src/same-line-uncovered.ts", coverage: 0 },
  { path: "src/uncovered.ts", coverage: 0 },
] as const

describe("importCoverage", () => {
  it("produces identical analysis coverage from equivalent Istanbul and LCOV fixtures", async () => {
    // Arrange
    const projectRoot = fixtureProjectPath("coverage-project")
    const analysis = await analyzeProject({ projectRoot })
    if (Result.isFailure(analysis)) {
      throw new Error(`Fixture analysis failed: ${analysis.error._tag}`)
    }

    // Act
    const istanbul = await importCoverage(analysis.value, projectRoot, join(projectRoot, "coverage", "coverage-final.json"))
    const lcov = await importCoverage(analysis.value, projectRoot, join(projectRoot, "coverage", "lcov.info"))

    // Assert
    expect(Result.isSuccess(istanbul)).toBe(true)
    expect(Result.isSuccess(lcov)).toBe(true)
    if (Result.isSuccess(istanbul) && Result.isSuccess(lcov)) {
      expect(coverageByPath(istanbul.value)).toEqual(EXPECTED_FIXTURE_COVERAGE)
      expect(coverageByPath(lcov.value)).toEqual(EXPECTED_FIXTURE_COVERAGE)
      expect(coverageByPath(lcov.value)).toEqual(coverageByPath(istanbul.value))
      expect(istanbul.value.dependencies).toBe(analysis.value.dependencies)
      expect(istanbul.value.diagnostics).toBe(analysis.value.diagnostics)
    }
  })

  it("ignores coverage entries for project files excluded from analysis", async () => {
    // Arrange
    const projectRoot = fixtureProjectPath("test-file-exclusions")
    const analysis = await analyzeProject({ projectRoot })
    if (Result.isFailure(analysis)) {
      throw new Error(`Fixture analysis failed: ${analysis.error._tag}`)
    }

    // Act
    const result = await importCoverage(analysis.value, projectRoot, join(projectRoot, "coverage", "coverage-final.json"))

    // Assert
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(coverageByPath(result.value)).toEqual([
        { path: "src/__tests__/helper.ts", coverage: undefined },
        { path: "src/app.ts", coverage: 100 },
        { path: "src/aspect.ts", coverage: undefined },
        { path: "src/contest.ts", coverage: undefined },
        { path: "src/runtime.ts", coverage: 0 },
        { path: "src/spec.ts", coverage: undefined },
        { path: "src/suite.spec/helper.ts", coverage: undefined },
        { path: "src/suite.test/helper.ts", coverage: undefined },
        { path: "src/test.ts", coverage: undefined },
        { path: "src/test/helper.ts", coverage: undefined },
        { path: "src/tests/helper.ts", coverage: undefined },
      ])
    }
  })

  it.each([
    ["invalid JSON", "{"],
    [
      "a missing statement hit count",
      JSON.stringify({
        "src/app.ts": {
          path: "src/app.ts",
          statementMap: { 0: { start: { line: 1 } } },
          s: {},
        },
      }),
    ],
    [
      "a missing statement location",
      JSON.stringify({
        "src/app.ts": {
          path: "src/app.ts",
          statementMap: {},
          s: { 0: 1 },
        },
      }),
    ],
    [
      "an invalid statement line",
      JSON.stringify({
        "src/app.ts": {
          path: "src/app.ts",
          statementMap: { 0: { start: { line: 0 } } },
          s: { 0: 1 },
        },
      }),
    ],
    [
      "an invalid statement hit count",
      JSON.stringify({
        "src/app.ts": {
          path: "src/app.ts",
          statementMap: { 0: { start: { line: 1 } } },
          s: { 0: -1 },
        },
      }),
    ],
  ])("returns an Istanbul invalid-report failure for %s", async (_name, contents) => {
    await withTemporaryDirectory(async (temporaryDirectory) => {
      // Arrange
      const coverageFile = join(temporaryDirectory, "coverage.input")
      await writeFile(coverageFile, contents, "utf8")

      // Act
      const result = await importCoverage(emptyProjectAnalysis("invalid"), temporaryDirectory, coverageFile)

      // Assert
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.error._tag).toBe("CoverageReportInvalid")
        if (result.error._tag === "CoverageReportInvalid") {
          expect(result.error.format).toBe("istanbul")
        }
      }
    })
  })

  it("returns a typed unsupported-format failure without trying either parser", async () => {
    await withTemporaryDirectory(async (temporaryDirectory) => {
      // Arrange
      const coverageFile = join(temporaryDirectory, "coverage.input")
      await writeFile(coverageFile, "not a coverage report", "utf8")

      // Act
      const result = await importCoverage(emptyProjectAnalysis("unsupported"), temporaryDirectory, coverageFile)

      // Assert
      expect(result).toEqual(Result.Failure({ _tag: "CoverageFormatUnsupported", coverageFile }))
    })
  })

  it("returns a typed read failure when an explicit coverage file is missing", async () => {
    await withTemporaryDirectory(async (temporaryDirectory) => {
      // Arrange
      const coverageFile = join(temporaryDirectory, "missing.info")

      // Act
      const result = await importCoverage(emptyProjectAnalysis("missing"), temporaryDirectory, coverageFile)

      // Assert
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.error._tag).toBe("CoverageReportReadFailed")
      }
    })
  })

  it("matches Windows LCOV paths case-insensitively and ignores outside-root and absent files", async () => {
    await withTemporaryDirectory(async (temporaryDirectory) => {
      // Arrange
      const coverageFile = join(temporaryDirectory, "coverage.input")
      await writeFile(
        coverageFile,
        `SF:c:\\REPO\\PROJECT\\SRC\\APP.TS
DA:1,1
end_of_record
SF:c:\\repo\\outside.ts
DA:1,1
end_of_record
SF:c:\\repo\\project\\src\\absent.ts
DA:1,1
end_of_record`,
        "utf8",
      )

      // Act
      const result = await importCoverage(analysisWithOneFile("src/App.ts"), "C:\\repo\\project", coverageFile)

      // Assert
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) {
        expect(result.value.files[0]).toMatchObject({ path: "src/App.ts", coverage: { lines: 100 } })
      }
    })
  })

  it("keeps POSIX LCOV project-file matching case-sensitive", async () => {
    await withTemporaryDirectory(async (temporaryDirectory) => {
      // Arrange
      const coverageFile = join(temporaryDirectory, "coverage.input")
      await writeFile(coverageFile, "SF:/repo/project/src/APP.ts\nDA:1,1\nend_of_record", "utf8")

      // Act
      const result = await importCoverage(analysisWithOneFile("src/App.ts"), "/repo/project", coverageFile)

      // Assert
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) {
        expect(result.value.files[0]?.coverage).toBeUndefined()
      }
    })
  })

  it("merges repeated LCOV source records and executable lines using maximum hits", async () => {
    await withTemporaryDirectory(async (temporaryDirectory) => {
      // Arrange
      const coverageFile = join(temporaryDirectory, "coverage.info")
      await writeFile(coverageFile, "SF:src/app.ts\nDA:1,0\nend_of_record\nSF:src/app.ts\nDA:1,2\nDA:2,0\nend_of_record\n", "utf8")

      // Act
      const result = await importCoverage(analysisWithOneFile("src/app.ts"), temporaryDirectory, coverageFile)

      // Assert
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) {
        expect(result.value.files[0]?.coverage).toEqual({ lines: 50 })
      }
    })
  })
})

describe("importDiscoveredCoverage", () => {
  it("imports LCOV when the standard Istanbul report is absent", async () => {
    await withTemporaryDirectory(async (projectRoot) => {
      // Arrange
      await mkdir(join(projectRoot, "coverage"))
      await writeFile(join(projectRoot, "coverage", "lcov.info"), "SF:index.ts\nDA:1,1\nend_of_record", "utf8")

      // Act
      const result = await importDiscoveredCoverage(analysisWithOneFile("index.ts"), projectRoot)

      // Assert
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) {
        expect(result.value.coverageFile).toBe(join(projectRoot, "coverage", "lcov.info"))
        expect(result.value.analysis.files[0]?.coverage).toEqual({ lines: 100 })
      }
    })
  })

  it("selects valid Istanbul before malformed LCOV and does not parse or merge the second report", async () => {
    await withTemporaryDirectory(async (projectRoot) => {
      // Arrange
      await mkdir(join(projectRoot, "coverage"))
      await writeFile(join(projectRoot, "coverage", "coverage-final.json"), coverageFinal("index.ts", 0), "utf8")
      await writeFile(join(projectRoot, "coverage", "lcov.info"), "invalid LCOV that must not be read", "utf8")

      // Act
      const result = await importDiscoveredCoverage(analysisWithOneFile("index.ts"), projectRoot)

      // Assert
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) {
        expect(result.value.coverageFile).toBe(join(projectRoot, "coverage", "coverage-final.json"))
        expect(result.value.analysis.files[0]?.coverage).toEqual({ lines: 0 })
      }
    })
  })

  it("does not fall back to valid LCOV after selecting invalid Istanbul", async () => {
    await withTemporaryDirectory(async (projectRoot) => {
      // Arrange
      await mkdir(join(projectRoot, "coverage"))
      await writeFile(join(projectRoot, "coverage", "coverage-final.json"), "{", "utf8")
      await writeFile(join(projectRoot, "coverage", "lcov.info"), "SF:index.ts\nDA:1,1\nend_of_record", "utf8")

      // Act
      const result = await importDiscoveredCoverage(analysisWithOneFile("index.ts"), projectRoot)

      // Assert
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.error._tag).toBe("CoverageReportInvalid")
        if (result.error._tag === "CoverageReportInvalid") {
          expect(result.error.format).toBe("istanbul")
        }
      }
    })
  })

  it("returns unchanged analysis when neither standard report exists", async () => {
    await withTemporaryDirectory(async (projectRoot) => {
      // Arrange
      const analysis = analysisWithOneFile("index.ts")

      // Act
      const result = await importDiscoveredCoverage(analysis, projectRoot)

      // Assert
      expect(result).toEqual(Result.Success({ analysis, coverageFile: undefined }))
    })
  })
})

describe("normalizeCoverageFilePath", () => {
  it.each([
    ["POSIX absolute", "/repo/project", "/repo/project/src/app.ts", "src/app.ts"],
    ["POSIX relative", "/repo/project", "src/app.ts", "src/app.ts"],
    ["Windows absolute", "C:\\repo\\project", "c:\\repo\\project\\src\\app.ts", "src/app.ts"],
    ["Windows absolute with POSIX separators", "C:\\repo\\project", "C:/repo/project/src/app.ts", "src/app.ts"],
    ["Windows relative with POSIX separators", "C:\\repo\\project", "src/app.ts", "src/app.ts"],
    ["Windows relative with Windows separators", "C:\\repo\\project", "src\\app.ts", "src/app.ts"],
  ])("normalizes a %s path", (_name, projectRoot, coveragePath, expected) => {
    // Act
    const result = normalizeCoverageFilePath(projectRoot, coveragePath)

    // Assert
    expect(result).toEqual(Result.Success(expected))
  })

  it.each([
    ["POSIX sibling", "/repo/project", "/repo/project-other/src/app.ts"],
    ["POSIX traversal", "/repo/project", "../outside.ts"],
    ["Windows sibling", "C:\\repo\\project", "C:\\repo\\project-other\\src\\app.ts"],
    ["different Windows drive", "C:\\repo\\project", "D:\\repo\\project\\src\\app.ts"],
  ])("rejects a %s path outside the project root", (_name, projectRoot, coveragePath) => {
    // Act
    const result = normalizeCoverageFilePath(projectRoot, coveragePath)

    // Assert
    expect(result).toEqual(Result.Failure({ _tag: "CoveragePathOutsideProject", projectRoot, coveragePath }))
  })
})

function coverageByPath(analysis: ProjectAnalysis): ReadonlyArray<{ readonly path: string; readonly coverage: number | undefined }> {
  return analysis.files.map(({ path, coverage }) => ({ path, coverage: coverage?.lines }))
}

function coverageFinal(path: string, hits: number): string {
  return JSON.stringify({
    [path]: {
      path,
      statementMap: { 0: { start: { line: 1 } } },
      s: { 0: hits },
    },
  })
}

function analysisWithOneFile(path: string): ProjectAnalysis {
  const projectFilePath = ProjectFilePath.parse(path)
  if (Result.isFailure(projectFilePath)) {
    throw new Error(`Invalid test project file path: ${path}`)
  }

  return {
    ...emptyProjectAnalysis("path-casing"),
    files: [
      {
        path: projectFilePath.value,
        language: "typescript",
        lines: { code: 1, comment: 0, blank: 0 },
        coverage: undefined,
      },
    ],
  }
}

function emptyProjectAnalysis(projectName: string): ProjectAnalysis {
  return {
    schemaVersion: PROJECT_ANALYSIS_SCHEMA_VERSION,
    project: { name: projectName },
    files: [],
    dependencies: [],
    externalPackages: [],
    externalPackageDependencies: [],
    diagnostics: [],
  }
}
