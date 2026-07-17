import type { ProjectAnalysis } from "../analysis/project-analysis.js"
import { layoutReportGraph } from "./report-layout.js"

const NODE_SIZE_SCALE = 3
const DEFAULT_NODE_COLOR = "#8fa3b8"
const UNCOVERED_NODE_COLOR = "#dc2626"
const PARTIALLY_COVERED_NODE_COLOR = "#eab308"
const COVERED_NODE_COLOR = "#16a34a"
const PATH_TRUNCATION_PREFIX = "..."

/**
 * The schema version of the presentation embedded in a static report.
 */
export const REPORT_PRESENTATION_SCHEMA_VERSION = 3

/**
 * Line categories that report controls can combine for project-file sizing.
 */
export const REPORT_LINE_CATEGORIES = ["code", "comment", "blank"] as const

/**
 * One selectable project-file line category.
 */
export type ReportLineCategory = (typeof REPORT_LINE_CATEGORIES)[number]

/**
 * Renderer-neutral line metrics for one project file.
 */
export type ReportNodeLineMetrics = {
  readonly code: number
  readonly comment: number
  readonly blank: number
}

/**
 * Renderer-neutral data for one project-file node.
 */
export type ReportNode = {
  readonly id: string
  readonly path: string
  readonly tooltipPath: string
  readonly lineMetrics: ReportNodeLineMetrics
  readonly imports: number
  readonly consumers: number
  readonly importedFiles: readonly string[]
  readonly consumerFiles: readonly string[]
  readonly coverage: number | undefined
  readonly color: string
  readonly size: number
  readonly x: number
  readonly y: number
}

/**
 * Renderer-neutral data for one directed dependency edge.
 */
export type ReportEdge = {
  readonly id: string
  readonly source: string
  readonly target: string
}

/**
 * Complete data embedded in one static report.
 */
export type ReportPresentation = {
  readonly schemaVersion: typeof REPORT_PRESENTATION_SCHEMA_VERSION
  readonly projectName: string
  readonly nodes: readonly ReportNode[]
  readonly edges: readonly ReportEdge[]
}

/**
 * Convert internal analysis into deterministic, renderer-neutral graph data.
 *
 * Node size is a radius-like renderer value that grows logarithmically with the
 * file's code-line count by default.
 *
 * @param analysis - Language-neutral project analysis.
 * @returns Presentation data with deterministic node coordinates.
 */
export function buildReportPresentation(analysis: ProjectAnalysis): ReportPresentation {
  const importedFilesBySource = new Map<string, string[]>()
  const consumerFilesByTarget = new Map<string, string[]>()

  for (const dependency of analysis.dependencies) {
    appendMapValue(importedFilesBySource, dependency.source, dependency.target)
    appendMapValue(consumerFilesByTarget, dependency.target, dependency.source)
  }

  const edges = analysis.dependencies.map((dependency, index) => ({
    id: `dependency-${index}`,
    source: dependency.source,
    target: dependency.target,
  }))
  const layout = layoutReportGraph(
    analysis.files.map((file) => ({ id: file.path, size: nodeSizeForLines(file.lines.code) })),
    edges,
  )
  const layoutByNodeId = new Map(layout.map((node) => [node.id, node]))

  const nodes = analysis.files.map((file) => {
    const nodeLayout = layoutByNodeId.get(file.path)
    if (nodeLayout === undefined) {
      throw new Error("Report layout omitted project file " + file.path + ".")
    }
    return {
      id: file.path,
      path: file.path,
      tooltipPath: truncatePathFromStart(file.path),
      lineMetrics: {
        code: file.lines.code,
        comment: file.lines.comment,
        blank: file.lines.blank,
      },
      imports: importedFilesBySource.get(file.path)?.length ?? 0,
      consumers: consumerFilesByTarget.get(file.path)?.length ?? 0,
      importedFiles: importedFilesBySource.get(file.path) ?? [],
      consumerFiles: consumerFilesByTarget.get(file.path) ?? [],
      coverage: file.coverage?.lines,
      color: coverageColor(file.coverage?.lines),
      size: nodeLayout.size,
      x: nodeLayout.x,
      y: nodeLayout.y,
    }
  })

  return {
    schemaVersion: REPORT_PRESENTATION_SCHEMA_VERSION,
    projectName: analysis.project.name,
    nodes,
    edges,
  }
}

/**
 * Calculate a renderer size that grows logarithmically with a line count.
 *
 * @param lines - Active combined line count.
 * @returns A positive renderer size.
 */
export function nodeSizeForLines(lines: number): number {
  return Math.log2(Math.max(lines, 1) + 1) * NODE_SIZE_SCALE
}

/**
 * Sum the selected line categories for project-file sizing.
 *
 * @param metrics - Complete exclusive line metrics.
 * @param categories - Non-empty active line categories.
 * @returns The combined active physical-line count.
 */
export function activeLineCount(metrics: ReportNodeLineMetrics, categories: readonly ReportLineCategory[]): number {
  return categories.reduce((total, category) => total + metrics[category], 0)
}

/**
 * Map optional line coverage onto the report's deterministic node-color scale.
 *
 * @param coverage - Line coverage from 0 through 100, or missing coverage.
 * @returns Neutral gray for missing data or an interpolated red-yellow-green color.
 */
export function coverageColor(coverage: number | undefined): string {
  if (coverage === undefined) {
    return DEFAULT_NODE_COLOR
  }

  const boundedCoverage = Math.max(0, Math.min(100, coverage))
  if (boundedCoverage <= 50) {
    return interpolateColor(UNCOVERED_NODE_COLOR, PARTIALLY_COVERED_NODE_COLOR, boundedCoverage / 50)
  }
  return interpolateColor(PARTIALLY_COVERED_NODE_COLOR, COVERED_NODE_COLOR, (boundedCoverage - 50) / 50)
}

/**
 * Preserve a path's filename while truncating leading directories for a tooltip.
 *
 * @param path - Normalized project-relative path.
 * @param maximumLength - Preferred maximum character count.
 * @returns The original path or a tail-preserving truncated path.
 */
export function truncatePathFromStart(path: string, maximumLength = 48): string {
  if (path.length <= maximumLength) {
    return path
  }

  const fileName = fileNameFromPath(path)
  const minimumTail = `${PATH_TRUNCATION_PREFIX}/${fileName}`
  if (minimumTail.length >= maximumLength) {
    return minimumTail
  }

  return `${PATH_TRUNCATION_PREFIX}${path.slice(-(maximumLength - PATH_TRUNCATION_PREFIX.length))}`
}

function appendMapValue(valuesByKey: Map<string, string[]>, key: string, value: string): void {
  const values = valuesByKey.get(key)
  if (values === undefined) {
    valuesByKey.set(key, [value])
    return
  }
  values.push(value)
}

function fileNameFromPath(path: string): string {
  return path.split("/").at(-1) ?? path
}

function interpolateColor(start: string, end: string, progress: number): string {
  const channels = [1, 3, 5].map((offset) => {
    const startChannel = Number.parseInt(start.slice(offset, offset + 2), 16)
    const endChannel = Number.parseInt(end.slice(offset, offset + 2), 16)
    return Math.round(startChannel + (endChannel - startChannel) * progress)
      .toString(16)
      .padStart(2, "0")
  })
  return `#${channels.join("")}`
}
