import type { ProjectAnalysis } from "../../analysis/project-analysis.js"

const NODE_SIZE_SCALE = 3
const DEFAULT_NODE_COLOR = "#8fa3b8"
const UNCOVERED_NODE_COLOR = "#dc2626"
const PARTIALLY_COVERED_NODE_COLOR = "#eab308"
const COVERED_NODE_COLOR = "#16a34a"
const PATH_TRUNCATION_PREFIX = "..."
const EXTERNAL_PACKAGE_NODE_SIZE = 8
const EXTERNAL_PACKAGE_NODE_COLOR = "#c084fc"

/** Line categories that report controls can combine for project-file sizing. */
export const REPORT_LINE_CATEGORIES = ["code", "comment", "blank"] as const

/** One selectable project-file line category. */
export type ReportLineCategory = (typeof REPORT_LINE_CATEGORIES)[number]

/** Browser-derived line metrics for one project file. */
export type ReportNodeLineMetrics = {
  readonly code: number
  readonly comment: number
  readonly blank: number
}

type ReportNodeBase = {
  readonly id: string
  readonly displayName: string
  readonly tooltipName: string
  readonly importedNodeIds: readonly string[]
  readonly consumerNodeIds: readonly string[]
  readonly color: string
  readonly size: number
}

/** Browser-derived data for one project-file node. */
export type ReportProjectFileNode = ReportNodeBase & {
  readonly kind: "project-file"
  readonly path: string
  readonly workspacePackage: string | undefined
  readonly lineMetrics: ReportNodeLineMetrics
  readonly coverage: number | undefined
}

/** Browser-derived data for one synthetic external-package node. */
export type ReportExternalPackageNode = ReportNodeBase & {
  readonly kind: "external-package"
  readonly packageName: string
}

/** One selectable report entity. */
export type ReportNode = ReportProjectFileNode | ReportExternalPackageNode

type ReportEdge = {
  readonly id: string
  readonly kind: "project-file" | "external-package"
  readonly source: string
  readonly target: string
}

type BrowserPresentation = {
  readonly projectName: string
  readonly workspacePackages: ProjectAnalysis["workspacePackages"]
  readonly nodes: readonly ReportNode[]
  readonly edges: readonly ReportEdge[]
}

/**
 * Derive deterministic, renderer-neutral browser presentation from the embedded analysis.
 *
 * @param analysis - Complete language-neutral project analysis.
 * @returns Browser-owned identities, display metadata, and relationship indexes.
 */
export function buildBrowserPresentation(analysis: ProjectAnalysis): BrowserPresentation {
  const importedNodeIdsBySource = new Map<string, string[]>()
  const consumerNodeIdsByTarget = new Map<string, string[]>()
  const projectEdges: ReportEdge[] = analysis.dependencies.map((dependency, index) => ({
    id: `project-dependency-${index}`,
    kind: "project-file",
    source: projectFileNodeId(dependency.source),
    target: projectFileNodeId(dependency.target),
  }))
  const externalPackageEdges: ReportEdge[] = analysis.externalPackageDependencies.map((dependency, index) => ({
    id: `external-package-dependency-${index}`,
    kind: "external-package",
    source: projectFileNodeId(dependency.source),
    target: externalPackageNodeId(dependency.target),
  }))
  const edges = [...projectEdges, ...externalPackageEdges]
  for (const edge of edges) {
    appendMapValue(importedNodeIdsBySource, edge.source, edge.target)
    appendMapValue(consumerNodeIdsByTarget, edge.target, edge.source)
  }

  const nodes: ReportNode[] = [
    ...analysis.files.map((file): ReportProjectFileNode => {
      const id = projectFileNodeId(file.path)
      return {
        id,
        kind: "project-file",
        displayName: file.path,
        tooltipName: truncatePathFromStart(file.path),
        path: file.path,
        workspacePackage: file.workspacePackage,
        lineMetrics: file.lines,
        importedNodeIds: importedNodeIdsBySource.get(id) ?? [],
        consumerNodeIds: consumerNodeIdsByTarget.get(id) ?? [],
        coverage: file.coverage?.lines,
        color: coverageColor(file.coverage?.lines),
        size: nodeSizeForLines(file.lines.code),
      }
    }),
    ...analysis.externalPackages.map((externalPackage): ReportExternalPackageNode => {
      const id = externalPackageNodeId(externalPackage.name)
      return {
        id,
        kind: "external-package",
        displayName: externalPackage.name,
        tooltipName: externalPackage.name,
        packageName: externalPackage.name,
        importedNodeIds: [],
        consumerNodeIds: consumerNodeIdsByTarget.get(id) ?? [],
        color: EXTERNAL_PACKAGE_NODE_COLOR,
        size: EXTERNAL_PACKAGE_NODE_SIZE,
      }
    }),
  ]

  return { projectName: analysis.project.name, workspacePackages: analysis.workspacePackages, nodes, edges }
}

/**
 * Calculate a renderer size that grows logarithmically with a line count.
 *
 * @param lines - Active combined physical-line count.
 * @returns A positive renderer size.
 */
export function nodeSizeForLines(lines: number): number {
  return Math.log2(Math.max(lines, 1) + 1) * NODE_SIZE_SCALE
}

/**
 * Sum selected line categories for project-file sizing.
 *
 * @param metrics - Complete exclusive project-file line metrics.
 * @param categories - Non-empty active line categories.
 * @returns The combined active physical-line count.
 */
export function activeLineCount(metrics: ReportNodeLineMetrics, categories: readonly ReportLineCategory[]): number {
  return categories.reduce((total, category) => total + metrics[category], 0)
}

/**
 * Map optional line coverage onto the report's deterministic node-color scale.
 *
 * @param coverage - Line coverage from zero through 100, or missing coverage.
 * @returns Neutral gray for missing data or an interpolated coverage color.
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

  const fileName = path.split("/").at(-1) ?? path
  const minimumTail = `${PATH_TRUNCATION_PREFIX}/${fileName}`
  return minimumTail.length >= maximumLength
    ? minimumTail
    : `${PATH_TRUNCATION_PREFIX}${path.slice(-(maximumLength - PATH_TRUNCATION_PREFIX.length))}`
}

function projectFileNodeId(path: string): string {
  return `project-file:${path}`
}

function externalPackageNodeId(name: string): string {
  return `external-package:${name}`
}

function appendMapValue(valuesByKey: Map<string, string[]>, key: string, value: string): void {
  const values = valuesByKey.get(key)
  if (values === undefined) {
    valuesByKey.set(key, [value])
  } else {
    values.push(value)
  }
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
