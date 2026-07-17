/**
 * File-selection choices that may be overridden for one analysis.
 */
export type ProjectFileSelection = {
  readonly testFiles: "exclude" | "include"
}

/**
 * Built-in project-file selection used when no override is supplied.
 */
export const DEFAULT_PROJECT_FILE_SELECTION: ProjectFileSelection = {
  testFiles: "exclude",
}

/**
 * Decide whether an otherwise eligible source file passes configurable selection.
 *
 * Permanent directory, `.gitignore`, declaration-file, and language-support
 * exclusions are deliberately enforced by discovery before this policy.
 *
 * @param fileName - Basename of an otherwise eligible project file.
 * @param selection - Overrideable selection policy for this analysis.
 * @returns Whether the file remains selected.
 */
export function isProjectFileSelected(fileName: string, selection: ProjectFileSelection): boolean {
  if (selection.testFiles === "include") {
    return true
  }

  const lowerFileName = fileName.toLowerCase()
  return !lowerFileName.includes(".test.") && !lowerFileName.includes(".spec.")
}
