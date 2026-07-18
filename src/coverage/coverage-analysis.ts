import { posix } from "node:path"
import { Result } from "@guillaume-docquier/tools-ts"
import type { ProjectAnalysis, ProjectFileCoverage } from "../analysis/project-analysis.js"
import { ProjectFilePath } from "../project-files/project-file-path.js"

/**
 * Format-neutral executable-line hits for one source file in a coverage report.
 */
export type ParsedFileCoverage = {
  readonly path: string
  readonly lineHits: ReadonlyMap<number, number>
}

/**
 * A coverage path that cannot identify a file below the analyzed project root.
 */
export type CoveragePathOutsideProject = {
  readonly _tag: "CoveragePathOutsideProject"
  readonly projectRoot: string
  readonly coveragePath: string
}

/**
 * Immutably enrich an analysis from format-neutral executable-line hits.
 *
 * Repeated source records and repeated executable lines retain the maximum hit
 * count so equivalent Istanbul and LCOV reports produce the same coverage.
 *
 * @param analysis - Existing language-neutral project analysis.
 * @param projectRoot - Absolute root of the analyzed project.
 * @param parsedCoverage - Format-neutral file paths and executable-line hits.
 * @returns The analysis with matching per-file line coverage.
 */
export function enrichAnalysisWithCoverage(
  analysis: ProjectAnalysis,
  projectRoot: string,
  parsedCoverage: readonly ParsedFileCoverage[],
): ProjectAnalysis {
  const lineHitsByProjectFile = new Map<ProjectFilePath, Map<number, number>>()
  const canonicalProjectPathByComparablePath = new Map(
    analysis.files.map((file) => [comparableProjectFilePath(projectRoot, file.path), file.path]),
  )

  for (const fileCoverage of parsedCoverage) {
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

  return {
    ...analysis,
    files: analysis.files.map((file) => ({
      ...file,
      coverage: coverageByProjectFile.get(file.path),
    })),
  }
}

/**
 * Normalize a coverage source path against a project root on any host platform.
 *
 * @param projectRoot - Absolute project root using Windows or POSIX separators.
 * @param coveragePath - Absolute or project-relative path from a coverage report.
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
