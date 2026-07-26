/**
 * Browser bootstrap embedded in every self-contained report.
 *
 * This entrypoint only composes browser-owned presentation, application state,
 * controls, DOM panels, and the Sigma graph controller. Each component owns its
 * effects and enters the browser bundle exclusively through this file.
 */
import type { ProjectAnalysis } from "../../analysis/project-analysis.js"
import { PerformanceProfiler } from "../../performance/performance-profiler.js"
import { renderCoverageLegend } from "./coverage-legend.js"
import { ReportControls, type EdgeVisibilityState } from "./report-controls.js"
import { getReportElements } from "./report-elements.js"
import { ReportGraph } from "./report-graph.js"
import { type ReportInteractionState } from "./report-interaction.js"
import { ReportPanels } from "./report-panels.js"
import { browserPresentationSignature, buildBrowserPresentation } from "./report-presentation.js"
import { buildReportView, initialReportViewState, type ReportViewState } from "./report-view.js"

declare global {
  interface Window {
    /** Internal handoff from the generated HTML shell, not a public browser API. */
    readonly showMeAnalysis: ProjectAnalysis
  }
}

const browserStartedAt = performance.now()
const performanceProfiler = new PerformanceProfiler()
const analysis = window.showMeAnalysis
const presentation = performanceProfiler.measure("browser-presentation", () => buildBrowserPresentation(analysis))
const elements = getReportElements(document)
let viewState = initialReportViewState(presentation)
let edgeVisibility: EdgeVisibilityState = {
  structureEdges: true,
  dependencyEdges: true,
}

document.title = `Show me ${presentation.projectName}`
elements.heading.projectName.textContent = presentation.projectName
renderCoverageLegend(elements.coverageLegend)

const graph = new ReportGraph({
  root: elements.root,
  container: elements.graphContainer,
  presentation,
  initialEdgeVisibility: edgeVisibility,
  performanceProfiler,
  events: {
    onInteractionChange: renderInteraction,
  },
})

const panels = new ReportPanels({
  elements: elements.panels,
  presentation,
  actions: {
    selectNode: (nodeId): void => {
      graph.selectNode(nodeId)
    },
    focusNode: (nodeId): void => {
      graph.focusNode(nodeId)
    },
    clearHover: (nodeId): void => {
      graph.clearHover(nodeId)
    },
    centerNode: (nodeId): void => {
      graph.centerNode(nodeId)
    },
  },
})

const controls = new ReportControls({
  elements: elements.controls,
  presentation,
  initialViewState: viewState,
  initialEdgeVisibility: edgeVisibility,
  events: {
    onViewStateChange: applyViewState,
    onEdgeVisibilityChange(nextEdgeVisibility): void {
      edgeVisibility = nextEdgeVisibility
      graph.setEdgeVisibility(edgeVisibility)
      controls.render(viewState, edgeVisibility)
    },
    onResetCamera: (): void => {
      graph.resetCamera()
    },
  },
})

applyViewState(viewState)
// The graph and interaction state initialize synchronously. Sigma may still
// paint the resulting WebGL frame on the next animation frame.
elements.root.dataset.showMeReady = "true"
elements.root.dataset.performanceMeasurements = JSON.stringify(performanceProfiler.measurements())
elements.root.dataset.browserLoadMilliseconds = String(performance.now() - browserStartedAt)
elements.root.dataset.presentationSignature = browserPresentationSignature(presentation)

function renderInteraction(interaction: ReportInteractionState): void {
  panels.renderInteraction(interaction)
}

function applyViewState(nextViewState: ReportViewState): void {
  viewState = nextViewState
  const view = buildReportView(presentation, viewState)
  graph.applyView(view)
  panels.renderView(view)
  controls.render(viewState, edgeVisibility)
  elements.heading.projectFileCount.textContent = projectFileCountLabel(view.visibleProjectFileCount, analysis.files.length)
}

function projectFileCountLabel(visibleCount: number, totalCount: number): string {
  return `${visibleCount} / ${totalCount} ${totalCount === 1 ? "project file" : "project files"}`
}
