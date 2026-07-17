import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { isNodeJSError, Result, Time, Timer, UnitOfTime } from "@guillaume-docquier/tools-ts"
import { analyzeProject, type AnalyzeProjectError } from "../analysis/analyze-project.js"
import { importIstanbulCoverage, type IstanbulCoverageImportError } from "../coverage/import-istanbul-coverage.js"
import { buildHtmlReport, loadBrowserBundle, type BrowserBundleReadError } from "../report/build-html-report.js"
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

/**
 * Runtime options used by integration tests and alternate CLI hosts.
 */
export type RunCliOptions = {
  readonly currentDirectory?: string
  readonly browserBundle?: string
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
 * @param options - Optional current-directory and browser-asset overrides.
 * @returns The process exit code.
 */
export async function runCli(arguments_: readonly string[], output: CliOutput, options: RunCliOptions = {}): Promise<number> {
  const command = parseCliArguments(arguments_)

  if (Result.isFailure(command)) {
    output.writeStandardError(`${command.error.message}\n`)
    return 1
  }

  if (command.value._tag === "Help") {
    output.writeStandardOutput(HELP)
    return 0
  }
  if (command.value._tag === "Version") {
    output.writeStandardOutput(`${SHOW_ME_VERSION}\n`)
    return 0
  }

  const startedAt = Timer.start()
  const currentDirectory = options.currentDirectory ?? process.cwd()
  const projectRoot = resolve(currentDirectory, command.value.projectPath)
  const analysis = await analyzeProject({ projectRoot })

  if (Result.isFailure(analysis)) {
    output.writeStandardError(`${formatAnalysisError(analysis.error)}\n`)
    return 1
  }

  const coveragePath = command.value.coveragePath
  const isAutomaticCoverage = coveragePath === undefined
  const coverageFile =
    coveragePath === undefined ? resolve(projectRoot, "coverage", "coverage-final.json") : resolve(currentDirectory, coveragePath)
  const coveredAnalysis = await importIstanbulCoverage(analysis.value, projectRoot, coverageFile)
  let reportAnalysis = analysis.value

  if (Result.isFailure(coveredAnalysis)) {
    if (
      isAutomaticCoverage &&
      coveredAnalysis.error._tag === "CoverageFileReadFailed" &&
      isNodeJSError(coveredAnalysis.error.cause) &&
      coveredAnalysis.error.cause.code === "ENOENT"
    ) {
      output.writeStandardOutput(`No coverage file found at ${coverageFile}; continuing without coverage.\n`)
    } else {
      output.writeStandardError(`${formatCoverageImportError(coveredAnalysis.error)}\n`)
      return 1
    }
  } else {
    reportAnalysis = coveredAnalysis.value
  }

  let browserBundle = options.browserBundle
  if (browserBundle === undefined) {
    const loadedBrowserBundle = await loadBrowserBundle()
    if (Result.isFailure(loadedBrowserBundle)) {
      output.writeStandardError(`${formatBrowserBundleError(loadedBrowserBundle.error)}\n`)
      return 1
    }
    browserBundle = loadedBrowserBundle.value
  }

  const html = buildHtmlReport(reportAnalysis, browserBundle)
  const outputPath = resolve(currentDirectory, command.value.outputPath ?? "show-me.html")
  const writeResult = await Result.tryCatch(writeFile(outputPath, html, "utf8"))

  if (Result.isFailure(writeResult)) {
    output.writeStandardError(`Could not write report to ${outputPath}: ${writeResult.error.message}\n`)
    return 1
  }

  const elapsedMilliseconds = Time.in(Timer.since(startedAt), UnitOfTime.MILLISECONDS)
  output.writeStandardOutput(`Report written to ${outputPath}\n`)
  output.writeStandardOutput(`Completed in ${elapsedMilliseconds.toFixed(1)} ms.\n`)
  return 0
}

function formatAnalysisError(error: AnalyzeProjectError): string {
  switch (error._tag) {
    case "ProjectRootReadFailed":
      return `Could not read project root ${error.projectRoot}: ${error.cause.message}`
    case "ProjectRootNotDirectory":
      return `Project root is not a directory: ${error.projectRoot}`
    case "ProjectDirectoryReadFailed":
      return `Could not read project directory ${error.directory}: ${error.cause.message}`
    case "ProjectIgnoreFileReadFailed":
      return `Could not read ignore file ${error.ignoreFile}: ${error.cause.message}`
    case "ProjectPathNormalizationFailed":
      return `Could not normalize project file path ${error.absolutePath}.`
    case "ProjectFileReadFailed":
      return `Could not read project file ${error.projectFile}: ${error.cause.message}`
    case "JavaScriptTypeScriptParserFailed":
      return `Could not parse project file ${error.file}: ${error.cause.message}`
    case "JavaScriptTypeScriptResolverInitializationFailed":
      return `Could not initialize dependency resolution for ${error.projectRoot}: ${error.cause.message}`
    case "JavaScriptTypeScriptResolverFailed":
      return `Could not resolve ${JSON.stringify(error.request)} from ${error.file}: ${error.cause.message}`
  }
}

function formatBrowserBundleError(error: BrowserBundleReadError): string {
  return `Could not read installed browser bundle ${error.browserBundlePath}: ${error.cause.message}`
}

function formatCoverageImportError(error: IstanbulCoverageImportError): string {
  switch (error._tag) {
    case "CoverageFileReadFailed":
      return `Could not read coverage file ${error.coverageFile}: ${error.cause.message}`
    case "CoverageFileInvalid":
      return `Could not parse coverage file ${error.coverageFile}: ${error.cause.message}`
  }
}
