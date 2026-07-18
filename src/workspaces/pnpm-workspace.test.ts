import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Result } from "@guillaume-docquier/tools-ts"
import { expect, it } from "vitest"
import { fixtureProjectPath } from "../testing/fixture-project.js"
import { withTemporaryDirectory } from "../testing/temporary-directory.js"
import { discoverPnpmWorkspace, owningWorkspacePackagePath } from "./pnpm-workspace.js"

it("discovers workspace globs, exclusions, nested packages, and root ownership deterministically", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("pnpm-workspace")

  // Act
  const result = await discoverPnpmWorkspace(projectRoot)

  // Assert
  expect(Result.isSuccess(result)).toBe(true)
  if (Result.isSuccess(result) && result.value !== undefined) {
    expect(result.value.packages.map(({ path, name }) => ({ path, name }))).toEqual([
      { path: ".", name: "@fixture/root" },
      { path: "apps/backend", name: "@fixture/backend" },
      { path: "apps/frontend", name: "@fixture/frontend" },
      { path: "packages/platform/shared", name: "@fixture/shared" },
    ])
    expect(owningWorkspacePackagePath(result.value, "apps/frontend/src/main.ts")).toBe("apps/frontend")
    expect(owningWorkspacePackagePath(result.value, "packages/platform/shared/src/value.ts")).toBe("packages/platform/shared")
    expect(owningWorkspacePackagePath(result.value, "packages/excluded/src/index.ts")).toBe(".")
    expect(owningWorkspacePackagePath(result.value, "root.ts")).toBe(".")
  }
})

it("treats a pnpm settings file without package patterns as a root-only workspace", async () => {
  await withTemporaryDirectory(async (projectRoot) => {
    // Arrange
    await writeFile(join(projectRoot, "pnpm-workspace.yaml"), "strictPeerDependencies: true\n", "utf8")
    await writeFile(join(projectRoot, "package.json"), '{"name":"root-only"}', "utf8")

    // Act
    const result = await discoverPnpmWorkspace(projectRoot)

    // Assert
    expect(result).toEqual(
      Result.Success({
        packages: [
          {
            path: ".",
            name: "root-only",
            absoluteRoot: projectRoot,
            manifest: { exports: undefined, main: undefined, module: undefined },
          },
        ],
      }),
    )
  })
})
