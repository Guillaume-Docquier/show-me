import { readFile, stat } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { Result } from "@guillaume-docquier/tools-ts"
import {
  analyzeJavaScriptTypeScript,
  type JavaScriptTypeScriptAnalysisError,
  type JavaScriptTypeScriptSourceFile,
} from "../languages/javascript-typescript/analyze-javascript-typescript.js"
import { discoverProjectFiles, type ProjectFileDiscoveryError } from "../project-files/discover-project-files.js"
import type { ProjectFilePath } from "../project-files/project-file-path.js"
import type { ProjectFileSelection } from "../project-files/project-file-selection.js"
import { discoverPnpmWorkspace, owningWorkspacePackagePath, type PnpmWorkspaceDiscoveryError } from "../workspaces/pnpm-workspace.js"
import { PROJECT_ANALYSIS_SCHEMA_VERSION, type ProjectAnalysis } from "./project-analysis.js"

/**
 * A failure while reading the contents of a discovered project file.
 */
export type ProjectFileReadError = {
  readonly _tag: "ProjectFileReadFailed"
  readonly projectFile: ProjectFilePath
  readonly cause: Error
}

/**
 * Input for one project analysis.
 */
export type AnalyzeProjectInput = {
  readonly projectRoot: string
  readonly fileSelection?: ProjectFileSelection
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
  | JavaScriptTypeScriptAnalysisError
  | PnpmWorkspaceDiscoveryError

/**
 * Discover project files and collect language-neutral physical line metrics.
 *
 * @param input - Project root and optional overrideable file-selection policy.
 * @returns A deterministic project analysis, or a typed filesystem failure.
 */
export async function analyzeProject(input: AnalyzeProjectInput): Promise<Result<ProjectAnalysis, AnalyzeProjectError>> {
  const resolvedProjectRoot = resolve(input.projectRoot)
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

  const workspace = await discoverPnpmWorkspace(resolvedProjectRoot)
  if (Result.isFailure(workspace)) {
    return workspace
  }

  const discoveredFiles = await discoverProjectFiles({
    projectRoot: resolvedProjectRoot,
    ...(input.fileSelection === undefined ? {} : { fileSelection: input.fileSelection }),
  })
  if (Result.isFailure(discoveredFiles)) {
    return discoveredFiles
  }

  const sourceFiles: JavaScriptTypeScriptSourceFile[] = []
  for (const discoveredFile of discoveredFiles.value) {
    const sourceText = await Result.tryCatch(readFile(discoveredFile.absolutePath, "utf8"))
    if (Result.isFailure(sourceText)) {
      return Result.Failure({
        _tag: "ProjectFileReadFailed",
        projectFile: discoveredFile.path,
        cause: sourceText.error,
      })
    }

    sourceFiles.push({
      path: discoveredFile.path,
      absolutePath: discoveredFile.absolutePath,
      sourceText: sourceText.value,
      language: discoveredFile.language,
      ...(workspace.value === undefined ? {} : { workspacePackage: owningWorkspacePackagePath(workspace.value, discoveredFile.path) }),
    })
  }

  const languageAnalysis = analyzeJavaScriptTypeScript(resolvedProjectRoot, sourceFiles, workspace.value?.packages ?? [])
  if (Result.isFailure(languageAnalysis)) {
    return languageAnalysis
  }

  return Result.Success({
    schemaVersion: PROJECT_ANALYSIS_SCHEMA_VERSION,
    project: {
      name: basename(resolvedProjectRoot),
    },
    workspacePackages: (workspace.value?.packages ?? []).map(({ path, name }) => ({ path, name })),
    files: languageAnalysis.value.files,
    dependencies: languageAnalysis.value.dependencies,
    externalPackages: languageAnalysis.value.externalPackages,
    externalPackageDependencies: languageAnalysis.value.externalPackageDependencies,
    diagnostics: languageAnalysis.value.diagnostics,
  })
}
