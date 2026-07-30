import type { DependencyKind } from "../../analysis/project-analysis.js"
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

type RelationshipCounts = {
  readonly runtime: Set<string>
  readonly typeOnly: Set<string>
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
  const findingsByCategory: Readonly<Record<ReportFindingCategory, readonly ReportFinding[]>> = {
    ...deriveLargeFileFindings(files),
    ...deriveFanFindings(files, projectEdges),
    "dependency-cycles": deriveDependencyCycleFindings(files, projectEdges),
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

function deriveFanFindings(
  files: readonly ReportProjectFileNode[],
  edges: readonly ReportEdge[],
): {
  readonly "highest-fan-out": readonly FanFinding[]
  readonly "highest-fan-in": readonly FanFinding[]
} {
  const outgoing = relationshipCounts(files)
  const incoming = relationshipCounts(files)
  for (const edge of edges) {
    relationshipSet(outgoing, edge.source, edge.dependencyKind).add(edge.target)
    relationshipSet(incoming, edge.target, edge.dependencyKind).add(edge.source)
  }

  return {
    "highest-fan-out": fanFindings(files, outgoing, "highest-fan-out"),
    "highest-fan-in": fanFindings(files, incoming, "highest-fan-in"),
  }
}

function relationshipCounts(files: readonly ReportProjectFileNode[]): Map<string, RelationshipCounts> {
  return new Map(
    files.map(({ id }) => [
      id,
      {
        runtime: new Set<string>(),
        typeOnly: new Set<string>(),
      },
    ]),
  )
}

function relationshipSet(countsByNodeId: ReadonlyMap<string, RelationshipCounts>, nodeId: string, kind: DependencyKind): Set<string> {
  const counts = countsByNodeId.get(nodeId)
  if (counts === undefined) {
    throw new Error(`Finding derivation references unavailable project file ${nodeId}.`)
  }
  return kind === "runtime" ? counts.runtime : counts.typeOnly
}

function fanFindings(
  files: readonly ReportProjectFileNode[],
  countsByNodeId: ReadonlyMap<string, RelationshipCounts>,
  category: "highest-fan-out" | "highest-fan-in",
): readonly FanFinding[] {
  return files
    .flatMap((file): readonly FanFinding[] => {
      const counts = countsByNodeId.get(file.id)
      if (counts === undefined) {
        throw new Error(`Finding derivation is missing relationship counts for ${file.id}.`)
      }
      const runtimeCount = counts.runtime.size
      const typeOnlyCount = counts.typeOnly.size
      const totalCount = runtimeCount + typeOnlyCount
      if (totalCount === 0) {
        return []
      }
      const relationshipLabel = category === "highest-fan-out" ? "direct dependencies" : "project-file consumers"
      return [
        {
          id: `${category}:${file.id}`,
          category,
          nodeId: file.id,
          entityName: file.path,
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

function deriveDependencyCycleFindings(
  files: readonly ReportProjectFileNode[],
  edges: readonly ReportEdge[],
): readonly DependencyCycleFinding[] {
  const fileById = new Map(files.map((file) => [file.id, file]))
  const runtimeComponents = cyclicStronglyConnectedComponents(
    files,
    edges.filter(({ dependencyKind }) => dependencyKind === "runtime"),
  )
  const runtimeSignatures = new Set(runtimeComponents.map(componentSignature))
  const combinedComponents = cyclicStronglyConnectedComponents(files, edges).filter(
    (component) => !runtimeSignatures.has(componentSignature(component)),
  )

  return [
    ...runtimeComponents.map((memberNodeIds) => cycleFinding(memberNodeIds, "runtime", fileById)),
    ...combinedComponents.map((memberNodeIds) => cycleFinding(memberNodeIds, "includes-type-only", fileById)),
  ].toSorted((left, right) =>
    firstComparison(
      compareNumbers(cycleKindRank(left.cycleKind), cycleKindRank(right.cycleKind)),
      compareNumbers(right.memberNodeIds.length, left.memberNodeIds.length),
      compareTextArrays(left.memberPaths, right.memberPaths),
    ),
  )
}

function cyclicStronglyConnectedComponents(
  files: readonly ReportProjectFileNode[],
  edges: readonly ReportEdge[],
): ReadonlyArray<readonly string[]> {
  const sortedNodeIds = files.map(({ id }) => id).toSorted(compareText)
  const adjacency = new Map(sortedNodeIds.map((nodeId) => [nodeId, new Set<string>()]))
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target)
  }

  let nextIndex = 0
  const nodeIndex = new Map<string, number>()
  const lowLink = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const components: string[][] = []

  const visit = (nodeId: string): void => {
    const currentIndex = nextIndex
    nextIndex += 1
    nodeIndex.set(nodeId, currentIndex)
    lowLink.set(nodeId, currentIndex)
    stack.push(nodeId)
    onStack.add(nodeId)

    for (const targetId of [...(adjacency.get(nodeId) ?? [])].toSorted(compareText)) {
      if (!nodeIndex.has(targetId)) {
        visit(targetId)
        lowLink.set(nodeId, Math.min(requiredNumber(lowLink, nodeId), requiredNumber(lowLink, targetId)))
      } else if (onStack.has(targetId)) {
        lowLink.set(nodeId, Math.min(requiredNumber(lowLink, nodeId), requiredNumber(nodeIndex, targetId)))
      }
    }

    if (requiredNumber(lowLink, nodeId) !== requiredNumber(nodeIndex, nodeId)) {
      return
    }

    const component: string[] = []
    while (stack.length > 0) {
      const member = stack.pop()
      if (member === undefined) {
        break
      }
      onStack.delete(member)
      component.push(member)
      if (member === nodeId) {
        break
      }
    }
    components.push(component.toSorted(compareText))
  }

  for (const nodeId of sortedNodeIds) {
    if (!nodeIndex.has(nodeId)) {
      visit(nodeId)
    }
  }

  return components.filter(
    (component) => component.length > 1 || (component[0] !== undefined && adjacency.get(component[0])?.has(component[0]) === true),
  )
}

function requiredNumber(values: ReadonlyMap<string, number>, key: string): number {
  const value = values.get(key)
  if (value === undefined) {
    throw new Error(`Strongly connected component derivation is missing ${key}.`)
  }
  return value
}

function componentSignature(memberNodeIds: readonly string[]): string {
  return JSON.stringify(memberNodeIds)
}

function cycleFinding(
  memberNodeIds: readonly string[],
  cycleKind: DependencyCycleFinding["cycleKind"],
  fileById: ReadonlyMap<string, ReportProjectFileNode>,
): DependencyCycleFinding {
  const memberPaths = memberNodeIds
    .map((nodeId) => {
      const file = fileById.get(nodeId)
      if (file === undefined) {
        throw new Error(`Dependency cycle references unavailable project file ${nodeId}.`)
      }
      return file.path
    })
    .toSorted(compareText)
  const representativeNodeId = memberNodeIds.toSorted((left, right) =>
    compareText(fileById.get(left)?.path ?? left, fileById.get(right)?.path ?? right),
  )[0]
  if (representativeNodeId === undefined) {
    throw new Error("A dependency cycle cannot be empty.")
  }
  const kindLabel = cycleKind === "runtime" ? "Runtime" : "Includes type-only dependencies"
  return {
    id: `dependency-cycle:${cycleKind}:${memberNodeIds.join("|")}`,
    category: "dependency-cycles",
    nodeId: representativeNodeId,
    entityName: memberPaths[0] ?? representativeNodeId,
    cycleKind,
    memberNodeIds,
    memberPaths,
    explanation: `${kindLabel} cycle with ${memberPaths.length} ${memberPaths.length === 1 ? "member" : "members"}: ${memberPaths.join(", ")}.`,
  }
}

function cycleKindRank(kind: DependencyCycleFinding["cycleKind"]): number {
  return kind === "runtime" ? 0 : 1
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

function compareTextArrays(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]
    if (leftValue === undefined) {
      return -1
    }
    if (rightValue === undefined) {
      return 1
    }
    const comparison = compareText(leftValue, rightValue)
    if (comparison !== 0) {
      return comparison
    }
  }
  return 0
}
