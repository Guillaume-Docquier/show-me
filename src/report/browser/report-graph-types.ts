import type { DependencyKind } from "../../analysis/project-analysis.js"
import type { ReportNode } from "./report-presentation.js"

/** Graphology/Sigma-only node attributes for the visible report projection. */
type BrowserNodeAttributesBase = {
  readonly size: number
  readonly color: string
  readonly x: number
  readonly y: number
  readonly label: string
  readonly forceLabel?: boolean
}

/** Graphology/Sigma attributes shared by project files and external packages. */
export type BrowserReportNodeAttributes = BrowserNodeAttributesBase & {
  readonly nodeKind: "report-node"
  readonly reportNodeKind: ReportNode["kind"]
}

/** Graphology/Sigma attributes for one browser-derived directory. */
export type BrowserDirectoryNodeAttributes = BrowserNodeAttributesBase & {
  readonly nodeKind: "directory"
  readonly directoryDepth: number
  readonly descendantProjectFileCount: number
}

/** Graphology/Sigma-only node attributes for the visible report projection. */
export type BrowserNodeAttributes = BrowserReportNodeAttributes | BrowserDirectoryNodeAttributes

/** Graphology/Sigma-only edge attributes for layout and rendering. */
export type BrowserEdgeAttributes = {
  readonly edgeKind: "structure" | "dependency"
  readonly dependencyTargetKind?: "project-file" | "external-package"
  readonly dependencyKind?: DependencyKind
  readonly weight: number
  readonly color?: string
  readonly hidden?: boolean
  readonly size?: number
  readonly type?: string
}

/** One rendered node circle exposed to real-browser geometry assertions. */
export type GraphNodeCircle = {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly radius: number
}
