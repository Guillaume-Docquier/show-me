import type { ProjectFilePath } from "../project-files/project-file-path.js"

/**
 * The schema version of the internal project analysis model.
 */
export const PROJECT_ANALYSIS_SCHEMA_VERSION = 1

/**
 * A language family understood by a language module.
 */
export type LanguageId = string

/**
 * Line metrics collected for one project file.
 */
export type ProjectFileLines = {
  /**
   * Non-blank physical lines, including comments.
   */
  readonly nonBlank: number
}

/**
 * Line coverage attached to one project file.
 */
export type ProjectFileCoverage = {
  /**
   * Covered executable lines as a percentage from 0 through 100.
   */
  readonly lines: number
}

/**
 * Language-neutral analysis of one project file.
 */
export type ProjectFileAnalysis = {
  readonly path: ProjectFilePath
  readonly language: LanguageId
  readonly lines: ProjectFileLines
  readonly coverage: ProjectFileCoverage | undefined
}

/**
 * A directed runtime dependency between two project files.
 */
export type ProjectDependency = {
  readonly source: ProjectFilePath
  readonly target: ProjectFilePath
  readonly kind: "runtime"
}

/**
 * A non-fatal issue discovered during analysis.
 */
export type AnalysisDiagnostic = {
  readonly code: string
  readonly message: string
  readonly file: ProjectFilePath | undefined
}

/**
 * The language-neutral internal analysis consumed by report generation.
 */
export type ProjectAnalysis = {
  readonly schemaVersion: typeof PROJECT_ANALYSIS_SCHEMA_VERSION
  readonly project: {
    readonly name: string
  }
  readonly files: readonly ProjectFileAnalysis[]
  readonly dependencies: readonly ProjectDependency[]
  readonly diagnostics: readonly AnalysisDiagnostic[]
}

/**
 * Create an analysis before language-specific file data has been added.
 *
 * @param projectName - Display name of the analyzed project.
 * @returns An empty, versioned project analysis.
 */
export function createEmptyProjectAnalysis(projectName: string): ProjectAnalysis {
  return {
    schemaVersion: PROJECT_ANALYSIS_SCHEMA_VERSION,
    project: {
      name: projectName,
    },
    files: [],
    dependencies: [],
    diagnostics: [],
  }
}
