import type { DependencyKind } from "../../analysis/project-analysis.js"
import { deriveCouplingFacts, type CouplingLensResults, type CouplingMetric } from "./report-coupling.js"
import type { ReportScopeState } from "./report-lens.js"
import type { BrowserPresentation, ReportEdge, ReportProjectFileNode } from "./report-presentation.js"

/** Finding categories shown by the Overview lens in stable display order. */
export const REPORT_FINDING_CATEGORIES = [
  "large-low-coverage",
  "large-unavailable-coverage",
  "highest-fan-out",
  "highest-fan-in",
  "dependency-cycles",
  "cross-workspace-relationships",
] as const

/** One semantic Overview finding category. */
export type ReportFindingCategory = (typeof REPORT_FINDING_CATEGORIES)[number]

type ReportFindingBase = {
  readonly id: string
  readonly category: ReportFindingCategory
  readonly nodeId: string
  readonly entityName: string
  readonly explanation: string
}

/** A large project file whose known coverage is below the Overview threshold. */
export type LargeLowCoverageFinding = ReportFindingBase & {
  readonly category: "large-low-coverage"
  readonly codeLines: number
  readonly coverage: number
}

/** A large project file for which the report has no coverage data. */
export type LargeUnavailableCoverageFinding = ReportFindingBase & {
  readonly category: "large-unavailable-coverage"
  readonly codeLines: number
}

/** A project file ranked by distinct direct dependencies or consumers. */
export type FanFinding = ReportFindingBase & {
  readonly category: "highest-fan-out" | "highest-fan-in"
  readonly totalCount: number
  readonly runtimeCount: number
  readonly typeOnlyCount: number
}

/** One strongly connected project-file component. */
export type DependencyCycleFinding = ReportFindingBase & {
  readonly category: "dependency-cycles"
  readonly cycleKind: "runtime" | "includes-type-only"
  readonly memberNodeIds: readonly string[]
  readonly memberPaths: readonly string[]
}

/** One grouped relationship direction between two workspace packages. */
export type CrossWorkspaceFinding = ReportFindingBase & {
  readonly category: "cross-workspace-relationships"
  readonly dependencyKind: DependencyKind
  readonly sourceWorkspace: string
  readonly targetWorkspace: string
  readonly relationshipCount: number
}

/** One explainable browser-derived candidate for investigation. */
export type ReportFinding =
  | LargeLowCoverageFinding
  | LargeUnavailableCoverageFinding
  | FanFinding
  | DependencyCycleFinding
  | CrossWorkspaceFinding

/** One non-empty categorized deterministic finding list. */
export type ReportFindingGroup = {
  readonly category: ReportFindingCategory
  readonly label: string
  readonly findings: readonly ReportFinding[]
}

const CATEGORY_LABELS: Readonly<Record<ReportFindingCategory, string>> = {
  "large-low-coverage": "Large files with low known coverage",
  "large-unavailable-coverage": "Large files with unavailable coverage",
  "highest-fan-out": "Highest fan-out",
  "highest-fan-in": "Highest fan-in",
  "dependency-cycles": "Dependency cycles",
  "cross-workspace-relationships": "Cross-workspace relationships",
}

/**
 * Derive every deterministic Overview finding from immutable presentation facts.
 *
 * Project-tree search and graph customization are intentionally absent from the
 * input. Workspace-package scope is the only user state that changes findings.
 *
 * @param presentation - Immutable browser-owned project facts.
 * @param scope - Active workspace-package scope.
 * @returns Non-empty categories in stable Overview display order.
 */
export function deriveReportFindings(presentation: BrowserPresentation, scope: ReportScopeState): readonly ReportFindingGroup[] {
  const files = visibleProjectFiles(presentation, scope)
  const visibleNodeIds = new Set(files.map(({ id }) => id))
  const projectEdges = presentation.edges.filter(
    (edge) => edge.targetKind === "project-file" && visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
  )
  const coupling = deriveCouplingFacts(files, projectEdges)
  const findingsByCategory: Readonly<Record<ReportFindingCategory, readonly ReportFinding[]>> = {
    ...deriveLargeFileFindings(files),
    ...deriveFanFindings(coupling),
    "dependency-cycles": deriveDependencyCycleFindings(coupling),
    "cross-workspace-relationships": deriveCrossWorkspaceFindings(presentation, files, projectEdges),
  }

  return REPORT_FINDING_CATEGORIES.flatMap((category) => {
    const findings = findingsByCategory[category]
    return findings.length === 0 ? [] : [{ category, label: CATEGORY_LABELS[category], findings }]
  })
}

function visibleProjectFiles(presentation: BrowserPresentation, scope: ReportScopeState): readonly ReportProjectFileNode[] {
  return presentation.nodes.filter(
    (node): node is ReportProjectFileNode =>
      node.kind === "project-file" && (node.workspacePackage === undefined || scope.workspacePackages.has(node.workspacePackage)),
  )
}

function deriveLargeFileFindings(files: readonly ReportProjectFileNode[]): {
  readonly "large-low-coverage": readonly LargeLowCoverageFinding[]
  readonly "large-unavailable-coverage": readonly LargeUnavailableCoverageFinding[]
} {
  const positiveCodeLineCounts = files
    .flatMap(({ lineMetrics }) => (lineMetrics.code > 0 ? [lineMetrics.code] : []))
    .toSorted(compareNumbers)
  const threshold = nearestRankPercentile(positiveCodeLineCounts, 75)
  if (threshold === undefined) {
    return { "large-low-coverage": [], "large-unavailable-coverage": [] }
  }

  const largeFiles = files.filter(({ lineMetrics }) => lineMetrics.code >= threshold)
  return {
    "large-low-coverage": largeFiles
      .flatMap((file): readonly LargeLowCoverageFinding[] => {
        if (file.coverage === undefined || file.coverage >= 80) {
          return []
        }
        return [
          {
            id: `large-low-coverage:${file.id}`,
            category: "large-low-coverage",
            nodeId: file.id,
            entityName: file.path,
            codeLines: file.lineMetrics.code,
            coverage: file.coverage,
            explanation: `${file.lineMetrics.code} code lines place this file in the upper quartile, with ${file.coverage}% known coverage.`,
          },
        ]
      })
      .toSorted((left, right) =>
        firstComparison(
          compareNumbers(left.coverage, right.coverage),
          compareNumbers(right.codeLines, left.codeLines),
          compareText(left.entityName, right.entityName),
        ),
      ),
    "large-unavailable-coverage": largeFiles
      .flatMap((file): readonly LargeUnavailableCoverageFinding[] => {
        if (file.coverage !== undefined) {
          return []
        }
        return [
          {
            id: `large-unavailable-coverage:${file.id}`,
            category: "large-unavailable-coverage",
            nodeId: file.id,
            entityName: file.path,
            codeLines: file.lineMetrics.code,
            explanation: `${file.lineMetrics.code} code lines place this file in the upper quartile, but coverage is unavailable.`,
          },
        ]
      })
      .toSorted((left, right) =>
        firstComparison(compareNumbers(right.codeLines, left.codeLines), compareText(left.entityName, right.entityName)),
      ),
  }
}

function deriveFanFindings(coupling: CouplingLensResults): {
  readonly "highest-fan-out": readonly FanFinding[]
  readonly "highest-fan-in": readonly FanFinding[]
} {
  return {
    "highest-fan-out": fanFindings(coupling.metrics, "highest-fan-out"),
    "highest-fan-in": fanFindings(coupling.metrics, "highest-fan-in"),
  }
}

function fanFindings(metrics: readonly CouplingMetric[], category: "highest-fan-out" | "highest-fan-in"): readonly FanFinding[] {
  return metrics
    .flatMap((metric): readonly FanFinding[] => {
      const runtimeCount = category === "highest-fan-out" ? metric.runtimeFanOut : metric.runtimeFanIn
      const typeOnlyCount = category === "highest-fan-out" ? metric.typeOnlyFanOut : metric.typeOnlyFanIn
      const totalCount = category === "highest-fan-out" ? metric.fanOut : metric.fanIn
      if (totalCount === 0) {
        return []
      }
      const relationshipLabel = category === "highest-fan-out" ? "direct dependencies" : "project-file consumers"
      return [
        {
          id: `${category}:${metric.nodeId}`,
          category,
          nodeId: metric.nodeId,
          entityName: metric.path,
          totalCount,
          runtimeCount,
          typeOnlyCount,
          explanation: `${totalCount} distinct ${relationshipLabel}: ${runtimeCount} runtime and ${typeOnlyCount} type only.`,
        },
      ]
    })
    .toSorted((left, right) =>
      firstComparison(
        compareNumbers(right.totalCount, left.totalCount),
        compareNumbers(right.runtimeCount, left.runtimeCount),
        compareText(left.entityName, right.entityName),
      ),
    )
}

function deriveDependencyCycleFindings(coupling: CouplingLensResults): readonly DependencyCycleFinding[] {
  return coupling.cycles.map((cycle): DependencyCycleFinding => {
    const representativeNodeId = cycle.memberNodeIds[0]
    if (representativeNodeId === undefined) {
      throw new Error("A dependency cycle cannot be empty.")
    }
    const kindLabel = cycle.kind === "runtime" ? "Runtime" : "Includes type-only dependencies"
    return {
      id: cycle.id.replace("coupling-cycle:", "dependency-cycle:"),
      category: "dependency-cycles",
      nodeId: representativeNodeId,
      entityName: cycle.memberPaths[0] ?? representativeNodeId,
      cycleKind: cycle.kind,
      memberNodeIds: cycle.memberNodeIds,
      memberPaths: cycle.memberPaths,
      explanation: `${kindLabel} cycle with ${cycle.memberPaths.length} ${cycle.memberPaths.length === 1 ? "member" : "members"}: ${cycle.memberPaths.join(", ")}.`,
    }
  })
}

function deriveCrossWorkspaceFindings(
  presentation: BrowserPresentation,
  files: readonly ReportProjectFileNode[],
  edges: readonly ReportEdge[],
): readonly CrossWorkspaceFinding[] {
  const fileById = new Map(files.map((file) => [file.id, file]))
  const workspaceNameByPath = new Map(presentation.workspacePackages.map(({ path, name }) => [path, name]))
  const groups = new Map<
    string,
    {
      readonly sourceWorkspace: string
      readonly targetWorkspace: string
      readonly dependencyKind: DependencyKind
      readonly edges: ReportEdge[]
    }
  >()

  for (const edge of edges) {
    const sourceFile = fileById.get(edge.source)
    const targetFile = fileById.get(edge.target)
    const sourceWorkspace = sourceFile?.workspacePackage
    const targetWorkspace = targetFile?.workspacePackage
    if (
      sourceFile === undefined ||
      targetFile === undefined ||
      sourceWorkspace === undefined ||
      targetWorkspace === undefined ||
      sourceWorkspace === targetWorkspace
    ) {
      continue
    }
    const groupKey = JSON.stringify([sourceWorkspace, targetWorkspace, edge.dependencyKind])
    const group = groups.get(groupKey)
    if (group === undefined) {
      groups.set(groupKey, {
        sourceWorkspace,
        targetWorkspace,
        dependencyKind: edge.dependencyKind,
        edges: [edge],
      })
    } else {
      group.edges.push(edge)
    }
  }

  return [...groups.values()]
    .map((group): CrossWorkspaceFinding => {
      const sortedEdges = group.edges.toSorted((left, right) =>
        firstComparison(
          compareText(fileById.get(left.source)?.path ?? left.source, fileById.get(right.source)?.path ?? right.source),
          compareText(fileById.get(left.target)?.path ?? left.target, fileById.get(right.target)?.path ?? right.target),
        ),
      )
      const representative = sortedEdges[0]
      if (representative === undefined) {
        throw new Error("A cross-workspace finding cannot be empty.")
      }
      const sourceName = workspaceNameByPath.get(group.sourceWorkspace) ?? group.sourceWorkspace
      const targetName = workspaceNameByPath.get(group.targetWorkspace) ?? group.targetWorkspace
      return {
        id: `cross-workspace:${group.sourceWorkspace}:${group.targetWorkspace}:${group.dependencyKind}`,
        category: "cross-workspace-relationships",
        nodeId: representative.source,
        entityName: `${sourceName} → ${targetName}`,
        dependencyKind: group.dependencyKind,
        sourceWorkspace: group.sourceWorkspace,
        targetWorkspace: group.targetWorkspace,
        relationshipCount: group.edges.length,
        explanation: `${group.edges.length} ${group.dependencyKind} ${group.edges.length === 1 ? "relationship" : "relationships"} from ${sourceName} to ${targetName}.`,
      }
    })
    .toSorted((left, right) =>
      firstComparison(
        compareNumbers(right.relationshipCount, left.relationshipCount),
        compareText(left.entityName, right.entityName),
        compareNumbers(dependencyKindRank(left.dependencyKind), dependencyKindRank(right.dependencyKind)),
      ),
    )
}

function dependencyKindRank(kind: DependencyKind): number {
  return kind === "runtime" ? 0 : 1
}

function nearestRankPercentile(sortedValues: readonly number[], percentile: number): number | undefined {
  if (sortedValues.length === 0) {
    return undefined
  }
  return sortedValues[Math.ceil((percentile / 100) * sortedValues.length) - 1]
}

function compareNumbers(left: number, right: number): number {
  return left - right
}

function firstComparison(...comparisons: readonly number[]): number {
  return comparisons.find((comparison) => comparison !== 0) ?? 0
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
