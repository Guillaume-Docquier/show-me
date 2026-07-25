/** Selection and hover state shared between graph and accessible DOM navigation. */
export type ReportInteractionState = {
  readonly selectedNodeId: string | undefined
  readonly hoveredNodeId: string | undefined
}

/** Initial report interaction before a user points at or selects a node. */
export const INITIAL_REPORT_INTERACTION: ReportInteractionState = {
  selectedNodeId: undefined,
  hoveredNodeId: undefined,
}
