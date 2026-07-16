import { createRng, mulberry32Prng } from "@guillaume-docquier/tools-ts"
import { DirectedGraph } from "graphology"
import forceAtlas2 from "graphology-layout-forceatlas2"
import type { ForceAtlas2SynchronousLayoutParameters } from "graphology-layout-forceatlas2"
import type { ProjectAnalysis } from "../analysis/project-analysis.js"

const LAYOUT_SEED = 1_984_091
const LAYOUT_ITERATIONS = 500
const NODE_SIZE_SCALE = 3
const NODE_LAYOUT_PADDING = 4
const DEFAULT_NODE_COLOR = "#8fa3b8"
const UNCOVERED_NODE_COLOR = "#dc2626"
const PARTIALLY_COVERED_NODE_COLOR = "#eab308"
const COVERED_NODE_COLOR = "#16a34a"
const PATH_TRUNCATION_PREFIX = "..."

/**
 * Renderer-neutral data for one project-file node.
 */
export type ReportNode = {
  readonly id: string
  readonly path: string
  readonly tooltipPath: string
  readonly fileName: string
  readonly lines: number
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

// SAFETY: This CommonJS package exposes its callable layout as the ESM default at runtime, but its declaration is interpreted as a module namespace under NodeNext.
const forceAtlas2Layout = forceAtlas2 as unknown as {
  readonly assign: (
    graph: DirectedGraph<LayoutNodeAttributes>,
    parameters: ForceAtlas2SynchronousLayoutParameters<LayoutNodeAttributes>,
  ) => void
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
  readonly schemaVersion: 1
  readonly projectName: string
  readonly nodes: readonly ReportNode[]
  readonly edges: readonly ReportEdge[]
}

type LayoutNodeAttributes = {
  readonly size: number
  readonly renderedSize: number
  x: number
  y: number
}

/**
 * Convert internal analysis into deterministic, renderer-neutral graph data.
 *
 * Node size is a radius-like renderer value that grows logarithmically with the
 * file's non-blank line count.
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

  const graph = new DirectedGraph<LayoutNodeAttributes>()
  const random = createRng(mulberry32Prng(LAYOUT_SEED))

  for (const file of analysis.files) {
    const renderedSize = nodeSizeForLines(file.lines.nonBlank)
    graph.addNode(file.path, {
      size: renderedSize + NODE_LAYOUT_PADDING,
      renderedSize,
      x: random.float() * 2 - 1,
      y: random.float() * 2 - 1,
    })
  }

  analysis.dependencies.forEach((dependency, index) => {
    graph.addDirectedEdgeWithKey(`dependency-${index}`, dependency.source, dependency.target)
  })

  if (graph.order === 1) {
    const onlyNode = graph.nodes()[0]
    if (onlyNode !== undefined) {
      graph.setNodeAttribute(onlyNode, "x", 0)
      graph.setNodeAttribute(onlyNode, "y", 0)
    }
  } else if (graph.order > 1) {
    forceAtlas2Layout.assign(graph, {
      iterations: LAYOUT_ITERATIONS,
      settings: {
        adjustSizes: true,
        // ForceAtlas2's Barnes-Hut branch does not include node radii in its repulsion calculation.
        barnesHutOptimize: false,
        gravity: 1,
        scalingRatio: 4,
        slowDown: 1,
      },
    })
  }

  const nodes = analysis.files.map((file) => {
    const layout = graph.getNodeAttributes(file.path)
    return {
      id: file.path,
      path: file.path,
      tooltipPath: truncatePathFromStart(file.path),
      fileName: fileNameFromPath(file.path),
      lines: file.lines.nonBlank,
      imports: importedFilesBySource.get(file.path)?.length ?? 0,
      consumers: consumerFilesByTarget.get(file.path)?.length ?? 0,
      importedFiles: importedFilesBySource.get(file.path) ?? [],
      consumerFiles: consumerFilesByTarget.get(file.path) ?? [],
      coverage: file.coverage?.lines,
      color: coverageColor(file.coverage?.lines),
      size: layout.renderedSize,
      x: layout.x,
      y: layout.y,
    }
  })

  const edges = analysis.dependencies.map((dependency, index) => ({
    id: `dependency-${index}`,
    source: dependency.source,
    target: dependency.target,
  }))

  return {
    schemaVersion: 1,
    projectName: analysis.project.name,
    nodes,
    edges,
  }
}

/**
 * Calculate a renderer size that grows logarithmically with LOC.
 *
 * @param lines - Active non-blank line count.
 * @returns A positive renderer size.
 */
export function nodeSizeForLines(lines: number): number {
  return Math.log2(Math.max(lines, 1) + 1) * NODE_SIZE_SCALE
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
