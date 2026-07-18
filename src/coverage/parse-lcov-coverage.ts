import { Result } from "@guillaume-docquier/tools-ts"
import type { ParsedFileCoverage } from "./coverage-analysis.js"

/**
 * An LCOV report with malformed or incomplete source records.
 */
export type InvalidLcovCoverage = {
  readonly _tag: "InvalidLcovCoverage"
  readonly cause: Error
}

type MutableFileCoverage = {
  readonly path: string
  readonly lineHits: Map<number, number>
}

const IGNORED_RECORD_PREFIXES = ["FN:", "FNDA:", "FNF:", "FNH:", "BRDA:", "BRF:", "BRH:", "LF:", "LH:"] as const

/**
 * Parse LCOV source and line records into format-neutral executable-line hits.
 *
 * Function, branch, and summary records are accepted but ignored because the
 * analysis model currently stores line coverage only.
 *
 * @param contents - Complete `lcov.info` contents.
 * @returns Parsed file coverage, or a typed invalid-report failure.
 */
export function parseLcovCoverage(contents: string): Result<readonly ParsedFileCoverage[], InvalidLcovCoverage> {
  const parsedCoverage = Result.tryCatch(() => parseLcov(contents))
  return Result.isFailure(parsedCoverage) ? Result.Failure({ _tag: "InvalidLcovCoverage", cause: parsedCoverage.error }) : parsedCoverage
}

function parseLcov(contents: string): readonly ParsedFileCoverage[] {
  const records: ParsedFileCoverage[] = []
  let currentRecord: MutableFileCoverage | undefined

  for (const [index, line] of contents.split(/\r\n|\n|\r/u).entries()) {
    const lineNumber = index + 1
    if (line.trim().length === 0) {
      continue
    }

    if (line.startsWith("TN:")) {
      if (currentRecord !== undefined) {
        throw invalidLine(lineNumber, "TN record appeared before the current source record ended.")
      }
      continue
    }

    if (line.startsWith("SF:")) {
      if (currentRecord !== undefined) {
        throw invalidLine(lineNumber, "SF record appeared before the current source record ended.")
      }
      const path = line.slice(3)
      if (path.trim().length === 0) {
        throw invalidLine(lineNumber, "SF record requires a source-file path.")
      }
      currentRecord = { path, lineHits: new Map() }
      continue
    }

    if (line.startsWith("DA:")) {
      if (currentRecord === undefined) {
        throw invalidLine(lineNumber, "DA record appeared outside a source-file record.")
      }
      const [lineText, hitsText, checksum, ...extraFields] = line.slice(3).split(",")
      if (
        lineText === undefined ||
        hitsText === undefined ||
        extraFields.length > 0 ||
        !/^\d+$/u.test(lineText) ||
        !/^\d+$/u.test(hitsText)
      ) {
        throw invalidLine(lineNumber, "DA record requires an executable line and non-negative hit count.")
      }
      if (checksum !== undefined && checksum.length === 0) {
        throw invalidLine(lineNumber, "DA checksum cannot be empty when present.")
      }
      const executableLine = Number(lineText)
      const hits = Number(hitsText)
      if (!Number.isSafeInteger(executableLine) || executableLine < 1 || !Number.isSafeInteger(hits)) {
        throw invalidLine(lineNumber, "DA record contains an out-of-range line or hit count.")
      }
      currentRecord.lineHits.set(executableLine, Math.max(currentRecord.lineHits.get(executableLine) ?? 0, hits))
      continue
    }

    if (line === "end_of_record") {
      if (currentRecord === undefined) {
        throw invalidLine(lineNumber, "end_of_record appeared without a source-file record.")
      }
      records.push(currentRecord)
      currentRecord = undefined
      continue
    }

    if (IGNORED_RECORD_PREFIXES.some((prefix) => line.startsWith(prefix))) {
      if (currentRecord === undefined) {
        throw invalidLine(lineNumber, "Coverage data appeared outside a source-file record.")
      }
      continue
    }

    throw invalidLine(lineNumber, `Unsupported LCOV record ${JSON.stringify(line)}.`)
  }

  if (currentRecord !== undefined) {
    throw new Error(`LCOV source record ${JSON.stringify(currentRecord.path)} is missing end_of_record.`)
  }

  return records
}

function invalidLine(lineNumber: number, message: string): Error {
  return new Error(`Invalid LCOV line ${lineNumber}: ${message}`)
}
