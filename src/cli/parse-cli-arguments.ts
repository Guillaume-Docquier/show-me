import { Result } from "@guillaume-docquier/tools-ts"

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
  let hasProjectPath = false

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]

    if (argument === undefined) {
      continue
    }

    if (argument === "--output" || argument === "--coverage") {
      const value = arguments_[index + 1]

      if (value === undefined || value.startsWith("-")) {
        return Result.Failure({
          _tag: "InvalidCliArguments",
          message: `${argument} requires a path.`,
        })
      }

      if (argument === "--output") {
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

  return Result.Success({
    _tag: "GenerateReport",
    projectPath,
    outputPath,
    coveragePath,
  })
}
