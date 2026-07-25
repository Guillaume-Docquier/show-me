import type { DependencyKind } from "../../analysis/project-analysis.js"

/** Graphology/Sigma-only node attributes for the visible report projection. */
export type BrowserNodeAttributes = {
  readonly size: number
  readonly color: string
  readonly x: number
  readonly y: number
  readonly nodeKind: "project-file" | "external-package" | "directory"
  readonly label?: string
  readonly forceLabel?: boolean
  readonly directoryDepth?: number
  readonly descendantProjectFileCount?: number
}

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
