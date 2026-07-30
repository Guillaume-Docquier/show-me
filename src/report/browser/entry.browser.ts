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
import {
  deriveBoundaryDrillDown,
  deriveBoundaryLensResults,
  type BoundaryDrillDown,
  type BoundaryFilterState,
  type BoundarySelection,
} from "./report-boundaries.js"
import { ReportControls } from "./report-controls.js"
import { deriveCouplingLensResults, type CouplingCycle, type CouplingFilterState } from "./report-coupling.js"
import { deriveCoverageLensResults, normalizeCoverageFilters } from "./report-coverage.js"
import { getReportElements } from "./report-elements.js"
import { ReportFindingsPanel } from "./report-findings-panel.js"
import { deriveReportFindings } from "./report-findings.js"
import { ReportGraph } from "./report-graph.js"
import {
  activeReportLens,
  customizeReportLens,
  initialReportPresentationState,
  reportLensSettings,
  updateCoverageFilters,
  type ReportPresentationState,
} from "./report-lens.js"
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
let renderedFindingsScopeSignature: string | undefined
let selectedCouplingCycle: CouplingCycle | undefined
let selectedBoundary: BoundarySelection | undefined
let currentNavigationState: ReportNavigationState | undefined

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
      activateNode(nodeId)
    },
    onClearSelection: (): void => {
      clearCouplingCycle()
      clearBoundarySelection()
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
      activateNode(nodeId)
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

const findingsPanel = new ReportFindingsPanel({
  elements: elements.findings,
  initialCoverageFilters: presentationState.coverageFilters,
  activateNode: (nodeId): void => {
    activateNode(nodeId)
  },
  updateCoverageFilters: (filters): void => {
    applyPresentationState(updateCoverageFilters(presentationState, normalizeCoverageFilters(filters)))
  },
  activateCycle: (cycle): void => {
    activateCouplingCycle(cycle)
  },
  updateCouplingFilters: (filters): void => {
    applyCouplingFilters(filters)
  },
  activateBoundary: (selection): void => {
    activateBoundarySelection(selection)
  },
  clearBoundary: (): void => {
    clearBoundarySelection(true)
  },
  updateBoundaryFilters: (filters): void => {
    applyBoundaryFilters(filters)
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
  currentNavigationState = state
  graph.renderInteraction(state)
  panels.renderNavigation(state)
  findingsPanel.renderSelection(state.selectedNodeId, selectedCouplingCycle?.id)
  controls.renderFocusLegend(
    (presentationState.lens === "coupling" && (state.hoveredNodeId !== undefined || state.selectedNodeId !== undefined)) ||
      (presentationState.lens === "boundaries" && selectedBoundary !== undefined),
  )
  elements.root.dataset.navigationHistory = JSON.stringify({ entries: state.history, index: state.historyIndex })
  if (centeredNodeId !== undefined) {
    graph.centerNode(centeredNodeId)
  }
}

function applyPresentationState(nextPresentationState: ReportPresentationState): void {
  presentationState = nextPresentationState
  const settings = reportLensSettings(presentationState)
  const boundaryFilters: BoundaryFilterState = {
    runtimeDependencies: settings.runtimeDependencies,
    typeOnlyDependencies: settings.typeOnlyDependencies,
  }
  const boundaryResults = performanceProfiler.measure("browser-boundaries", () =>
    deriveBoundaryLensResults(presentation, presentationState.scope, boundaryFilters),
  )
  let boundaryDrillDown: BoundaryDrillDown | undefined
  if (presentationState.lens === "boundaries" && selectedBoundary !== undefined) {
    boundaryDrillDown = deriveBoundaryDrillDown(boundaryResults, selectedBoundary)
    if (boundaryDrillDown === undefined) {
      selectedBoundary = undefined
    }
  }
  const view = buildReportView(
    presentation,
    presentationState.scope,
    settings,
    boundaryDrillDown === undefined
      ? undefined
      : {
          projectFileNodeIds: new Set(boundaryDrillDown.fileNodeIds),
          dependencyEdgeIds: new Set(boundaryDrillDown.relationships.map(({ edgeId }) => edgeId)),
        },
  )
  const nextViewSignature = reportViewGraphSignature(view)
  controls.render(presentationState)
  findingsPanel.renderLens(presentationState.lens)
  const coverageResults = deriveCoverageLensResults(presentation, presentationState.scope, presentationState.coverageFilters)
  findingsPanel.renderCoverage(coverageResults, presentationState.coverageFilters)
  graph.setDiagnosticEmphasis(presentationState.lens === "coverage" ? coverageResults.matchingNodeIds : undefined)
  const couplingFilters: CouplingFilterState = {
    runtimeDependencies: settings.runtimeDependencies,
    typeOnlyDependencies: settings.typeOnlyDependencies,
    showBackgroundDependencies: settings.dependencyDisplay === "all",
  }
  const couplingResults = performanceProfiler.measure("browser-coupling", () =>
    deriveCouplingLensResults(presentation, presentationState.scope, couplingFilters),
  )
  findingsPanel.renderCoupling(couplingResults, couplingFilters)
  performanceProfiler.measure("browser-boundaries", () => {
    findingsPanel.renderBoundaries(boundaryResults, boundaryFilters)
  })
  panels.renderCoupling(presentationState.lens === "coupling" ? couplingResults : undefined)
  const nextFindingsScopeSignature = JSON.stringify([...presentationState.scope.workspacePackages].toSorted())
  if (nextFindingsScopeSignature !== renderedFindingsScopeSignature) {
    const findings = performanceProfiler.measure("browser-findings", () => deriveReportFindings(presentation, presentationState.scope))
    findingsPanel.render(findings)
    renderedFindingsScopeSignature = nextFindingsScopeSignature
  }
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
  if (presentationState.lens !== "coupling") {
    clearCouplingCycle()
  } else if (selectedCouplingCycle !== undefined) {
    const currentCycle = couplingResults.cycles.find(({ id }) => id === selectedCouplingCycle?.id)
    if (currentCycle === undefined) {
      clearCouplingCycle()
    } else {
      selectedCouplingCycle = currentCycle
      graph.setCouplingCycleFocus(currentCycle)
      panels.showCouplingCycle(currentCycle)
      findingsPanel.renderSelection(undefined, currentCycle.id)
    }
  }
  if (presentationState.lens !== "boundaries") {
    clearBoundarySelection()
  } else if (boundaryDrillDown !== undefined) {
    graph.setBoundaryFocus(boundaryDrillDown)
    panels.showBoundaryDrillDown(boundaryDrillDown)
    findingsPanel.renderBoundarySelection(boundaryDrillDown)
  } else {
    graph.setBoundaryFocus(undefined)
    findingsPanel.renderBoundarySelection(undefined)
  }
  controls.renderFocusLegend(
    (presentationState.lens === "coupling" &&
      (selectedCouplingCycle !== undefined || currentNavigationState?.selectedNodeId !== undefined)) ||
      (presentationState.lens === "boundaries" && selectedBoundary !== undefined),
  )
  elements.root.dataset.activeLens = activeReportLens(presentationState)
  elements.root.dataset.selectedLens = presentationState.lens
  elements.root.dataset.lensSettings = JSON.stringify(settings)
  elements.root.dataset.coverageFilters = JSON.stringify(presentationState.coverageFilters)
}

function activateNode(nodeId: string): void {
  clearCouplingCycle()
  clearBoundarySelection()
  navigation.activate(nodeId)
}

function activateBoundarySelection(selection: BoundarySelection): void {
  clearCouplingCycle()
  selectedBoundary = selection
  navigation.clearSelection()
  applyPresentationState(presentationState)
}

function clearBoundarySelection(rebuildView = false): void {
  if (selectedBoundary === undefined) {
    return
  }
  selectedBoundary = undefined
  graph.setBoundaryFocus(undefined)
  findingsPanel.renderBoundarySelection(undefined)
  if (rebuildView) {
    applyPresentationState(presentationState)
  }
}

function activateCouplingCycle(cycle: CouplingCycle): void {
  selectedCouplingCycle = cycle
  navigation.clearSelection()
  graph.setCouplingCycleFocus(cycle)
  panels.showCouplingCycle(cycle)
  findingsPanel.renderSelection(undefined, cycle.id)
  controls.renderFocusLegend(true)
}

function clearCouplingCycle(): void {
  if (selectedCouplingCycle === undefined) {
    return
  }
  selectedCouplingCycle = undefined
  graph.setCouplingCycleFocus(undefined)
}

function applyCouplingFilters(filters: CouplingFilterState): void {
  const settings = reportLensSettings(presentationState)
  applyPresentationState(
    customizeReportLens(presentationState, {
      ...settings,
      runtimeDependencies: filters.runtimeDependencies,
      typeOnlyDependencies: filters.typeOnlyDependencies,
      dependencyDisplay: filters.showBackgroundDependencies ? "all" : "focused",
    }),
  )
}

function applyBoundaryFilters(filters: BoundaryFilterState): void {
  const settings = reportLensSettings(presentationState)
  applyPresentationState(
    customizeReportLens(presentationState, {
      ...settings,
      runtimeDependencies: filters.runtimeDependencies,
      typeOnlyDependencies: filters.typeOnlyDependencies,
    }),
  )
}

function projectFileCountLabel(visibleCount: number, totalCount: number): string {
  return `${visibleCount} / ${totalCount} ${totalCount === 1 ? "project file" : "project files"}`
}
