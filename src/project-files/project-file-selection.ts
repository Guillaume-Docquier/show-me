import { Result, branded, type Branded } from "@guillaume-docquier/tools-ts"
import ignore from "ignore"
import type { ProjectFilePath } from "./project-file-path.js"

/**
 * A parsed, project-relative gitignore-style pattern that can only exclude files.
 */
export type ProjectFileExclusionPattern = Branded<string, "ProjectFileExclusionPattern">

/**
 * The reason an exclusion pattern could not be parsed.
 */
export type InvalidProjectFileExclusionPattern = {
  readonly _tag: "InvalidProjectFileExclusionPattern"
  readonly pattern: string
  readonly reason: "empty" | "multiline" | "comment" | "negated" | "backslash" | "absolute" | "dot-segment"
}

/**
 * Overrideable project-file selection for one analysis.
 */
export type ProjectFileSelection = {
  readonly exclusionPatterns: readonly ProjectFileExclusionPattern[]
}

const DEFAULT_EXCLUSION_PATTERNS = ["*.test.*", "*.spec.*"] as const

/**
 * Built-in project-file selection used when no override is supplied.
 */
export const DEFAULT_PROJECT_FILE_SELECTION: ProjectFileSelection = {
  exclusionPatterns: DEFAULT_EXCLUSION_PATTERNS.map((pattern) => branded<ProjectFileExclusionPattern>(pattern)),
}

/**
 * Operations for constructing project-file selection.
 */
export const ProjectFileSelection = {
  /**
   * Parse a complete set of project-relative exclusion patterns.
   *
   * Patterns follow case-insensitive gitignore matching with forward-slash paths.
   * Negation is rejected because file selection may only remove eligible files.
   *
   * @param exclusionPatterns - The complete pattern set for one analysis.
   * @returns Parsed selection, or the first invalid pattern.
   */
  parse(exclusionPatterns: readonly string[]): Result<ProjectFileSelection, InvalidProjectFileExclusionPattern> {
    const parsedPatterns: ProjectFileExclusionPattern[] = []

    for (const pattern of exclusionPatterns) {
      const parsedPattern = parseExclusionPattern(pattern)
      if (Result.isFailure(parsedPattern)) {
        return parsedPattern
      }
      parsedPatterns.push(parsedPattern.value)
    }

    return Result.Success({ exclusionPatterns: parsedPatterns })
  },
}

/**
 * Compile one selection into the discovery matcher used for every eligible file.
 *
 * @param selection - Parsed selection for this analysis.
 * @returns A predicate that accepts a normalized project file path.
 */
export function createProjectFileSelectionMatcher(selection: ProjectFileSelection): (projectPath: ProjectFilePath) => boolean {
  const matcher = ignore({ ignorecase: true }).add(selection.exclusionPatterns)
  return (projectPath) => !matcher.ignores(projectPath)
}

function parseExclusionPattern(pattern: string): Result<ProjectFileExclusionPattern, InvalidProjectFileExclusionPattern> {
  const failure = (reason: InvalidProjectFileExclusionPattern["reason"]): Result<never, InvalidProjectFileExclusionPattern> =>
    Result.Failure<InvalidProjectFileExclusionPattern>({
      _tag: "InvalidProjectFileExclusionPattern",
      pattern,
      reason,
    })

  if (pattern.trim().length === 0) {
    return failure("empty")
  }
  if (/\r|\n/u.test(pattern)) {
    return failure("multiline")
  }
  if (pattern.startsWith("#")) {
    return failure("comment")
  }
  if (pattern.startsWith("!")) {
    return failure("negated")
  }
  if (pattern.includes("\\")) {
    return failure("backslash")
  }
  if (/^[a-zA-Z]:/u.test(pattern)) {
    return failure("absolute")
  }
  if (pattern.split("/").some((segment) => segment === "." || segment === "..")) {
    return failure("dot-segment")
  }

  return Result.Success(branded<ProjectFileExclusionPattern>(pattern))
}
