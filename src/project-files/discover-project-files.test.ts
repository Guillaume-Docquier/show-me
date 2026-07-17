import { mkdir, writeFile } from "node:fs/promises"
import { isAbsolute, join, relative } from "node:path"
import { Result } from "@guillaume-docquier/tools-ts"
import { expect, it } from "vitest"
import { analyzeProject } from "../analysis/analyze-project.js"
import { fixtureProjectPath } from "../testing/fixture-project.js"
import { withTemporaryDirectory } from "../testing/temporary-directory.js"
import { discoverProjectFiles } from "./discover-project-files.js"

it("discovers supported files while honoring declarations, ignore rules, and standard exclusions", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("discovery")

  // Act
  const result = await discoverProjectFiles({ projectRoot })

  // Assert
  expect(Result.isSuccess(result)).toBe(true)
  if (Result.isSuccess(result)) {
    expect(result.value.map(({ path, language }) => ({ path, language }))).toEqual([
      { path: "keep.generated.ts", language: "typescript" },
      { path: "nested/child.ts", language: "typescript" },
      { path: "nested/kept.js", language: "javascript" },
      { path: "src/app.js", language: "javascript" },
      { path: "src/component.jsx", language: "javascript" },
      { path: "src/legacy.cjs", language: "javascript" },
      { path: "src/legacy.cts", language: "typescript" },
      { path: "src/main.ts", language: "typescript" },
      { path: "src/module.mjs", language: "javascript" },
      { path: "src/module.mts", language: "typescript" },
      { path: "src/view.tsx", language: "typescript" },
    ])
  }
})

it("excludes conventional test and spec basenames across supported extensions", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("test-file-exclusions")

  // Act
  const result = await discoverProjectFiles({ projectRoot })

  // Assert
  expect(Result.isSuccess(result)).toBe(true)
  if (Result.isSuccess(result)) {
    expect(result.value.map(({ path }) => path)).toEqual([
      "src/__tests__/helper.ts",
      "src/app.ts",
      "src/aspect.ts",
      "src/contest.ts",
      "src/runtime.ts",
      "src/spec.ts",
      "src/suite.spec/helper.ts",
      "src/suite.test/helper.ts",
      "src/test.ts",
      "src/test/helper.ts",
      "src/tests/helper.ts",
    ])
  }
})

it("can include conventionally named test files without bypassing permanent exclusions", async () => {
  await withTemporaryDirectory(async (projectRoot) => {
    // Arrange
    await mkdir(join(projectRoot, "node_modules"), { recursive: true })
    await writeFile(join(projectRoot, ".gitignore"), "ignored.test.ts\n", "utf8")
    await writeFile(join(projectRoot, "ignored.test.ts"), "export const ignored = true", "utf8")
    await writeFile(join(projectRoot, "node_modules", "dependency.test.ts"), "export const dependency = true", "utf8")
    await writeFile(join(projectRoot, "types.test.d.ts"), "declare const types: true", "utf8")
    await writeFile(join(projectRoot, "asset.test.css"), "body {}", "utf8")
    await writeFile(join(projectRoot, "included.test.ts"), "export const included = true", "utf8")

    // Act
    const result = await discoverProjectFiles({ projectRoot, fileSelection: { testFiles: "include" } })

    // Assert
    expect(result).toEqual(
      Result.Success([
        expect.objectContaining({
          path: "included.test.ts",
          language: "typescript",
        }),
      ]),
    )
  })
})

it("resolves a relative discovery root before returning absolute file paths", async () => {
  // Arrange
  const projectRoot = relative(process.cwd(), fixtureProjectPath("minimal-javascript"))

  // Act
  const result = await discoverProjectFiles({ projectRoot })

  // Assert
  expect(Result.isSuccess(result)).toBe(true)
  if (Result.isSuccess(result)) {
    expect(result.value).toHaveLength(1)
    expect(isAbsolute(result.value[0]?.absolutePath ?? "")).toBe(true)
    expect(result.value[0]?.path).toBe("index.js")
  }
})

it("reports explicit, deterministic non-blank line counts for the discovery fixture", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("discovery")

  // Act
  const result = await analyzeProject({ projectRoot })

  // Assert
  expect(Result.isSuccess(result)).toBe(true)
  if (Result.isSuccess(result)) {
    expect(result.value.files.map(({ path, lines }) => ({ path, nonBlank: lines.nonBlank }))).toEqual([
      { path: "keep.generated.ts", nonBlank: 1 },
      { path: "nested/child.ts", nonBlank: 1 },
      { path: "nested/kept.js", nonBlank: 1 },
      { path: "src/app.js", nonBlank: 2 },
      { path: "src/component.jsx", nonBlank: 1 },
      { path: "src/legacy.cjs", nonBlank: 1 },
      { path: "src/legacy.cts", nonBlank: 1 },
      { path: "src/main.ts", nonBlank: 3 },
      { path: "src/module.mjs", nonBlank: 1 },
      { path: "src/module.mts", nonBlank: 1 },
      { path: "src/view.tsx", nonBlank: 1 },
    ])
  }
})

it("returns a typed discovery failure for a missing root", async () => {
  // Arrange
  const missingRoot = `${fixtureProjectPath("discovery")}-missing`

  // Act
  const result = await discoverProjectFiles({ projectRoot: missingRoot })

  // Assert
  expect(Result.isFailure(result)).toBe(true)
  if (Result.isFailure(result)) {
    expect(result.error._tag).toBe("ProjectDirectoryReadFailed")
  }
})

it("always excludes generated, dependency, coverage, and version-control directories", async () => {
  // Arrange
  await withTemporaryDirectory(async (projectRoot) => {
    const excludedDirectories = [".git", ".nyc_output", "build", "coverage", "dist", "node_modules", "out"]
    for (const directory of excludedDirectories) {
      const excludedDirectory = join(projectRoot, directory)
      await mkdir(excludedDirectory, { recursive: true })
      await writeFile(join(excludedDirectory, "excluded.ts"), "export const excluded = true")
    }
    await writeFile(join(projectRoot, "included.ts"), "export const included = true")

    // Act
    const result = await discoverProjectFiles({ projectRoot })

    // Assert
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.value.map(({ path }) => path)).toEqual(["included.ts"])
    }
  })
})
