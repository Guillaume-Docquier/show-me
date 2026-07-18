import { Result, TypeGuard } from "@guillaume-docquier/tools-ts"
import type { ParsedFileCoverage } from "./coverage-analysis.js"

/**
 * An Istanbul report that does not satisfy the supported statement schema.
 */
export type InvalidIstanbulCoverage = {
  readonly _tag: "InvalidIstanbulCoverage"
  readonly cause: Error
}

/**
 * Parse Istanbul statement coverage into format-neutral executable-line hits.
 *
 * @param contents - Complete `coverage-final.json` contents.
 * @returns Parsed file coverage, or a typed invalid-report failure.
 */
export function parseIstanbulCoverage(contents: string): Result<readonly ParsedFileCoverage[], InvalidIstanbulCoverage> {
  const parsedCoverage = Result.tryCatch(() => parseCoverageFinal(contents))
  return Result.isFailure(parsedCoverage)
    ? Result.Failure({ _tag: "InvalidIstanbulCoverage", cause: parsedCoverage.error })
    : parsedCoverage
}

function parseCoverageFinal(contents: string): readonly ParsedFileCoverage[] {
  const parsed: unknown = JSON.parse(contents)
  if (!TypeGuard.isRecord(parsed) || TypeGuard.isArray(parsed)) {
    throw new Error("Expected an object keyed by covered file paths.")
  }

  return Object.values(parsed).map(parseFileCoverage)
}

function parseFileCoverage(value: unknown): ParsedFileCoverage {
  if (!TypeGuard.isRecord(value) || !TypeGuard.isString(value.path) || value.path.length === 0) {
    throw new Error("Expected each coverage entry to contain a non-empty string path.")
  }
  if (!TypeGuard.isRecord(value.statementMap) || !TypeGuard.isRecord(value.s)) {
    throw new Error(`Expected ${JSON.stringify(value.path)} to contain statementMap and s objects.`)
  }

  const lineHits = new Map<number, number>()
  for (const [statementId, statement] of Object.entries(value.statementMap)) {
    if (!Object.hasOwn(value.s, statementId)) {
      throw new Error(`Missing statement hit count ${JSON.stringify(statementId)} in ${JSON.stringify(value.path)}.`)
    }
    if (!TypeGuard.isRecord(statement) || !TypeGuard.isRecord(statement.start)) {
      throw new Error(`Invalid statement location ${JSON.stringify(statementId)} in ${JSON.stringify(value.path)}.`)
    }

    const line = statement.start.line
    const hits = value.s[statementId]
    if (!TypeGuard.isNumber(line) || !Number.isInteger(line) || line < 1) {
      throw new Error(`Invalid statement start line ${JSON.stringify(statementId)} in ${JSON.stringify(value.path)}.`)
    }
    if (!TypeGuard.isNumber(hits) || !Number.isFinite(hits) || !Number.isInteger(hits) || hits < 0) {
      throw new Error(`Invalid statement hit count ${JSON.stringify(statementId)} in ${JSON.stringify(value.path)}.`)
    }
    lineHits.set(line, Math.max(lineHits.get(line) ?? 0, hits))
  }

  for (const statementId of Object.keys(value.s)) {
    if (!Object.hasOwn(value.statementMap, statementId)) {
      throw new Error(`Missing statement location ${JSON.stringify(statementId)} in ${JSON.stringify(value.path)}.`)
    }
  }

  return { path: value.path, lineHits }
}
