import type { ProjectAnalysis } from "../../analysis/project-analysis.js"

const NODE_SIZE_SCALE = 3
const DEFAULT_NODE_COLOR = "#8fa3b8"
const UNCOVERED_NODE_COLOR = "#dc2626"
const PARTIALLY_COVERED_NODE_COLOR = "#eab308"
const COVERED_NODE_COLOR = "#16a34a"
const EXTERNAL_PACKAGE_NODE_SIZE = 8
const EXTERNAL_PACKAGE_NODE_COLOR = "#c084fc"

/**
 * Coverage states explained by the report legend.
 *
 * Their colors are derived through {@link coverageColor}, the same mapping used
 * for project-file nodes.
 */
export const COVERAGE_LEGEND_ENTRIES = [
  { id: "uncovered", coverage: 0, label: "0% uncovered" },
  { id: "partial", coverage: 50, label: "50% partially covered" },
  { id: "covered", coverage: 100, label: "100% covered" },
  { id: "unavailable", coverage: undefined, label: "Not available" },
] as const

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

/** One browser-derived dependency between presentation nodes. */
export type ReportEdge = {
  readonly id: string
  readonly targetKind: "project-file" | "external-package"
  readonly dependencyKind: ProjectAnalysis["dependencies"][number]["kind"]
  readonly source: string
  readonly target: string
}

/** Immutable browser-owned facts from which report views are derived. */
export type BrowserPresentation = {
  readonly projectName: string
  readonly workspacePackages: ProjectAnalysis["workspacePackages"]
  readonly nodes: readonly ReportNode[]
  readonly edges: readonly ReportEdge[]
}

/**
 * Derive deterministic, renderer-neutral browser presentation from the embedded analysis.
 *
 * @param analysis - Complete language-neutral project analysis.
 * @returns Browser-owned identities, display metadata, and classified relationship edges.
 */
export function buildBrowserPresentation(analysis: ProjectAnalysis): BrowserPresentation {
  const projectEdges: ReportEdge[] = analysis.dependencies.map((dependency, index) => ({
    id: `project-dependency-${index}`,
    targetKind: "project-file",
    dependencyKind: dependency.kind,
    source: projectFileNodeId(dependency.source),
    target: projectFileNodeId(dependency.target),
  }))
  const externalPackageEdges: ReportEdge[] = analysis.externalPackageDependencies.map((dependency, index) => ({
    id: `external-package-dependency-${index}`,
    targetKind: "external-package",
    dependencyKind: dependency.kind,
    source: projectFileNodeId(dependency.source),
    target: externalPackageNodeId(dependency.target),
  }))
  const edges = [...projectEdges, ...externalPackageEdges]

  const nodes: ReportNode[] = [
    ...analysis.files.map((file): ReportProjectFileNode => {
      const id = projectFileNodeId(file.path)
      return {
        id,
        kind: "project-file",
        displayName: file.path,
        path: file.path,
        workspacePackage: file.workspacePackage,
        lineMetrics: file.lines,
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
        packageName: externalPackage.name,
        color: EXTERNAL_PACKAGE_NODE_COLOR,
        size: EXTERNAL_PACKAGE_NODE_SIZE,
      }
    }),
  ]

  return { projectName: analysis.project.name, workspacePackages: analysis.workspacePackages, nodes, edges }
}

/**
 * Fingerprint the complete ordered browser presentation for reproducibility checks.
 *
 * @param presentation - Browser-owned facts derived from embedded analysis.
 * @returns A deterministic non-cryptographic hexadecimal signature.
 */
export function browserPresentationSignature(presentation: BrowserPresentation): string {
  let hash = 2_166_136_261
  for (const character of JSON.stringify(presentation)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(16)
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

function projectFileNodeId(path: string): string {
  return `project-file:${path}`
}

function externalPackageNodeId(name: string): string {
  return `external-package:${name}`
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
