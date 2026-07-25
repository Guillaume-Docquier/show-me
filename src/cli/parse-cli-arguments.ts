import { Result } from "@guillaume-docquier/tools-ts"
import {
  DEFAULT_PROJECT_FILE_SELECTION,
  ProjectFileSelection,
  type InvalidProjectFileExclusionPattern,
} from "../project-files/project-file-selection.js"

/**
 * A command accepted by the Show Me CLI.
 */
export type CliCommand =
  | { readonly _tag: "Help" }
  | { readonly _tag: "Version" }
  | {
      readonly _tag: "GenerateReport"
      readonly projectPath: string
      readonly outputPath: string | undefined
      readonly coveragePath: string | undefined
      readonly fileSelection: ProjectFileSelection
    }

/**
 * A command-line argument parsing failure.
 */
export type InvalidCliArguments = {
  readonly _tag: "InvalidCliArguments"
  readonly message: string
}

/**
 * Parse raw command-line arguments into a CLI command.
 *
 * @param arguments_ - Arguments after the executable name.
 * @returns A parsed CLI command, or a useful argument error.
 */
export function parseCliArguments(arguments_: readonly string[]): Result<CliCommand, InvalidCliArguments> {
  if (arguments_.includes("--help") || arguments_.includes("-h")) {
    return Result.Success({ _tag: "Help" })
  }

  if (arguments_.includes("--version") || arguments_.includes("-v")) {
    return Result.Success({ _tag: "Version" })
  }

  let projectPath = "."
  let outputPath: string | undefined
  let coveragePath: string | undefined
  let exclusionPatterns: string[] | undefined
  let hasProjectPath = false

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]

    if (argument === undefined) {
      continue
    }

    if (argument === "--output" || argument === "--coverage" || argument === "--exclude") {
      const value = arguments_[index + 1]

      if (value === undefined || value.startsWith("-")) {
        return Result.Failure({
          _tag: "InvalidCliArguments",
          message: `${argument} requires ${argument === "--exclude" ? "a pattern" : "a path"}.`,
        })
      }

      if (argument === "--exclude") {
        exclusionPatterns ??= []
        exclusionPatterns.push(value)
      } else if (argument === "--output") {
        if (outputPath !== undefined) {
          return Result.Failure({
            _tag: "InvalidCliArguments",
            message: "--output may only be specified once.",
          })
        }
        outputPath = value
      } else {
        if (coveragePath !== undefined) {
          return Result.Failure({
            _tag: "InvalidCliArguments",
            message: "--coverage may only be specified once.",
          })
        }
        coveragePath = value
      }

      index += 1
      continue
    }

    if (argument.startsWith("-")) {
      return Result.Failure({
        _tag: "InvalidCliArguments",
        message: `Unknown option: ${argument}`,
      })
    }

    if (hasProjectPath) {
      return Result.Failure({
        _tag: "InvalidCliArguments",
        message: "Only one project path may be specified.",
      })
    }

    projectPath = argument
    hasProjectPath = true
  }

  const fileSelection =
    exclusionPatterns === undefined ? Result.Success(DEFAULT_PROJECT_FILE_SELECTION) : ProjectFileSelection.parse(exclusionPatterns)
  if (Result.isFailure(fileSelection)) {
    return Result.Failure({
      _tag: "InvalidCliArguments",
      message: formatInvalidExclusionPattern(fileSelection.error),
    })
  }

  return Result.Success({
    _tag: "GenerateReport",
    projectPath,
    outputPath,
    coveragePath,
    fileSelection: fileSelection.value,
  })
}

function formatInvalidExclusionPattern(error: InvalidProjectFileExclusionPattern): string {
  const pattern = JSON.stringify(error.pattern)
  switch (error.reason) {
    case "empty":
      return "--exclude requires a non-empty pattern."
    case "multiline":
      return `Invalid --exclude pattern ${pattern}: patterns must contain exactly one line.`
    case "comment":
      return `Invalid --exclude pattern ${pattern}: comment patterns are not exclusions.`
    case "negated":
      return `Invalid --exclude pattern ${pattern}: negation is not supported.`
    case "backslash":
      return `Invalid --exclude pattern ${pattern}: use forward slashes.`
    case "absolute":
      return `Invalid --exclude pattern ${pattern}: patterns must be project-relative.`
    case "dot-segment":
      return `Invalid --exclude pattern ${pattern}: dot path segments are not supported.`
  }
}
