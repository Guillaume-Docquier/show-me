import { readFile } from "node:fs/promises"
import { Result } from "@guillaume-docquier/tools-ts"
import { describe, expect, it } from "vitest"
import { discoverProjectFiles } from "../../project-files/discover-project-files.js"
import { fixtureProjectPath } from "../../testing/fixture-project.js"
import { analyzeJavaScriptTypeScript, type JavaScriptTypeScriptSourceFile } from "./analyze-javascript-typescript.js"

describe("analyzeJavaScriptTypeScript", () => {
  it("returns language-neutral runtime and type-only dependencies for every supported static ESM form", async () => {
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
            lines: { code: 2, comment: 0, blank: 0 },
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
          { source: "src/main.ts", target: "src/lib/type-only.ts", kind: "type-only" },
          { source: "src/main.ts", target: "src/mixed.ts", kind: "runtime" },
          { source: "src/main.ts", target: "src/ordinary-type.ts", kind: "runtime" },
          { source: "src/main.ts", target: "src/runtime.ts", kind: "runtime" },
          { source: "src/main.ts", target: "src/side-effect.js", kind: "runtime" },
          { source: "src/main.ts", target: "src/types-only.ts", kind: "type-only" },
          { source: "src/reexports.ts", target: "src/mixed.ts", kind: "runtime" },
          { source: "src/reexports.ts", target: "src/runtime.ts", kind: "runtime" },
          { source: "src/reexports.ts", target: "src/types-only.ts", kind: "type-only" },
          { source: "src/reexports.ts", target: "src/wildcard.ts", kind: "runtime" },
          { source: "src/self.ts", target: "src/self.ts", kind: "runtime" },
        ],
        externalPackages: [{ name: "external-package" }, { name: "type-only-package" }],
        externalPackageDependencies: [
          { source: "src/main.ts", target: "external-package", kind: "runtime" },
          { source: "src/main.ts", target: "type-only-package", kind: "type-only" },
        ],
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
          {
            code: "UNRESOLVED_TYPE_ONLY_DEPENDENCY",
            message: 'Could not resolve type-only dependency "./missing-type.js".',
            file: "src/main.ts",
          },
          {
            code: "UNRESOLVED_TYPE_ONLY_DEPENDENCY",
            message: 'Could not resolve type-only dependency "@lib/missing-type".',
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

  it("analyzes literal CommonJS and dynamic dependencies while diagnosing non-literal expressions", async () => {
    // Arrange
    const projectRoot = fixtureProjectPath("import-compatibility")
    const files = await readDiscoveredSourceFiles(projectRoot)

    // Act
    const result = analyzeJavaScriptTypeScript(projectRoot, files)

    // Assert
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.value.dependencies).toEqual([
        { source: "src/commonjs-entry.cjs", target: "src/commonjs-target.cts", kind: "runtime" },
        { source: "src/entry.ts", target: "src/base-url-target.ts", kind: "runtime" },
        { source: "src/entry.ts", target: "src/conditional-alternate.ts", kind: "runtime" },
        { source: "src/entry.ts", target: "src/conditional.ts", kind: "runtime" },
        { source: "src/entry.ts", target: "src/dynamic.ts", kind: "runtime" },
        { source: "src/entry.ts", target: "src/esm.ts", kind: "runtime" },
        { source: "src/entry.ts", target: "src/mixed.ts", kind: "runtime" },
        { source: "src/entry.ts", target: "src/nested.ts", kind: "runtime" },
        { source: "src/module-entry.mjs", target: "src/module-target.mts", kind: "runtime" },
      ])
      expect(result.value.externalPackages).toEqual([{ name: "commonjs-package" }, { name: "dynamic-package" }])
      expect(result.value.externalPackageDependencies).toEqual([
        { source: "src/entry.ts", target: "commonjs-package", kind: "runtime" },
        { source: "src/entry.ts", target: "dynamic-package", kind: "runtime" },
      ])
      expect(result.value.diagnostics).toEqual([
        {
          code: "NON_LITERAL_COMMONJS_REQUIRE",
          message: "Could not analyze CommonJS require dependency because its argument is not a string literal.",
          file: "src/entry.ts",
        },
        {
          code: "NON_LITERAL_DYNAMIC_IMPORT",
          message: "Could not analyze dynamic import dependency because its argument is not a string literal.",
          file: "src/entry.ts",
        },
      ])
    }
  })

  it("resolves path aliases from the project configuration that applies to each source file", async () => {
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
