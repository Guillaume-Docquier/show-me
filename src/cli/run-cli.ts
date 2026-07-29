import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { Result, Time, Timer, UnitOfTime } from "@guillaume-docquier/tools-ts"
import packageMetadata from "../../package.json" with { type: "json" }
import { analyzeProject, type AnalyzeProjectError } from "../analysis/analyze-project.js"
import { loadProjectConfiguration, type ProjectConfigurationError } from "../configuration/project-configuration.js"
import { importCoverage, importDiscoveredCoverage, type CoverageImportError } from "../coverage/import-coverage.js"
import type { PerformanceProfiler } from "../performance/performance-profiler.js"
import { DEFAULT_PROJECT_FILE_SELECTION, type InvalidProjectFileExclusionPattern } from "../project-files/project-file-selection.js"
import { buildHtmlReport, loadBrowserBundle, type BrowserBundleReadError } from "../report/build-html-report.js"
import { parseCliArguments } from "./parse-cli-arguments.js"

/**
 * Current package version reported by the CLI.
 */
export const SHOW_ME_VERSION = packageMetadata.version

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
  readonly performanceProfiler?: PerformanceProfiler
}

const HELP = `Usage: show-me [project-path] [options]

Options:
  --output <path>      Write the report to this path
  --coverage <path>    Read one explicit Istanbul or LCOV report
  --exclude <pattern>  Replace configured or built-in exclusions; repeat for more
  -h, --help           Show this help
  -v, --version        Show the version
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
  const projectConfiguration = await loadProjectConfiguration(projectRoot)
  if (Result.isFailure(projectConfiguration)) {
    output.writeStandardError(`${formatProjectConfigurationError(projectConfiguration.error)}\n`)
    return 1
  }

  const fileSelection = command.value.fileSelectionOverride ?? projectConfiguration.value.fileSelection ?? DEFAULT_PROJECT_FILE_SELECTION
  const analysis = await analyzeProject({
    projectRoot,
    fileSelection,
    ...(options.performanceProfiler === undefined ? {} : { performanceProfiler: options.performanceProfiler }),
  })

  if (Result.isFailure(analysis)) {
    output.writeStandardError(`${formatAnalysisError(analysis.error)}\n`)
    return 1
  }

  let reportAnalysis = analysis.value
  const coverageFile =
    command.value.coveragePath === undefined
      ? projectConfiguration.value.coveragePath
      : resolve(currentDirectory, command.value.coveragePath)

  if (coverageFile === undefined) {
    const importDiscovered = async (): ReturnType<typeof importDiscoveredCoverage> =>
      await importDiscoveredCoverage(analysis.value, projectRoot)
    const coveredAnalysis =
      options.performanceProfiler === undefined
        ? await importDiscovered()
        : await options.performanceProfiler.measureAsync("coverage", importDiscovered)
    if (Result.isFailure(coveredAnalysis)) {
      output.writeStandardError(`${formatCoverageImportError(coveredAnalysis.error)}\n`)
      return 1
    }
    reportAnalysis = coveredAnalysis.value.analysis
    if (coveredAnalysis.value.coverageFiles.length === 0) {
      output.writeStandardOutput(`No coverage file found at ${projectRoot} or its package roots; continuing without coverage.\n`)
    }
  } else {
    const importExplicit = async (): ReturnType<typeof importCoverage> => await importCoverage(analysis.value, projectRoot, coverageFile)
    const coveredAnalysis =
      options.performanceProfiler === undefined
        ? await importExplicit()
        : await options.performanceProfiler.measureAsync("coverage", importExplicit)
    if (Result.isFailure(coveredAnalysis)) {
      output.writeStandardError(`${formatCoverageImportError(coveredAnalysis.error)}\n`)
      return 1
    }
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

  const html =
    options.performanceProfiler === undefined
      ? buildHtmlReport(reportAnalysis, browserBundle)
      : options.performanceProfiler.measure("html-packaging", () => buildHtmlReport(reportAnalysis, browserBundle))
  const outputPath =
    command.value.outputPath === undefined
      ? (projectConfiguration.value.outputPath ?? resolve(currentDirectory, "show-me.html"))
      : resolve(currentDirectory, command.value.outputPath)
  const writeReport = async (): ReturnType<typeof writeFile> => {
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, html, "utf8")
  }
  const writeResult = await Result.tryCatch(
    options.performanceProfiler === undefined ? writeReport() : options.performanceProfiler.measureAsync("report-writing", writeReport),
  )

  if (Result.isFailure(writeResult)) {
    output.writeStandardError(`Could not write report to ${outputPath}: ${writeResult.error.message}\n`)
    return 1
  }

  const elapsedMilliseconds = Time.in(Timer.since(startedAt), UnitOfTime.MILLISECONDS)
  output.writeStandardOutput(`Report written to ${outputPath}\n`)
  output.writeStandardOutput(`Completed in ${elapsedMilliseconds.toFixed(1)} ms.\n`)
  return 0
}

function formatProjectConfigurationError(error: ProjectConfigurationError): string {
  switch (error._tag) {
    case "ProjectConfigurationReadFailed":
      return `Could not read project configuration ${error.configurationFile}: ${error.cause.message}`
    case "ProjectConfigurationJsonInvalid":
      return `Could not parse project configuration ${error.configurationFile}: ${error.issues
        .map((issue) => `${issue.code} at offset ${issue.offset}`)
        .join(", ")}.`
    case "ProjectConfigurationSchemaInvalid":
      return `Invalid project configuration ${error.configurationFile}: ${error.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join(", ")}.`
    case "ProjectConfigurationFileSelectionInvalid":
      return `Invalid project configuration ${error.configurationFile}: ${formatConfiguredExclusionPattern(error.cause)}`
  }
}

function formatConfiguredExclusionPattern(error: InvalidProjectFileExclusionPattern): string {
  const pattern = JSON.stringify(error.pattern)
  switch (error.reason) {
    case "empty":
      return "exclude patterns must be non-empty."
    case "multiline":
      return `exclude pattern ${pattern} must contain exactly one line.`
    case "comment":
      return `exclude pattern ${pattern} is a comment rather than an exclusion.`
    case "negated":
      return `exclude pattern ${pattern} uses unsupported negation.`
    case "backslash":
      return `exclude pattern ${pattern} must use forward slashes.`
    case "absolute":
      return `exclude pattern ${pattern} must be project-relative.`
    case "dot-segment":
      return `exclude pattern ${pattern} must not contain dot path segments.`
  }
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
    case "PnpmWorkspaceReadFailed":
      return `Could not read pnpm workspace file ${error.workspaceFile}: ${error.cause.message}`
    case "PnpmWorkspaceInvalid":
      return `Could not parse pnpm workspace file ${error.workspaceFile}: ${error.cause.message}`
    case "WorkspacePackageDiscoveryFailed":
      return `Could not discover packages from ${error.workspaceFile}: ${error.cause.message}`
    case "WorkspacePackageManifestReadFailed":
      return `Could not read workspace package manifest ${error.packageManifest}: ${error.cause.message}`
    case "WorkspacePackageManifestInvalid":
      return `Could not parse workspace package manifest ${error.packageManifest}: ${error.cause.message}`
    case "DuplicateWorkspacePackageName":
      return `Workspace package name ${JSON.stringify(error.packageName)} is used by ${error.packagePaths.join(" and ")}.`
  }
}

function formatBrowserBundleError(error: BrowserBundleReadError): string {
  return `Could not read installed browser bundle ${error.browserBundlePath}: ${error.cause.message}`
}

function formatCoverageImportError(error: CoverageImportError): string {
  switch (error._tag) {
    case "CoverageReportReadFailed":
      return `Could not read coverage file ${error.coverageFile}: ${error.cause.message}`
    case "CoveragePackageRootDiscoveryFailed":
      return `Could not inspect package manifest ${error.packageManifest} while discovering coverage: ${error.cause.message}`
    case "CoverageFormatUnsupported":
      return `Unsupported coverage format in ${error.coverageFile}; expected Istanbul JSON or LCOV.`
    case "CoverageReportInvalid":
      return `Could not parse ${error.format === "istanbul" ? "Istanbul" : "LCOV"} coverage file ${error.coverageFile}: ${error.cause.message}`
  }
}
