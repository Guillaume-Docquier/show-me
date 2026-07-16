import { readFile, stat } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { Result } from "@guillaume-docquier/tools-ts"
import { countNonBlankPhysicalLines } from "../project-files/count-non-blank-physical-lines.js"
import { discoverProjectFiles, type ProjectFileDiscoveryError } from "../project-files/discover-project-files.js"
import { PROJECT_ANALYSIS_SCHEMA_VERSION, type ProjectAnalysis, type ProjectFileAnalysis } from "./project-analysis.js"

/**
 * A failure while reading the contents of a discovered project file.
 */
export type ProjectFileReadError = {
  readonly _tag: "ProjectFileReadFailed"
  readonly projectFile: string
  readonly cause: Error
}

/**
 * An expected failure while analyzing a project.
 */
export type AnalyzeProjectError =
  | {
      readonly _tag: "ProjectRootReadFailed"
      readonly projectRoot: string
      readonly cause: Error
    }
  | {
      readonly _tag: "ProjectRootNotDirectory"
      readonly projectRoot: string
    }
  | ProjectFileDiscoveryError
  | ProjectFileReadError

/**
 * Discover project files and collect language-neutral physical line metrics.
 *
 * @param projectRoot - Directory to analyze.
 * @returns A deterministic project analysis, or a typed filesystem failure.
 */
export async function analyzeProject(projectRoot: string): Promise<Result<ProjectAnalysis, AnalyzeProjectError>> {
  const resolvedProjectRoot = resolve(projectRoot)
  const projectRootStats = await Result.tryCatch(stat(resolvedProjectRoot))

  if (Result.isFailure(projectRootStats)) {
    return Result.Failure({
      _tag: "ProjectRootReadFailed",
      projectRoot: resolvedProjectRoot,
      cause: projectRootStats.error,
    })
  }

  if (!projectRootStats.value.isDirectory()) {
    return Result.Failure({
      _tag: "ProjectRootNotDirectory",
      projectRoot: resolvedProjectRoot,
    })
  }

  const discoveredFiles = await discoverProjectFiles(resolvedProjectRoot)
  if (Result.isFailure(discoveredFiles)) {
    return discoveredFiles
  }

  const files: ProjectFileAnalysis[] = []
  for (const discoveredFile of discoveredFiles.value) {
    const sourceText = await Result.tryCatch(readFile(discoveredFile.absolutePath, "utf8"))
    if (Result.isFailure(sourceText)) {
      return Result.Failure({
        _tag: "ProjectFileReadFailed",
        projectFile: discoveredFile.path,
        cause: sourceText.error,
      })
    }

    files.push({
      path: discoveredFile.path,
      language: discoveredFile.language,
      lines: {
        nonBlank: countNonBlankPhysicalLines(sourceText.value),
      },
      coverage: undefined,
    })
  }

  return Result.Success({
    schemaVersion: PROJECT_ANALYSIS_SCHEMA_VERSION,
    project: {
      name: basename(resolvedProjectRoot),
    },
    files,
    dependencies: [],
    diagnostics: [],
  })
}
