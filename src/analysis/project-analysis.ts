import type { ProjectFilePath } from "../project-files/project-file-path.js"
import type { ExternalPackageName } from "./external-package-name.js"

/**
 * The schema version of the internal project analysis model.
 */
export const PROJECT_ANALYSIS_SCHEMA_VERSION = 4

/**
 * A language family understood by a language module.
 */
export type LanguageId = string

/**
 * Line metrics collected for one project file.
 */
export type ProjectFileLines = {
  /**
   * Physical lines containing code, including mixed code-and-comment lines.
   */
  readonly code: number
  /**
   * Physical lines containing only comments and whitespace.
   */
  readonly comment: number
  /**
   * Physical lines containing only whitespace.
   */
  readonly blank: number
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
  readonly workspacePackage?: string
}

/** One package participating in the analyzed pnpm workspace. */
export type WorkspacePackageAnalysis = {
  /** Stable project-relative identity; the workspace root is `"."`. */
  readonly path: string
  readonly name: string
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
 * One external package referenced by project code without analyzing package files.
 */
export type ExternalPackageAnalysis = {
  readonly name: ExternalPackageName
}

/**
 * A directed runtime dependency from a project file to an external package.
 */
export type ExternalPackageDependency = {
  readonly source: ProjectFilePath
  readonly target: ExternalPackageName
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
  readonly workspacePackages: readonly WorkspacePackageAnalysis[]
  readonly files: readonly ProjectFileAnalysis[]
  readonly dependencies: readonly ProjectDependency[]
  readonly externalPackages: readonly ExternalPackageAnalysis[]
  readonly externalPackageDependencies: readonly ExternalPackageDependency[]
  readonly diagnostics: readonly AnalysisDiagnostic[]
}
