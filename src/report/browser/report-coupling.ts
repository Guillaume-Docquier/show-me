import type { ReportScopeState } from "./report-lens.js"
import type { BrowserPresentation, ReportEdge, ReportProjectFileNode } from "./report-presentation.js"

/** Relationship visibility and background-edge controls owned by the Coupling lens. */
export type CouplingFilterState = {
  readonly runtimeDependencies: boolean
  readonly typeOnlyDependencies: boolean
  readonly showBackgroundDependencies: boolean
}

/** Deterministic initial Coupling lens controls. */
export const DEFAULT_COUPLING_FILTERS: CouplingFilterState = {
  runtimeDependencies: true,
  typeOnlyDependencies: true,
  showBackgroundDependencies: false,
}

/** Direct relationship counts for one scoped project file. */
export type CouplingMetric = {
  readonly nodeId: string
  readonly path: string
  readonly fanOut: number
  readonly fanIn: number
  readonly totalDegree: number
  readonly runtimeFanOut: number
  readonly runtimeFanIn: number
  readonly typeOnlyFanOut: number
  readonly typeOnlyFanIn: number
  readonly cycleIds: readonly string[]
}

/** One cyclic strongly connected project-file component. */
export type CouplingCycle = {
  readonly id: string
  readonly kind: "runtime" | "includes-type-only"
  readonly memberNodeIds: readonly string[]
  readonly memberPaths: readonly string[]
  readonly internalEdgeIds: readonly string[]
}

/** Complete renderer-neutral Coupling lens derivation. */
export type CouplingLensResults = {
  readonly metrics: readonly CouplingMetric[]
  readonly metricByNodeId: ReadonlyMap<string, CouplingMetric>
  readonly cycles: readonly CouplingCycle[]
  readonly edges: readonly ReportEdge[]
}

type RelationshipSets = {
  readonly runtimeFanOut: Set<string>
  readonly runtimeFanIn: Set<string>
  readonly typeOnlyFanOut: Set<string>
  readonly typeOnlyFanIn: Set<string>
}

/**
 * Derive scoped direct-degree metrics and cycles for the Coupling lens.
 *
 * Duplicate source-target relationships collapse deterministically. When both
 * kinds describe the same pair, runtime wins while it is visible.
 */
export function deriveCouplingLensResults(
  presentation: BrowserPresentation,
  scope: ReportScopeState,
  filters: CouplingFilterState,
): CouplingLensResults {
  const files = presentation.nodes.filter(
    (node): node is ReportProjectFileNode =>
      node.kind === "project-file" && (node.workspacePackage === undefined || scope.workspacePackages.has(node.workspacePackage)),
  )
  const visibleNodeIds = new Set(files.map(({ id }) => id))
  const candidateEdges = presentation.edges.filter(
    (edge) =>
      edge.targetKind === "project-file" &&
      visibleNodeIds.has(edge.source) &&
      visibleNodeIds.has(edge.target) &&
      (edge.dependencyKind === "runtime" ? filters.runtimeDependencies : filters.typeOnlyDependencies),
  )
  return deriveCouplingFacts(files, collapseRelationshipPairs(candidateEdges))
}

/** Derive coupling facts from already-scoped project files and relationships. */
export function deriveCouplingFacts(files: readonly ReportProjectFileNode[], edges: readonly ReportEdge[]): CouplingLensResults {
  const relationshipSets = new Map<string, RelationshipSets>(
    files.map(({ id }) => [
      id,
      {
        runtimeFanOut: new Set(),
        runtimeFanIn: new Set(),
        typeOnlyFanOut: new Set(),
        typeOnlyFanIn: new Set(),
      },
    ]),
  )
  for (const edge of edges) {
    const source = requiredRelationshipSets(relationshipSets, edge.source)
    const target = requiredRelationshipSets(relationshipSets, edge.target)
    if (edge.dependencyKind === "runtime") {
      source.runtimeFanOut.add(edge.target)
      target.runtimeFanIn.add(edge.source)
    } else {
      source.typeOnlyFanOut.add(edge.target)
      target.typeOnlyFanIn.add(edge.source)
    }
  }

  const cycles = deriveCycles(files, edges)
  const cycleIdsByNodeId = new Map<string, string[]>()
  for (const cycleFact of cycles) {
    for (const nodeId of cycleFact.memberNodeIds) {
      const cycleIds = cycleIdsByNodeId.get(nodeId) ?? []
      cycleIds.push(cycleFact.id)
      cycleIdsByNodeId.set(nodeId, cycleIds)
    }
  }
  const metrics = files
    .map((file): CouplingMetric => {
      const sets = requiredRelationshipSets(relationshipSets, file.id)
      const fanOut = new Set([...sets.runtimeFanOut, ...sets.typeOnlyFanOut]).size
      const fanIn = new Set([...sets.runtimeFanIn, ...sets.typeOnlyFanIn]).size
      return {
        nodeId: file.id,
        path: file.path,
        fanOut,
        fanIn,
        totalDegree: fanOut + fanIn,
        runtimeFanOut: sets.runtimeFanOut.size,
        runtimeFanIn: sets.runtimeFanIn.size,
        typeOnlyFanOut: sets.typeOnlyFanOut.size,
        typeOnlyFanIn: sets.typeOnlyFanIn.size,
        cycleIds: (cycleIdsByNodeId.get(file.id) ?? []).toSorted(compareText),
      }
    })
    .toSorted((left, right) =>
      firstComparison(
        right.totalDegree - left.totalDegree,
        right.fanOut - left.fanOut,
        right.fanIn - left.fanIn,
        compareText(left.path, right.path),
      ),
    )

  return {
    metrics,
    metricByNodeId: new Map(metrics.map((metric) => [metric.nodeId, metric])),
    cycles,
    edges,
  }
}

function collapseRelationshipPairs(edges: readonly ReportEdge[]): readonly ReportEdge[] {
  const edgeByPair = new Map<string, ReportEdge>()
  for (const edge of edges) {
    const pair = JSON.stringify([edge.source, edge.target])
    const existing = edgeByPair.get(pair)
    if (existing === undefined || (existing.dependencyKind === "type-only" && edge.dependencyKind === "runtime")) {
      edgeByPair.set(pair, edge)
    }
  }
  return [...edgeByPair.values()].toSorted((left, right) =>
    firstComparison(compareText(left.source, right.source), compareText(left.target, right.target)),
  )
}

function deriveCycles(files: readonly ReportProjectFileNode[], edges: readonly ReportEdge[]): readonly CouplingCycle[] {
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
    ...runtimeComponents.map((memberNodeIds) => cycle(memberNodeIds, "runtime", fileById, edges)),
    ...combinedComponents.map((memberNodeIds) => cycle(memberNodeIds, "includes-type-only", fileById, edges)),
  ].toSorted((left, right) =>
    firstComparison(
      cycleKindRank(left.kind) - cycleKindRank(right.kind),
      right.memberNodeIds.length - left.memberNodeIds.length,
      compareTextArrays(left.memberPaths, right.memberPaths),
    ),
  )
}

function cycle(
  memberNodeIds: readonly string[],
  kind: CouplingCycle["kind"],
  fileById: ReadonlyMap<string, ReportProjectFileNode>,
  edges: readonly ReportEdge[],
): CouplingCycle {
  const memberNodeIdSet = new Set(memberNodeIds)
  const memberPaths = memberNodeIds
    .map((nodeId) => {
      const file = fileById.get(nodeId)
      if (file === undefined) {
        throw new Error(`Coupling cycle references unavailable project file ${nodeId}.`)
      }
      return file.path
    })
    .toSorted(compareText)
  return {
    id: `coupling-cycle:${kind}:${memberNodeIds.join("|")}`,
    kind,
    memberNodeIds,
    memberPaths,
    internalEdgeIds: edges
      .filter(({ source, target }) => memberNodeIdSet.has(source) && memberNodeIdSet.has(target))
      .map(({ id }) => id)
      .toSorted(compareText),
  }
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

function requiredRelationshipSets(values: ReadonlyMap<string, RelationshipSets>, nodeId: string): RelationshipSets {
  const value = values.get(nodeId)
  if (value === undefined) {
    throw new Error(`Coupling derivation references unavailable project file ${nodeId}.`)
  }
  return value
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

function cycleKindRank(kind: CouplingCycle["kind"]): number {
  return kind === "runtime" ? 0 : 1
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
