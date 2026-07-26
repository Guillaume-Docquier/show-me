/** Selection and hover state shared between graph and accessible DOM navigation. */
export type ReportInteractionState = {
  readonly selectedNodeId: string | undefined
  readonly hoveredNodeId: string | undefined
}
