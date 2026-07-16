import { stat } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { Result } from "@guillaume-docquier/tools-ts"
import { createEmptyProjectAnalysis, type ProjectAnalysis } from "./project-analysis.js"

/**
 * An expected failure while opening a project for analysis.
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

/**
 * Open a project and establish its language-neutral analysis.
 *
 * File discovery and metrics are added by the next milestone. This seam already
 * performs real project-root I/O so callers and tests do not depend on a fake analyzer.
 *
 * @param projectRoot - Directory to analyze.
 * @returns An empty project analysis, or a typed project-root failure.
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

  return Result.Success(createEmptyProjectAnalysis(basename(resolvedProjectRoot)))
}
