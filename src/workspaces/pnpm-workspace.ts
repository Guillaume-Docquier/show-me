import { readFile } from "node:fs/promises"
import { basename, dirname, join, resolve, sep } from "node:path"
import { Result, TypeGuard, isNodeJSError } from "@guillaume-docquier/tools-ts"
import { glob } from "tinyglobby"
import { parse } from "yaml"
import { compareText } from "../text/compare-text.js"

const PNPM_WORKSPACE_FILE = "pnpm-workspace.yaml"

/** Package-manifest fields used to resolve workspace-owned runtime requests. */
export type WorkspacePackageManifest = {
  readonly exports: unknown
  readonly main: string | undefined
  readonly module: string | undefined
}

/** One package participating in the analyzed pnpm workspace. */
export type WorkspacePackageDefinition = {
  /** Stable project-relative identity; the workspace root is `"."`. */
  readonly path: string
  readonly name: string
  readonly absoluteRoot: string
  readonly manifest: WorkspacePackageManifest
}

/** A discovered pnpm workspace and its root-first deterministic packages. */
export type PnpmWorkspace = {
  readonly packages: readonly WorkspacePackageDefinition[]
}

/** Expected failure while discovering pnpm workspace packages. */
export type PnpmWorkspaceDiscoveryError =
  | {
      readonly _tag: "PnpmWorkspaceReadFailed"
      readonly workspaceFile: string
      readonly cause: Error
    }
  | {
      readonly _tag: "PnpmWorkspaceInvalid"
      readonly workspaceFile: string
      readonly cause: Error
    }
  | {
      readonly _tag: "WorkspacePackageDiscoveryFailed"
      readonly workspaceFile: string
      readonly cause: Error
    }
  | {
      readonly _tag: "WorkspacePackageManifestReadFailed"
      readonly packageManifest: string
      readonly cause: Error
    }
  | {
      readonly _tag: "WorkspacePackageManifestInvalid"
      readonly packageManifest: string
      readonly cause: Error
    }
  | {
      readonly _tag: "DuplicateWorkspacePackageName"
      readonly packageName: string
      readonly packagePaths: readonly [string, string]
    }

/**
 * Discover the pnpm workspace rooted at a project, if one is declared.
 *
 * @param projectRoot - Absolute analyzed project root.
 * @returns No workspace, deterministic package definitions, or a typed configuration failure.
 */
export async function discoverPnpmWorkspace(projectRoot: string): Promise<Result<PnpmWorkspace | undefined, PnpmWorkspaceDiscoveryError>> {
  const workspaceFile = join(projectRoot, PNPM_WORKSPACE_FILE)
  const workspaceContents = await Result.tryCatch(readFile(workspaceFile, "utf8"))
  if (Result.isFailure(workspaceContents)) {
    if (isNodeJSError(workspaceContents.error) && workspaceContents.error.code === "ENOENT") {
      return Result.Success(undefined)
    }
    return Result.Failure({ _tag: "PnpmWorkspaceReadFailed", workspaceFile, cause: workspaceContents.error })
  }

  const packagePatterns = parseWorkspacePackagePatterns(workspaceFile, workspaceContents.value)
  if (Result.isFailure(packagePatterns)) {
    return packagePatterns
  }

  const manifestPatterns = ["package.json", ...packagePatterns.value.map((pattern) => packageManifestPattern(pattern))]
  const packageManifests = await Result.tryCatch(
    glob(manifestPatterns, {
      cwd: projectRoot,
      dot: true,
      followSymbolicLinks: false,
      onlyFiles: true,
      ignore: ["**/node_modules/**"],
    }),
  )
  if (Result.isFailure(packageManifests)) {
    return Result.Failure({
      _tag: "WorkspacePackageDiscoveryFailed",
      workspaceFile,
      cause: packageManifests.error,
    })
  }

  const manifestPaths = [...new Set(packageManifests.value.map(normalizePath))].sort(compareText)
  if (!manifestPaths.includes("package.json")) {
    manifestPaths.unshift("package.json")
  }

  const packages: WorkspacePackageDefinition[] = []
  for (const manifestPath of manifestPaths) {
    const packagePath = normalizePackagePath(dirname(manifestPath))
    const packageManifest = resolve(projectRoot, manifestPath)
    const definition = await readWorkspacePackageDefinition(projectRoot, packagePath, packageManifest)
    if (Result.isFailure(definition)) {
      if (
        packagePath === "." &&
        definition.error._tag === "WorkspacePackageManifestReadFailed" &&
        isNodeJSError(definition.error.cause) &&
        definition.error.cause.code === "ENOENT"
      ) {
        packages.push({
          path: ".",
          name: basename(projectRoot),
          absoluteRoot: projectRoot,
          manifest: { exports: undefined, main: undefined, module: undefined },
        })
        continue
      }
      return definition
    }
    packages.push(definition.value)
  }

  const packagePathByName = new Map<string, string>()
  for (const workspacePackage of packages) {
    const existingPath = packagePathByName.get(workspacePackage.name)
    if (existingPath !== undefined) {
      return Result.Failure({
        _tag: "DuplicateWorkspacePackageName",
        packageName: workspacePackage.name,
        packagePaths: [existingPath, workspacePackage.path],
      })
    }
    packagePathByName.set(workspacePackage.name, workspacePackage.path)
  }

  return Result.Success({
    packages: packages.sort((left, right) => {
      if (left.path === ".") {
        return -1
      }
      if (right.path === ".") {
        return 1
      }
      return compareText(left.path, right.path)
    }),
  })
}

/**
 * Find the nearest workspace package owning one project-relative file.
 *
 * @param workspace - Discovered pnpm workspace.
 * @param projectFile - Normalized project-relative file path.
 * @returns The nearest package path, including the workspace root fallback.
 */
export function owningWorkspacePackagePath(workspace: PnpmWorkspace, projectFile: string): string {
  const nestedPackages = workspace.packages
    .filter((workspacePackage) => workspacePackage.path !== ".")
    .sort((left, right) => {
      const depthComparison = right.path.length - left.path.length
      return depthComparison === 0 ? compareText(left.path, right.path) : depthComparison
    })
  return nestedPackages.find((workspacePackage) => projectFile.startsWith(`${workspacePackage.path}/`))?.path ?? "."
}

function parseWorkspacePackagePatterns(workspaceFile: string, contents: string): Result<readonly string[], PnpmWorkspaceDiscoveryError> {
  const parsed = Result.tryCatch((): unknown => parse(contents))
  if (Result.isFailure(parsed)) {
    return Result.Failure({ _tag: "PnpmWorkspaceInvalid", workspaceFile, cause: parsed.error })
  }
  if (!TypeGuard.isRecord(parsed.value)) {
    return Result.Failure({
      _tag: "PnpmWorkspaceInvalid",
      workspaceFile,
      cause: new Error("Expected a top-level YAML mapping."),
    })
  }
  if (parsed.value.packages === undefined) {
    return Result.Success([])
  }
  if (!TypeGuard.isArray(parsed.value.packages)) {
    return Result.Failure({
      _tag: "PnpmWorkspaceInvalid",
      workspaceFile,
      cause: new Error('Expected "packages" to be an array when present.'),
    })
  }

  const patterns: string[] = []
  for (const pattern of parsed.value.packages) {
    if (!TypeGuard.isString(pattern) || pattern.length === 0) {
      return Result.Failure({
        _tag: "PnpmWorkspaceInvalid",
        workspaceFile,
        cause: new Error("Every workspace package pattern must be a non-empty string."),
      })
    }
    patterns.push(pattern)
  }
  return Result.Success(patterns)
}

function packageManifestPattern(pattern: string): string {
  const negated = pattern.startsWith("!")
  const packagePattern = negated ? pattern.slice(1) : pattern
  const normalized = packagePattern.replaceAll("\\", "/").replace(/\/+$/u, "")
  return `${negated ? "!" : ""}${normalized}/package.json`
}

async function readWorkspacePackageDefinition(
  projectRoot: string,
  packagePath: string,
  packageManifest: string,
): Promise<Result<WorkspacePackageDefinition, PnpmWorkspaceDiscoveryError>> {
  const contents = await Result.tryCatch(readFile(packageManifest, "utf8"))
  if (Result.isFailure(contents)) {
    return Result.Failure({ _tag: "WorkspacePackageManifestReadFailed", packageManifest, cause: contents.error })
  }
  const parsed = Result.tryCatch((): unknown => JSON.parse(contents.value))
  if (Result.isFailure(parsed) || !TypeGuard.isRecord(parsed.value)) {
    return Result.Failure({
      _tag: "WorkspacePackageManifestInvalid",
      packageManifest,
      cause: Result.isFailure(parsed) ? parsed.error : new Error("Expected a JSON object."),
    })
  }

  const defaultName = packagePath === "." ? basename(projectRoot) : basename(packagePath)
  return Result.Success({
    path: packagePath,
    name: TypeGuard.isString(parsed.value.name) ? parsed.value.name : defaultName,
    absoluteRoot: packagePath === "." ? projectRoot : resolve(projectRoot, packagePath.split("/").join(sep)),
    manifest: {
      exports: parsed.value.exports,
      main: TypeGuard.isString(parsed.value.main) ? parsed.value.main : undefined,
      module: TypeGuard.isString(parsed.value.module) ? parsed.value.module : undefined,
    },
  })
}

function normalizePackagePath(path: string): string {
  const normalized = normalizePath(path)
  return normalized === "" ? "." : normalized
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//u, "")
}
