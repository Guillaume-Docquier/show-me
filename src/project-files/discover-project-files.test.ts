import { mkdir, writeFile } from "node:fs/promises"
import { isAbsolute, join, relative } from "node:path"
import { Result } from "@guillaume-docquier/tools-ts"
import { expect, it } from "vitest"
import { analyzeProject } from "../analysis/analyze-project.js"
import { fixtureProjectPath } from "../testing/fixture-project.js"
import { withTemporaryDirectory } from "../testing/temporary-directory.js"
import { discoverProjectFiles } from "./discover-project-files.js"
import { ProjectFileSelection, type ProjectFileSelection as ProjectFileSelectionInput } from "./project-file-selection.js"

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
    const result = await discoverProjectFiles({ projectRoot, fileSelection: selection([]) })

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

it("uses custom patterns instead of the built-in test and spec exclusions", async () => {
  await withTemporaryDirectory(async (projectRoot) => {
    // Arrange
    await writeFile(join(projectRoot, "app.ts"), "export const app = true", "utf8")
    await writeFile(join(projectRoot, "app.test.ts"), "export const test = true", "utf8")
    await writeFile(join(projectRoot, "app.spec.ts"), "export const spec = true", "utf8")
    await writeFile(join(projectRoot, "drop.generated.ts"), "export const generated = true", "utf8")

    // Act
    const result = await discoverProjectFiles({ projectRoot, fileSelection: selection(["*.generated.*"]) })

    // Assert
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.value.map(({ path }) => path)).toEqual(["app.spec.ts", "app.test.ts", "app.ts"])
    }
  })
})

it("combines explicitly restated test and spec patterns with additional exclusions", async () => {
  await withTemporaryDirectory(async (projectRoot) => {
    // Arrange
    await mkdir(join(projectRoot, "src"))
    await writeFile(join(projectRoot, "src", "app.ts"), "export const app = true", "utf8")
    await writeFile(join(projectRoot, "src", "app.test.ts"), "export const test = true", "utf8")
    await writeFile(join(projectRoot, "src", "app.spec.ts"), "export const spec = true", "utf8")
    await writeFile(join(projectRoot, "src", "drop.generated.ts"), "export const generated = true", "utf8")

    // Act
    const result = await discoverProjectFiles({
      projectRoot,
      fileSelection: selection(["*.test.*", "*.spec.*", "src/*.generated.*"]),
    })

    // Assert
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.value.map(({ path }) => path)).toEqual(["src/app.ts"])
    }
  })
})

it("matches custom patterns from the project root without requiring Git tracking", async () => {
  await withTemporaryDirectory(async (projectRoot) => {
    // Arrange
    await mkdir(join(projectRoot, "nested"))
    await writeFile(join(projectRoot, "root.ts"), "export const root = true", "utf8")
    await writeFile(join(projectRoot, "nested", "root.ts"), "export const nested = true", "utf8")

    // Act
    const result = await discoverProjectFiles({ projectRoot, fileSelection: selection(["/root.ts"]) })

    // Assert
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.value.map(({ path }) => path)).toEqual(["nested/root.ts"])
    }
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

it("reports explicit, deterministic line categories for the discovery fixture", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("discovery")

  // Act
  const result = await analyzeProject({ projectRoot })

  // Assert
  expect(Result.isSuccess(result)).toBe(true)
  if (Result.isSuccess(result)) {
    expect(result.value.files.map(({ path, lines }) => ({ path, lines }))).toEqual([
      { path: "keep.generated.ts", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "nested/child.ts", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "nested/kept.js", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "src/app.js", lines: { code: 1, comment: 1, blank: 1 } },
      { path: "src/component.jsx", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "src/legacy.cjs", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "src/legacy.cts", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "src/main.ts", lines: { code: 2, comment: 1, blank: 0 } },
      { path: "src/module.mjs", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "src/module.mts", lines: { code: 1, comment: 0, blank: 0 } },
      { path: "src/view.tsx", lines: { code: 1, comment: 0, blank: 0 } },
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

function selection(exclusionPatterns: readonly string[]): ProjectFileSelectionInput {
  const result = ProjectFileSelection.parse(exclusionPatterns)
  if (Result.isFailure(result)) {
    throw new Error(`Invalid test exclusion pattern: ${result.error.pattern}`)
  }
  return result.value
}
