import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Result } from "@guillaume-docquier/tools-ts"
import { expect, it } from "vitest"
import { fixtureProjectPath } from "../testing/fixture-project.js"
import { withTemporaryDirectory } from "../testing/temporary-directory.js"
import { analyzeProject } from "./analyze-project.js"

it("opens a real fixture through the analysis application seam", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("minimal-javascript")

  // Act
  const result = await analyzeProject({ projectRoot })

  // Assert
  expect(result).toEqual(
    Result.Success({
      schemaVersion: 2,
      project: {
        name: "minimal-javascript",
      },
      files: [
        {
          path: "index.js",
          language: "javascript",
          lines: { code: 1, comment: 0, blank: 0 },
          coverage: undefined,
        },
      ],
      dependencies: [],
      diagnostics: [],
    }),
  )
})

it("classifies CLOC-style metrics through the project analysis seam", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("cloc-line-breakdown")

  // Act
  const result = await analyzeProject({ projectRoot })

  // Assert
  expect(Result.isSuccess(result)).toBe(true)
  if (Result.isSuccess(result)) {
    expect(result.value.files.map(({ path, lines }) => ({ path, lines }))).toEqual([
      { path: "src/blank-only.ts", lines: { code: 0, comment: 0, blank: 1 } },
      { path: "src/categories.ts", lines: { code: 1, comment: 4, blank: 1 } },
      { path: "src/code-only.ts", lines: { code: 2, comment: 0, blank: 0 } },
      { path: "src/comment-only.ts", lines: { code: 0, comment: 2, blank: 0 } },
      { path: "src/hashbang.js", lines: { code: 0, comment: 2, blank: 0 } },
      { path: "src/syntax.tsx", lines: { code: 14, comment: 2, blank: 1 } },
      { path: "src/unicode.ts", lines: { code: 1, comment: 1, blank: 0 } },
    ])
  }
})

it("returns a typed failure when the project root is missing", async () => {
  // Arrange
  const missingProjectRoot = `${fixtureProjectPath("minimal-javascript")}-missing`

  // Act
  const result = await analyzeProject({ projectRoot: missingProjectRoot })

  // Assert
  expect(Result.isFailure(result)).toBe(true)
  if (Result.isFailure(result)) {
    expect(result.error._tag).toBe("ProjectRootReadFailed")
  }
})

it("integrates language-module dependencies and diagnostics into the project analysis", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("static-esm")

  // Act
  const result = await analyzeProject({ projectRoot })

  // Assert
  expect(Result.isSuccess(result)).toBe(true)
  if (Result.isSuccess(result)) {
    expect(result.value.dependencies).toContainEqual({
      source: "src/main.ts",
      target: "src/runtime.ts",
      kind: "runtime",
    })
    expect(result.value.diagnostics).toEqual([
      {
        code: "UNRESOLVED_RUNTIME_DEPENDENCY",
        message: 'Could not resolve runtime dependency "./missing.js".',
        file: "src/main.ts",
      },
      {
        code: "UNRESOLVED_RUNTIME_DEPENDENCY",
        message: 'Could not resolve runtime dependency "@lib/missing".',
        file: "src/main.ts",
      },
    ])
  }
})

it("does not read, parse, measure, or link default-excluded test files", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("test-file-exclusions")

  // Act
  const result = await analyzeProject({ projectRoot })

  // Assert
  expect(Result.isSuccess(result)).toBe(true)
  if (Result.isSuccess(result)) {
    expect(result.value.files.map(({ path, lines }) => ({ path, lines }))).toEqual([
      { path: "src/__tests__/helper.ts", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "src/app.ts", lines: { code: 3, comment: 0, blank: 1 } },
      { path: "src/aspect.ts", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "src/contest.ts", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "src/runtime.ts", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "src/spec.ts", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "src/suite.spec/helper.ts", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "src/suite.test/helper.ts", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "src/test.ts", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "src/test/helper.ts", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "src/tests/helper.ts", lines: { code: 1, comment: 0, blank: 0 } },
    ])
    expect(result.value.dependencies).toEqual([{ source: "src/app.ts", target: "src/runtime.ts", kind: "runtime" }])
    expect(result.value.diagnostics).toEqual([])
  }
})

it("includes test files through the typed selection seam and reports malformed source", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("test-file-exclusions")

  // Act
  const result = await analyzeProject({ projectRoot, fileSelection: { testFiles: "include" } })

  // Assert
  expect(Result.isSuccess(result)).toBe(true)
  if (Result.isSuccess(result)) {
    expect(result.value.files.map((file) => file.path)).toContain("src/runtime.test.ts")
    expect(result.value.files.map((file) => file.path)).toContain("src/broken.spec.gen.ts")
    expect(result.value.dependencies).toContainEqual({
      source: "src/runtime.test.ts",
      target: "src/app.ts",
      kind: "runtime",
    })
    expect(result.value.diagnostics).toContainEqual({
      code: "JAVASCRIPT_TYPESCRIPT_PARSE_ERROR",
      message: "Unexpected token",
      file: "src/broken.spec.gen.ts",
    })
  }
})

it("returns a typed resolver initialization failure for invalid project configuration", async () => {
  await withTemporaryDirectory(async (projectRoot) => {
    // Arrange
    await writeFile(join(projectRoot, "index.ts"), "export const value = true", "utf8")
    await writeFile(join(projectRoot, "tsconfig.json"), "{", "utf8")

    // Act
    const result = await analyzeProject({ projectRoot })

    // Assert
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.error._tag).toBe("JavaScriptTypeScriptResolverInitializationFailed")
    }
  })
})

it("sorts mixed-case and non-ASCII dependencies and diagnostics deterministically", async () => {
  await withTemporaryDirectory(async (projectRoot) => {
    // Arrange
    await writeFile(join(projectRoot, "B.ts"), "export const upper = true", "utf8")
    await writeFile(join(projectRoot, "a.ts"), "export const lower = true", "utf8")
    await writeFile(join(projectRoot, "é.ts"), "export const accented = true", "utf8")
    await writeFile(
      join(projectRoot, "entry.ts"),
      ['import "./é.js"', 'import "./a.js"', 'import "./B.js"', 'import "./z-missing.js"', 'import "./A-missing.js"'].join("\n"),
      "utf8",
    )

    // Act
    const result = await analyzeProject({ projectRoot })

    // Assert
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.value.dependencies.map(({ target }) => target)).toEqual(["B.ts", "a.ts", "é.ts"])
      expect(result.value.diagnostics.map(({ message }) => message)).toEqual([
        'Could not resolve runtime dependency "./A-missing.js".',
        'Could not resolve runtime dependency "./z-missing.js".',
      ])
    }
  })
})
