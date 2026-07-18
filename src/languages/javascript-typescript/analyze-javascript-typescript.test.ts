import { readFile } from "node:fs/promises"
import { Result } from "@guillaume-docquier/tools-ts"
import { describe, expect, it } from "vitest"
import { discoverProjectFiles } from "../../project-files/discover-project-files.js"
import { fixtureProjectPath } from "../../testing/fixture-project.js"
import { analyzeJavaScriptTypeScript, type JavaScriptTypeScriptSourceFile } from "./analyze-javascript-typescript.js"

describe("analyzeJavaScriptTypeScript", () => {
  it("returns only language-neutral runtime dependencies and diagnostics for every supported static ESM form", async () => {
    // Arrange
    const projectRoot = fixtureProjectPath("static-esm")
    const files = await readDiscoveredSourceFiles(projectRoot)

    // Act
    const result = analyzeJavaScriptTypeScript(projectRoot, files)

    // Assert
    expect(result).toEqual(
      Result.Success({
        files: expect.arrayContaining([
          {
            path: "src/runtime.ts",
            language: "typescript",
            lines: { code: 1, comment: 0, blank: 0 },
            coverage: undefined,
          },
          {
            path: "src/side-effect.js",
            language: "javascript",
            lines: { code: 1, comment: 0, blank: 0 },
            coverage: undefined,
          },
        ]),
        dependencies: [
          { source: "src/cycle-a.ts", target: "src/cycle-b.ts", kind: "runtime" },
          { source: "src/cycle-b.ts", target: "src/cycle-a.ts", kind: "runtime" },
          { source: "src/main.ts", target: "src/default-export.ts", kind: "runtime" },
          { source: "src/main.ts", target: "src/directory/index.ts", kind: "runtime" },
          { source: "src/main.ts", target: "src/lib/aliased.ts", kind: "runtime" },
          { source: "src/main.ts", target: "src/mixed.ts", kind: "runtime" },
          { source: "src/main.ts", target: "src/ordinary-type.ts", kind: "runtime" },
          { source: "src/main.ts", target: "src/runtime.ts", kind: "runtime" },
          { source: "src/main.ts", target: "src/side-effect.js", kind: "runtime" },
          { source: "src/reexports.ts", target: "src/mixed.ts", kind: "runtime" },
          { source: "src/reexports.ts", target: "src/runtime.ts", kind: "runtime" },
          { source: "src/reexports.ts", target: "src/wildcard.ts", kind: "runtime" },
          { source: "src/self.ts", target: "src/self.ts", kind: "runtime" },
        ],
        externalPackages: [{ name: "external-package" }],
        externalPackageDependencies: [{ source: "src/main.ts", target: "external-package", kind: "runtime" }],
        diagnostics: [
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
        ],
      }),
    )
  })

  it("resolves relative JavaScript dependencies without a project configuration", async () => {
    // Arrange
    const projectRoot = fixtureProjectPath("static-esm-no-config")
    const files = await readDiscoveredSourceFiles(projectRoot)

    // Act
    const result = analyzeJavaScriptTypeScript(projectRoot, files)

    // Assert
    expect(result).toEqual(
      Result.Success({
        files: [
          {
            path: "index.js",
            language: "javascript",
            lines: { code: 2, comment: 0, blank: 1 },
            coverage: undefined,
          },
          {
            path: "target.js",
            language: "javascript",
            lines: { code: 1, comment: 0, blank: 0 },
            coverage: undefined,
          },
        ],
        dependencies: [{ source: "index.js", target: "target.js", kind: "runtime" }],
        externalPackages: [],
        externalPackageDependencies: [],
        diagnostics: [],
      }),
    )
  })

  it("resolves path aliases from the project configuration that applies to each importing file", async () => {
    // Arrange
    const projectRoot = fixtureProjectPath("path-aliases")
    const files = await readDiscoveredSourceFiles(projectRoot)

    // Act
    const result = analyzeJavaScriptTypeScript(projectRoot, files)

    // Assert
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.value.dependencies).toEqual([
        { source: "frontend/src/main.ts", target: "frontend/src/features/value.ts", kind: "runtime" },
        { source: "frontend/src/main.ts", target: "frontend/src/shared.ts", kind: "runtime" },
        { source: "javascript/src/main.js", target: "javascript/src/lib/value.js", kind: "runtime" },
      ])
      expect(result.value.externalPackages).toEqual([{ name: "uninstalled-package" }])
      expect(result.value.externalPackageDependencies).toEqual([
        { source: "frontend/src/main.ts", target: "uninstalled-package", kind: "runtime" },
      ])
      expect(result.value.diagnostics).toEqual([
        {
          code: "UNRESOLVED_RUNTIME_DEPENDENCY",
          message: 'Could not resolve runtime dependency "features/missing".',
          file: "frontend/src/main.ts",
        },
      ])
    }
  })

  it("normalizes external packages while configured aliases keep project-resolution precedence", async () => {
    // Arrange
    const projectRoot = fixtureProjectPath("external-packages")
    const files = await readDiscoveredSourceFiles(projectRoot)

    // Act
    const result = analyzeJavaScriptTypeScript(projectRoot, files)

    // Assert
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.value.dependencies).toEqual([
        { source: "src/entry.ts", target: "src/alias/value.ts", kind: "runtime" },
        { source: "src/entry.ts", target: "src/aliased.ts", kind: "runtime" },
      ])
      expect(result.value.externalPackages).toEqual([{ name: "@scope/package" }, { name: "react" }])
      expect(result.value.externalPackageDependencies).toEqual([
        { source: "src/consumer.ts", target: "@scope/package", kind: "runtime" },
        { source: "src/consumer.ts", target: "react", kind: "runtime" },
        { source: "src/entry.ts", target: "@scope/package", kind: "runtime" },
        { source: "src/entry.ts", target: "react", kind: "runtime" },
      ])
      expect(result.value.diagnostics).toEqual([
        {
          code: "UNRESOLVED_RUNTIME_DEPENDENCY",
          message: 'Could not resolve runtime dependency "missing-package-alias".',
          file: "src/entry.ts",
        },
      ])
    }
  })
})

async function readDiscoveredSourceFiles(projectRoot: string): Promise<readonly JavaScriptTypeScriptSourceFile[]> {
  const discoveredFiles = await discoverProjectFiles({ projectRoot })
  if (Result.isFailure(discoveredFiles)) {
    throw new Error(`Fixture discovery failed: ${discoveredFiles.error._tag}`)
  }

  return await Promise.all(
    discoveredFiles.value.map(async (file) => ({
      path: file.path,
      absolutePath: file.absolutePath,
      sourceText: await readFile(file.absolutePath, "utf8"),
      language: file.language,
    })),
  )
}
