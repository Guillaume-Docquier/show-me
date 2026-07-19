import { readFile, readdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import { Result } from "@guillaume-docquier/tools-ts"
import ignore, { type Ignore } from "ignore"
import {
  javaScriptTypeScriptLanguageForProjectPath,
  type JavaScriptTypeScriptLanguageId,
} from "../languages/javascript-typescript/javascript-typescript-file-support.js"
import { compareText } from "../text/compare-text.js"
import { ProjectFilePath, type InvalidProjectFilePath } from "./project-file-path.js"
import { DEFAULT_PROJECT_FILE_SELECTION, isProjectFileSelected, type ProjectFileSelection } from "./project-file-selection.js"

const STANDARD_EXCLUDED_DIRECTORIES = new Set([".git", ".nyc_output", "build", "coverage", "dist", "node_modules", "out"])

type IgnoreContext = {
  readonly basePath: string
  readonly matcher: Ignore
}

/**
 * A supported source file found below a project root.
 */
export type DiscoveredProjectFile = {
  readonly path: ProjectFilePath
  readonly absolutePath: string
  readonly language: JavaScriptTypeScriptLanguageId
}

/**
 * Input for deterministic project-file discovery.
 */
export type DiscoverProjectFilesInput = {
  readonly projectRoot: string
  readonly fileSelection?: ProjectFileSelection
}

/**
 * An expected failure while discovering project files.
 */
export type ProjectFileDiscoveryError =
  | {
      readonly _tag: "ProjectDirectoryReadFailed"
      readonly directory: string
      readonly cause: Error
    }
  | {
      readonly _tag: "ProjectIgnoreFileReadFailed"
      readonly ignoreFile: string
      readonly cause: Error
    }
  | {
      readonly _tag: "ProjectPathNormalizationFailed"
      readonly absolutePath: string
      readonly cause: InvalidProjectFilePath
    }

/**
 * Discover supported project files in deterministic project-relative order.
 *
 * Local `.gitignore` files are evaluated from the project root toward each
 * descendant. Standard generated and dependency directories are always excluded.
 * Symbolic links are not followed during the initial single-repository implementation.
 *
 * @param input - Project root and optional overrideable file-selection policy.
 * @returns Supported files, or a typed filesystem/path failure.
 */
export async function discoverProjectFiles(
  input: DiscoverProjectFilesInput,
): Promise<Result<readonly DiscoveredProjectFile[], ProjectFileDiscoveryError>> {
  const projectRoot = resolve(input.projectRoot)
  const fileSelection = input.fileSelection ?? DEFAULT_PROJECT_FILE_SELECTION
  const discoveredFiles: DiscoveredProjectFile[] = []
  const walkResult = await walkDirectory(projectRoot, "", [], fileSelection, discoveredFiles)

  if (Result.isFailure(walkResult)) {
    return walkResult
  }

  discoveredFiles.sort((left, right) => ProjectFilePath.compare(left.path, right.path))
  return Result.Success(discoveredFiles)
}

async function walkDirectory(
  projectRoot: string,
  relativeDirectory: string,
  parentIgnoreContexts: readonly IgnoreContext[],
  fileSelection: ProjectFileSelection,
  discoveredFiles: DiscoveredProjectFile[],
): Promise<Result<void, ProjectFileDiscoveryError>> {
  const absoluteDirectory = join(projectRoot, ...splitProjectPath(relativeDirectory))
  const directoryEntriesResult = await Result.tryCatch(readdir(absoluteDirectory, { withFileTypes: true }))

  if (Result.isFailure(directoryEntriesResult)) {
    return Result.Failure({
      _tag: "ProjectDirectoryReadFailed",
      directory: absoluteDirectory,
      cause: directoryEntriesResult.error,
    })
  }

  // oxlint-disable-next-line unicorn/no-array-sort -- We're working on a controlled copy, we don't need another one
  const directoryEntries = directoryEntriesResult.value.sort((left, right) => compareText(left.name, right.name))
  const localIgnoreContextResult = await readLocalIgnoreContext(
    absoluteDirectory,
    relativeDirectory,
    directoryEntries.some((entry) => entry.isFile() && entry.name === ".gitignore"),
  )

  if (Result.isFailure(localIgnoreContextResult)) {
    return localIgnoreContextResult
  }

  const ignoreContexts =
    localIgnoreContextResult.value === undefined ? parentIgnoreContexts : [...parentIgnoreContexts, localIgnoreContextResult.value]

  for (const entry of directoryEntries) {
    if (entry.name === ".gitignore" || entry.isSymbolicLink()) {
      continue
    }

    const relativePath = appendProjectPath(relativeDirectory, entry.name)

    if (entry.isDirectory()) {
      if (STANDARD_EXCLUDED_DIRECTORIES.has(entry.name) || isIgnored(relativePath, "directory", ignoreContexts)) {
        continue
      }

      const childResult = await walkDirectory(projectRoot, relativePath, ignoreContexts, fileSelection, discoveredFiles)
      if (Result.isFailure(childResult)) {
        return childResult
      }
      continue
    }

    if (!entry.isFile() || isIgnored(relativePath, "file", ignoreContexts)) {
      continue
    }

    const language = javaScriptTypeScriptLanguageForProjectPath(relativePath)
    if (language === undefined) {
      continue
    }

    if (!isProjectFileSelected(entry.name, fileSelection)) {
      continue
    }

    const projectFilePath = ProjectFilePath.parse(relativePath)
    if (Result.isFailure(projectFilePath)) {
      return Result.Failure({
        _tag: "ProjectPathNormalizationFailed",
        absolutePath: join(absoluteDirectory, entry.name),
        cause: projectFilePath.error,
      })
    }

    discoveredFiles.push({
      path: projectFilePath.value,
      absolutePath: join(absoluteDirectory, entry.name),
      language,
    })
  }

  return Result.Success(undefined)
}

async function readLocalIgnoreContext(
  absoluteDirectory: string,
  relativeDirectory: string,
  hasIgnoreFile: boolean,
): Promise<Result<IgnoreContext | undefined, ProjectFileDiscoveryError>> {
  if (!hasIgnoreFile) {
    return Result.Success(undefined)
  }

  const ignoreFile = join(absoluteDirectory, ".gitignore")
  const ignoreContents = await Result.tryCatch(readFile(ignoreFile, "utf8"))

  if (Result.isFailure(ignoreContents)) {
    return Result.Failure({
      _tag: "ProjectIgnoreFileReadFailed",
      ignoreFile,
      cause: ignoreContents.error,
    })
  }

  return Result.Success({
    basePath: relativeDirectory,
    matcher: ignore().add(ignoreContents.value),
  })
}

function isIgnored(relativePath: string, kind: "directory" | "file", ignoreContexts: readonly IgnoreContext[]): boolean {
  let ignored = false

  for (const context of ignoreContexts) {
    const pathFromContext = removeProjectPathPrefix(relativePath, context.basePath)
    const result = context.matcher.test(kind === "directory" ? `${pathFromContext}/` : pathFromContext)

    if (result.ignored) {
      ignored = true
    } else if (result.unignored) {
      ignored = false
    }
  }

  return ignored
}

function appendProjectPath(parent: string, child: string): string {
  return parent.length === 0 ? child : `${parent}/${child}`
}

function removeProjectPathPrefix(projectPath: string, prefix: string): string {
  return prefix.length === 0 ? projectPath : projectPath.slice(prefix.length + 1)
}

function splitProjectPath(projectPath: string): string[] {
  return projectPath.length === 0 ? [] : projectPath.split("/")
}
