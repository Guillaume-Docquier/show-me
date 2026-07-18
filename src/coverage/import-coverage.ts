import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { isNodeJSError, Result } from "@guillaume-docquier/tools-ts"
import type { ProjectAnalysis } from "../analysis/project-analysis.js"
import { enrichAnalysisWithCoverage, type ParsedFileCoverage } from "./coverage-analysis.js"
import { parseIstanbulCoverage } from "./parse-istanbul-coverage.js"
import { parseLcovCoverage } from "./parse-lcov-coverage.js"

/**
 * A supported coverage-report syntax.
 */
export type CoverageFormat = "istanbul" | "lcov"

type CoverageReportReadFailed = {
  readonly _tag: "CoverageReportReadFailed"
  readonly coverageFile: string
  readonly cause: Error
}

/**
 * A failure while reading, recognizing, or parsing one selected coverage report.
 */
export type CoverageImportError =
  | CoverageReportReadFailed
  | {
      readonly _tag: "CoverageFormatUnsupported"
      readonly coverageFile: string
    }
  | {
      readonly _tag: "CoverageReportInvalid"
      readonly coverageFile: string
      readonly format: CoverageFormat
      readonly cause: Error
    }

/**
 * Result of deterministic automatic coverage discovery and import.
 */
export type DiscoveredCoverage = {
  readonly analysis: ProjectAnalysis
  readonly coverageFile: string | undefined
}

/**
 * Read one explicit coverage file, recognize its syntax from content, and enrich
 * the matching project files.
 *
 * @param analysis - Existing language-neutral project analysis.
 * @param projectRoot - Absolute root of the analyzed project.
 * @param coverageFile - Explicit coverage report path.
 * @returns Enriched analysis, or a typed coverage failure.
 */
export async function importCoverage(
  analysis: ProjectAnalysis,
  projectRoot: string,
  coverageFile: string,
): Promise<Result<ProjectAnalysis, CoverageImportError>> {
  const coverageContents = await readCoverageFile(coverageFile)
  if (Result.isFailure(coverageContents)) {
    return coverageContents
  }

  const format = recognizeCoverageFormat(coverageContents.value)
  if (format === undefined) {
    return Result.Failure({
      _tag: "CoverageFormatUnsupported",
      coverageFile,
    })
  }

  return importCoverageContents(analysis, projectRoot, coverageFile, coverageContents.value, format)
}

/**
 * Check standard coverage reports in fixed precedence order and import only the
 * first readable candidate that exists.
 *
 * @param analysis - Existing language-neutral project analysis.
 * @param projectRoot - Absolute root of the analyzed project.
 * @returns The selected report and enriched analysis, or unchanged analysis when neither candidate exists.
 */
export async function importDiscoveredCoverage(
  analysis: ProjectAnalysis,
  projectRoot: string,
): Promise<Result<DiscoveredCoverage, CoverageImportError>> {
  const candidates: ReadonlyArray<{ readonly coverageFile: string; readonly format: CoverageFormat }> = [
    { coverageFile: resolve(projectRoot, "coverage", "coverage-final.json"), format: "istanbul" },
    { coverageFile: resolve(projectRoot, "coverage", "lcov.info"), format: "lcov" },
  ]

  for (const candidate of candidates) {
    const coverageContents = await readCoverageFile(candidate.coverageFile)
    if (Result.isFailure(coverageContents)) {
      if (isNodeJSError(coverageContents.error.cause) && coverageContents.error.cause.code === "ENOENT") {
        continue
      }
      return coverageContents
    }

    const importedCoverage = importCoverageContents(analysis, projectRoot, candidate.coverageFile, coverageContents.value, candidate.format)
    return Result.isFailure(importedCoverage)
      ? importedCoverage
      : Result.Success({ analysis: importedCoverage.value, coverageFile: candidate.coverageFile })
  }

  return Result.Success({ analysis, coverageFile: undefined })
}

async function readCoverageFile(coverageFile: string): Promise<Result<string, CoverageReportReadFailed>> {
  const coverageContents = await Result.tryCatch(readFile(coverageFile, "utf8"))
  return Result.isFailure(coverageContents)
    ? Result.Failure({
        _tag: "CoverageReportReadFailed",
        coverageFile,
        cause: coverageContents.error,
      })
    : coverageContents
}

function recognizeCoverageFormat(contents: string): CoverageFormat | undefined {
  const firstNonWhitespace = contents.search(/\S/u)
  if (firstNonWhitespace >= 0 && contents[firstNonWhitespace] === "{") {
    return "istanbul"
  }

  const firstNonEmptyLine = contents.split(/\r\n|\n|\r/u).find((line) => line.trim().length > 0)
  const firstRecord = firstNonEmptyLine?.trimStart()
  return firstRecord?.startsWith("TN:") === true || firstRecord?.startsWith("SF:") === true ? "lcov" : undefined
}

function importCoverageContents(
  analysis: ProjectAnalysis,
  projectRoot: string,
  coverageFile: string,
  contents: string,
  format: CoverageFormat,
): Result<ProjectAnalysis, CoverageImportError> {
  const parsedCoverage: Result<readonly ParsedFileCoverage[], { readonly cause: Error }> =
    format === "istanbul" ? parseIstanbulCoverage(contents) : parseLcovCoverage(contents)
  if (Result.isFailure(parsedCoverage)) {
    return Result.Failure({
      _tag: "CoverageReportInvalid",
      coverageFile,
      format,
      cause: parsedCoverage.error.cause,
    })
  }

  return Result.Success(enrichAnalysisWithCoverage(analysis, projectRoot, parsedCoverage.value))
}
