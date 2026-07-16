import { readFile } from "node:fs/promises"
import { posix } from "node:path"
import { Result, TypeGuard } from "@guillaume-docquier/tools-ts"
import type { ProjectAnalysis, ProjectFileCoverage } from "../analysis/project-analysis.js"
import { ProjectFilePath } from "../project-files/project-file-path.js"

/**
 * A failure while loading or parsing an Istanbul coverage file.
 */
export type IstanbulCoverageImportError =
  | {
      readonly _tag: "CoverageFileReadFailed"
      readonly coverageFile: string
      readonly cause: Error
    }
  | {
      readonly _tag: "CoverageFileInvalid"
      readonly coverageFile: string
      readonly cause: Error
    }

/**
 * A coverage path that cannot identify a file below the analyzed project root.
 */
export type CoveragePathOutsideProject = {
  readonly _tag: "CoveragePathOutsideProject"
  readonly projectRoot: string
  readonly coveragePath: string
}

type ParsedFileCoverage = {
  readonly path: string
  readonly lineHits: ReadonlyMap<number, number>
}

/**
 * Import Istanbul statement coverage and immutably enrich matching project files.
 *
 * @param analysis - Existing language-neutral project analysis.
 * @param projectRoot - Absolute root of the analyzed project.
 * @param coverageFile - Istanbul `coverage-final.json` file to import.
 * @returns The analysis with per-file line coverage, or a typed file failure.
 */
export async function importIstanbulCoverage(
  analysis: ProjectAnalysis,
  projectRoot: string,
  coverageFile: string,
): Promise<Result<ProjectAnalysis, IstanbulCoverageImportError>> {
  const coverageContents = await Result.tryCatch(readFile(coverageFile, "utf8"))
  if (Result.isFailure(coverageContents)) {
    return Result.Failure({
      _tag: "CoverageFileReadFailed",
      coverageFile,
      cause: coverageContents.error,
    })
  }

  const parsedCoverage = Result.tryCatch(() => parseCoverageFinal(coverageContents.value))
  if (Result.isFailure(parsedCoverage)) {
    return Result.Failure({
      _tag: "CoverageFileInvalid",
      coverageFile,
      cause: parsedCoverage.error,
    })
  }

  const lineHitsByProjectFile = new Map<ProjectFilePath, Map<number, number>>()
  const canonicalProjectPathByComparablePath = new Map(
    analysis.files.map((file) => [comparableProjectFilePath(projectRoot, file.path), file.path]),
  )
  for (const fileCoverage of parsedCoverage.value) {
    const projectFilePath = normalizeCoverageFilePath(projectRoot, fileCoverage.path)
    if (Result.isFailure(projectFilePath)) {
      continue
    }

    const canonicalProjectFilePath = canonicalProjectPathByComparablePath.get(comparableProjectFilePath(projectRoot, projectFilePath.value))
    if (canonicalProjectFilePath === undefined) {
      continue
    }

    const lineHits = lineHitsByProjectFile.get(canonicalProjectFilePath) ?? new Map<number, number>()
    for (const [line, hits] of fileCoverage.lineHits) {
      lineHits.set(line, Math.max(lineHits.get(line) ?? 0, hits))
    }
    lineHitsByProjectFile.set(canonicalProjectFilePath, lineHits)
  }

  const coverageByProjectFile = new Map<ProjectFilePath, ProjectFileCoverage>()
  for (const [path, lineHits] of lineHitsByProjectFile) {
    coverageByProjectFile.set(path, { lines: lineCoveragePercentage(lineHits) })
  }

  return Result.Success({
    ...analysis,
    files: analysis.files.map((file) => ({
      ...file,
      coverage: coverageByProjectFile.get(file.path),
    })),
  })
}

/**
 * Normalize an Istanbul file path against a project root on any host platform.
 *
 * @param projectRoot - Absolute project root using Windows or POSIX separators.
 * @param coveragePath - Absolute or project-relative path from Istanbul coverage.
 * @returns A normalized project-file path, or an outside-root failure.
 */
export function normalizeCoverageFilePath(projectRoot: string, coveragePath: string): Result<ProjectFilePath, CoveragePathOutsideProject> {
  const normalizedRoot = normalizeLexicalPath(projectRoot)
  const normalizedCoveragePath = isAbsolutePath(coveragePath)
    ? normalizeLexicalPath(coveragePath)
    : normalizeLexicalPath(`${normalizedRoot}/${coveragePath}`)
  const caseInsensitive = /^[a-zA-Z]:\//u.test(normalizedRoot)
  const comparableRoot = caseInsensitive ? normalizedRoot.toLowerCase() : normalizedRoot
  const comparableCoveragePath = caseInsensitive ? normalizedCoveragePath.toLowerCase() : normalizedCoveragePath
  const rootPrefix = comparableRoot.endsWith("/") ? comparableRoot : `${comparableRoot}/`

  if (!comparableCoveragePath.startsWith(rootPrefix)) {
    return Result.Failure({
      _tag: "CoveragePathOutsideProject",
      projectRoot,
      coveragePath,
    })
  }

  const relativePath = normalizedCoveragePath.slice(rootPrefix.length)
  const projectFilePath = ProjectFilePath.parse(relativePath)
  if (Result.isFailure(projectFilePath)) {
    return Result.Failure({
      _tag: "CoveragePathOutsideProject",
      projectRoot,
      coveragePath,
    })
  }
  return projectFilePath
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

function lineCoveragePercentage(lineHits: ReadonlyMap<number, number>): number {
  if (lineHits.size === 0) {
    return 100
  }

  const coveredLines = [...lineHits.values()].filter((hits) => hits > 0).length
  return Math.floor((coveredLines / lineHits.size) * 10_000) / 100
}

function normalizeLexicalPath(path: string): string {
  const normalized = posix.normalize(path.replaceAll("\\", "/"))
  if (normalized === "/" || /^[a-zA-Z]:\/$/u.test(normalized)) {
    return normalized
  }
  return normalized.replace(/\/+$/u, "")
}

function isAbsolutePath(path: string): boolean {
  const slashedPath = path.replaceAll("\\", "/")
  return slashedPath.startsWith("/") || /^[a-zA-Z]:\//u.test(slashedPath)
}

function comparableProjectFilePath(projectRoot: string, projectFilePath: ProjectFilePath): string {
  return /^[a-zA-Z]:\//u.test(normalizeLexicalPath(projectRoot)) ? projectFilePath.toLowerCase() : projectFilePath
}
