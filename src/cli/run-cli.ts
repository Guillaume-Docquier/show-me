import { Result } from "@guillaume-docquier/tools-ts"
import { parseCliArguments } from "./parse-cli-arguments.js"

/**
 * Current package version reported by the CLI.
 */
export const SHOW_ME_VERSION = "0.0.1"

/**
 * Text-output boundary used by the CLI entrypoint.
 */
export type CliOutput = {
  readonly writeStandardOutput: (text: string) => void
  readonly writeStandardError: (text: string) => void
}

const HELP = `Usage: show-me [project-path] [options]

Options:
  --output <path>    Write the report to this path
  --coverage <path>  Read coverage from this path
  -h, --help         Show this help
  -v, --version      Show the version
`

/**
 * Execute the CLI command without terminating the process directly.
 *
 * @param arguments_ - Arguments after the executable name.
 * @param output - Output boundary for normal and error text.
 * @returns The process exit code.
 */
export async function runCli(arguments_: readonly string[], output: CliOutput): Promise<number> {
  const command = parseCliArguments(arguments_)

  if (Result.isFailure(command)) {
    output.writeStandardError(`${command.error.message}\n`)
    return 1
  }

  switch (command.value._tag) {
    case "Help":
      output.writeStandardOutput(HELP)
      return 0
    case "Version":
      output.writeStandardOutput(`${SHOW_ME_VERSION}\n`)
      return 0
    case "GenerateReport":
      output.writeStandardError("Report generation is not implemented yet.\n")
      return 1
  }
}
