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
import { ReportControls } from "./report-controls.js"
import { getReportElements } from "./report-elements.js"
import { ReportGraph } from "./report-graph.js"
import { activeReportLens, initialReportPresentationState, reportLensSettings, type ReportPresentationState } from "./report-lens.js"
import { ReportNavigation, type ReportNavigationState } from "./report-navigation.js"
import { ReportPanels } from "./report-panels.js"
import { browserPresentationSignature, buildBrowserPresentation } from "./report-presentation.js"
import { buildReportView, reportViewGraphSignature } from "./report-view.js"

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
let presentationState = initialReportPresentationState(presentation.workspacePackages.map(({ path }) => path))
let renderedViewSignature: string | undefined

document.title = `Show me ${presentation.projectName}`
elements.heading.projectName.textContent = presentation.projectName
renderCoverageLegend(elements.controls.coverageLegend)

const navigation = new ReportNavigation({
  onChange: renderNavigation,
})
const graph = new ReportGraph({
  root: elements.root,
  container: elements.graphContainer,
  initialLensSettings: reportLensSettings(presentationState),
  performanceProfiler,
  events: {
    onActivateNode: (nodeId): void => {
      navigation.activate(nodeId)
    },
    onClearSelection: (): void => {
      navigation.clearSelection()
      panels.showDefaultSelectionPrompt()
    },
    onPreviewNode: (nodeId): void => {
      navigation.preview(nodeId)
    },
    onClearPreview: (nodeId): void => {
      navigation.clearPreview(nodeId)
    },
  },
})

const panels = new ReportPanels({
  elements: elements.panels,
  presentation,
  actions: {
    activateNode: (nodeId): void => {
      navigation.activate(nodeId)
    },
    previewNode: (nodeId): void => {
      navigation.preview(nodeId)
    },
    clearPreview: (nodeId): void => {
      navigation.clearPreview(nodeId)
    },
    goBack: (): void => {
      navigation.goBack()
    },
    goForward: (): void => {
      navigation.goForward()
    },
  },
})

const controls = new ReportControls({
  elements: elements.controls,
  presentation,
  initialPresentationState: presentationState,
  events: {
    onPresentationStateChange: applyPresentationState,
    onResetCamera: (): void => {
      graph.resetCamera()
    },
  },
})

applyPresentationState(presentationState)
// The graph and interaction state initialize synchronously. Sigma may still
// paint the resulting WebGL frame on the next animation frame.
elements.root.dataset.showMeReady = "true"
elements.root.dataset.performanceMeasurements = JSON.stringify(performanceProfiler.measurements())
elements.root.dataset.browserLoadMilliseconds = String(performance.now() - browserStartedAt)
elements.root.dataset.presentationSignature = browserPresentationSignature(presentation)

function renderNavigation(state: ReportNavigationState, centeredNodeId: string | undefined): void {
  graph.renderInteraction(state)
  panels.renderNavigation(state)
  elements.root.dataset.navigationHistory = JSON.stringify({ entries: state.history, index: state.historyIndex })
  if (centeredNodeId !== undefined) {
    graph.centerNode(centeredNodeId)
  }
}

function applyPresentationState(nextPresentationState: ReportPresentationState): void {
  presentationState = nextPresentationState
  const settings = reportLensSettings(presentationState)
  const view = buildReportView(presentation, presentationState.scope, settings)
  const nextViewSignature = reportViewGraphSignature(view)
  controls.render(presentationState)
  elements.heading.projectFileCount.textContent = projectFileCountLabel(view.visibleProjectFileCount, analysis.files.length)
  graph.setLensSettings(settings)
  if (nextViewSignature !== renderedViewSignature) {
    graph.applyView(view)
    renderedViewSignature = nextViewSignature
    const clearedSelectionNodeId = navigation.setVisibleNodeIds(view.graphNodeIds)
    panels.renderView(view)
    if (clearedSelectionNodeId !== undefined) {
      panels.announceUnavailableSelection()
    }
  }
  elements.root.dataset.activeLens = activeReportLens(presentationState)
  elements.root.dataset.selectedLens = presentationState.lens
  elements.root.dataset.lensSettings = JSON.stringify(settings)
}

function projectFileCountLabel(visibleCount: number, totalCount: number): string {
  return `${visibleCount} / ${totalCount} ${totalCount === 1 ? "project file" : "project files"}`
}
