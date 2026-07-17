import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Result } from "@guillaume-docquier/tools-ts"
import { describe, expect, it } from "vitest"
import { analyzeProject } from "../analysis/analyze-project.js"
import type { ProjectAnalysis } from "../analysis/project-analysis.js"
import { ProjectFilePath } from "../project-files/project-file-path.js"
import { fixtureProjectPath } from "../testing/fixture-project.js"
import { withTemporaryDirectory } from "../testing/temporary-directory.js"
import { importIstanbulCoverage, normalizeCoverageFilePath } from "./import-istanbul-coverage.js"

describe("importIstanbulCoverage", () => {
  it("enriches covered, partial, uncovered, same-line, multiline, and empty files without changing language analysis", async () => {
    // Arrange
    const projectRoot = fixtureProjectPath("coverage-project")
    const analysis = await analyzeProject({ projectRoot })
    if (Result.isFailure(analysis)) {
      throw new Error(`Fixture analysis failed: ${analysis.error._tag}`)
    }
    const dependencies = analysis.value.dependencies
    const diagnostics = analysis.value.diagnostics

    // Act
    const result = await importIstanbulCoverage(analysis.value, projectRoot, `${projectRoot}/coverage/coverage-final.json`)

    // Assert
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.value.files.map(({ path, coverage }) => ({ path, coverage: coverage?.lines }))).toEqual([
        { path: "src/absent.ts", coverage: undefined },
        { path: "src/covered.ts", coverage: 100 },
        { path: "src/empty.ts", coverage: 100 },
        { path: "src/multiline.ts", coverage: 100 },
        { path: "src/one-third.ts", coverage: 33.33 },
        { path: "src/partial.ts", coverage: 50 },
        { path: "src/same-line-mixed.ts", coverage: 100 },
        { path: "src/same-line-uncovered.ts", coverage: 0 },
        { path: "src/uncovered.ts", coverage: 0 },
      ])
      expect(result.value.dependencies).toBe(dependencies)
      expect(result.value.diagnostics).toBe(diagnostics)
      expect(result.value.dependencies).toEqual([{ source: "src/covered.ts", target: "src/partial.ts", kind: "runtime" }])
      expect(result.value.diagnostics).toEqual([
        {
          code: "UNRESOLVED_RUNTIME_DEPENDENCY",
          message: 'Could not resolve runtime dependency "./missing.js".',
          file: "src/covered.ts",
        },
      ])
    }
  })

  it("ignores coverage entries for default-excluded test files", async () => {
    // Arrange
    const projectRoot = fixtureProjectPath("test-file-exclusions")
    const analysis = await analyzeProject({ projectRoot })
    if (Result.isFailure(analysis)) {
      throw new Error("Fixture analysis failed: " + analysis.error._tag)
    }

    // Act
    const result = await importIstanbulCoverage(analysis.value, projectRoot, join(projectRoot, "coverage", "coverage-final.json"))

    // Assert
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.value.files.map(({ path, coverage }) => ({ path, coverage: coverage?.lines }))).toEqual([
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
    ["a non-object root", "[]"],
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
    [
      "an empty covered file path",
      JSON.stringify({
        empty: {
          path: "",
          statementMap: {},
          s: {},
        },
      }),
    ],
  ])("returns a typed invalid-file failure for %s", async (_name, contents) => {
    await withTemporaryDirectory(async (temporaryDirectory) => {
      // Arrange
      const coverageFile = join(temporaryDirectory, "coverage-final.json")
      await writeFile(coverageFile, contents, "utf8")

      // Act
      const result = await importIstanbulCoverage(emptyProjectAnalysis("invalid"), temporaryDirectory, coverageFile)

      // Assert
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.error._tag).toBe("CoverageFileInvalid")
      }
    })
  })

  it("returns a typed read failure when the coverage file cannot be read", async () => {
    await withTemporaryDirectory(async (temporaryDirectory) => {
      // Arrange
      const missingCoverageFile = join(temporaryDirectory, "missing.json")

      // Act
      const result = await importIstanbulCoverage(emptyProjectAnalysis("missing"), temporaryDirectory, missingCoverageFile)

      // Assert
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.error._tag).toBe("CoverageFileReadFailed")
      }
    })
  })

  it("matches Windows coverage paths case-insensitively to the discovered project-file casing", async () => {
    await withTemporaryDirectory(async (temporaryDirectory) => {
      // Arrange
      const coverageFile = join(temporaryDirectory, "coverage-final.json")
      await writeFile(
        coverageFile,
        JSON.stringify({
          "c:\\REPO\\PROJECT\\SRC\\APP.TS": {
            path: "c:\\REPO\\PROJECT\\SRC\\APP.TS",
            statementMap: { 0: { start: { line: 1 } } },
            s: { 0: 1 },
          },
        }),
        "utf8",
      )
      const analysis = analysisWithOneFile("src/App.ts")

      // Act
      const result = await importIstanbulCoverage(analysis, "C:\\repo\\project", coverageFile)

      // Assert
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) {
        expect(result.value.files[0]?.coverage).toEqual({ lines: 100 })
        expect(result.value.files[0]?.path).toBe("src/App.ts")
      }
    })
  })

  it("keeps POSIX project-file matching case-sensitive", async () => {
    await withTemporaryDirectory(async (temporaryDirectory) => {
      // Arrange
      const coverageFile = join(temporaryDirectory, "coverage-final.json")
      await writeFile(
        coverageFile,
        JSON.stringify({
          "/repo/project/src/APP.ts": {
            path: "/repo/project/src/APP.ts",
            statementMap: { 0: { start: { line: 1 } } },
            s: { 0: 1 },
          },
        }),
        "utf8",
      )
      const analysis = analysisWithOneFile("src/App.ts")

      // Act
      const result = await importIstanbulCoverage(analysis, "/repo/project", coverageFile)

      // Assert
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) {
        expect(result.value.files[0]?.coverage).toBeUndefined()
      }
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
    expect(result).toEqual(
      Result.Failure({
        _tag: "CoveragePathOutsideProject",
        projectRoot,
        coveragePath,
      }),
    )
  })
})

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
    schemaVersion: 2,
    project: { name: projectName },
    files: [],
    dependencies: [],
    diagnostics: [],
  }
}
