import type { ReportScopeState } from "./report-lens.js"
import type { BrowserPresentation, ReportProjectFileNode } from "./report-presentation.js"

/** User-controlled thresholds for the Coverage lens. */
export type CoverageFilterState = {
  readonly minimumCodeLines: number
  readonly maximumCoverage: number
  readonly includeUnavailableCoverage: boolean
}

/** Deterministic initial Coverage lens thresholds. */
export const DEFAULT_COVERAGE_FILTERS: CoverageFilterState = {
  minimumCodeLines: 100,
  maximumCoverage: 80,
  includeUnavailableCoverage: true,
}

/** One project file matching the active Coverage lens thresholds. */
export type CoverageLensResult = {
  readonly nodeId: string
  readonly path: string
  readonly codeLines: number
  readonly coverage: number | undefined
}

/** Complete scoped Coverage lens derivation. */
export type CoverageLensResults = {
  readonly matches: readonly CoverageLensResult[]
  readonly matchingNodeIds: ReadonlySet<string>
  readonly scopedFileCount: number
  readonly knownCoverageFileCount: number
  readonly unavailableCoverageFileCount: number
}

/**
 * Normalize Coverage lens thresholds accepted from browser controls.
 *
 * @param filters - Candidate threshold state.
 * @returns Integer code lines, bounded coverage, and the unchanged unavailable-data policy.
 */
export function normalizeCoverageFilters(filters: CoverageFilterState): CoverageFilterState {
  return {
    minimumCodeLines: Math.max(0, Math.trunc(filters.minimumCodeLines)),
    maximumCoverage: Math.max(0, Math.min(100, filters.maximumCoverage)),
    includeUnavailableCoverage: filters.includeUnavailableCoverage,
  }
}

/**
 * Derive Coverage lens matches and counts from immutable browser presentation.
 *
 * Code lines are physical source lines. Coverage remains the imported
 * executable-line percentage and is never converted into an uncovered-line
 * estimate.
 */
export function deriveCoverageLensResults(
  presentation: BrowserPresentation,
  scope: ReportScopeState,
  candidateFilters: CoverageFilterState,
): CoverageLensResults {
  const filters = normalizeCoverageFilters(candidateFilters)
  const scopedFiles = presentation.nodes.filter(
    (node): node is ReportProjectFileNode =>
      node.kind === "project-file" && (node.workspacePackage === undefined || scope.workspacePackages.has(node.workspacePackage)),
  )
  const matches = scopedFiles
    .filter(
      (file) =>
        file.lineMetrics.code >= filters.minimumCodeLines &&
        (file.coverage === undefined ? filters.includeUnavailableCoverage : file.coverage <= filters.maximumCoverage),
    )
    .map(
      (file): CoverageLensResult => ({
        nodeId: file.id,
        path: file.path,
        codeLines: file.lineMetrics.code,
        coverage: file.coverage,
      }),
    )
    .toSorted(compareCoverageResults)

  return {
    matches,
    matchingNodeIds: new Set(matches.map(({ nodeId }) => nodeId)),
    scopedFileCount: scopedFiles.length,
    knownCoverageFileCount: scopedFiles.filter(({ coverage }) => coverage !== undefined).length,
    unavailableCoverageFileCount: scopedFiles.filter(({ coverage }) => coverage === undefined).length,
  }
}

function compareCoverageResults(left: CoverageLensResult, right: CoverageLensResult): number {
  if (left.coverage === undefined || right.coverage === undefined) {
    if (left.coverage === undefined && right.coverage !== undefined) {
      return 1
    }
    if (left.coverage !== undefined && right.coverage === undefined) {
      return -1
    }
  }
  const coverageComparison = (left.coverage ?? 0) - (right.coverage ?? 0)
  if (coverageComparison !== 0) {
    return coverageComparison
  }
  const lineComparison = right.codeLines - left.codeLines
  return lineComparison === 0 ? compareText(left.path, right.path) : lineComparison
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
