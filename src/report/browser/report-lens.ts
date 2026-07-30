import { DEFAULT_COVERAGE_FILTERS, type CoverageFilterState } from "./report-coverage.js"
import type { ReportLineCategory } from "./report-presentation.js"

/** Named report lenses with complete browser behavior. */
export const REPORT_LENSES = ["overview", "structure", "coverage", "coupling"] as const

/** One named task-oriented report presentation. */
export type ReportLens = (typeof REPORT_LENSES)[number]

/** Semantic lens state exposed to users and browser tests. */
export type ActiveReportLens = ReportLens | "custom"

/** How dependency relationships participate in graph rendering. */
export type DependencyDisplay = "all" | "focused" | "hidden"

/** How project-file nodes are colored. */
export type ProjectFileColor = "coverage" | "neutral"

/** Metric used to derive project-file node size. */
export type ProjectFileSize = "line-categories" | "visible-degree"

/** Complete deterministic visual inputs selected by a lens or advanced customization. */
export type ReportLensSettings = {
  /** Always non-empty; these categories determine project-file sizes. */
  readonly lineCategories: readonly ReportLineCategory[]
  /** Whether external-package nodes participate in the visible graph. */
  readonly externalPackages: boolean
  /** Whether explicitly type-only relationships participate in the visible graph. */
  readonly typeOnlyDependencies: boolean
  /** Whether runtime relationships participate in the visible graph. */
  readonly runtimeDependencies: boolean
  /** Whether directory containment edges are drawn. */
  readonly structureEdges: boolean
  /** Whether dependency edges are all drawn, focused only, or entirely hidden. */
  readonly dependencyDisplay: DependencyDisplay
  /** Whether project-file color represents coverage or uses one neutral color. */
  readonly projectFileColor: ProjectFileColor
  /** Whether project files are sized by physical lines or visible direct degree. */
  readonly projectFileSize: ProjectFileSize
}

/** Codebase scope preserved independently from lens selection and customization. */
export type ReportScopeState = {
  /** Workspace packages whose owned project files participate in the visible graph. */
  readonly workspacePackages: ReadonlySet<string>
}

/** Advanced values that differ from the selected named lens. */
export type ReportAdvancedOverrides = {
  readonly lineCategories?: readonly ReportLineCategory[]
  readonly externalPackages?: boolean
  readonly typeOnlyDependencies?: boolean
  readonly runtimeDependencies?: boolean
  readonly structureEdges?: boolean
  readonly dependencyDisplay?: DependencyDisplay
  readonly projectFileColor?: ProjectFileColor
  readonly projectFileSize?: ProjectFileSize
}

/** Browser-owned persistent presentation state, excluding transient navigation and hover. */
export type ReportPresentationState = {
  readonly scope: ReportScopeState
  readonly lens: ReportLens
  readonly advancedOverrides: ReportAdvancedOverrides
  readonly coverageFilters: CoverageFilterState
}

const OVERVIEW_SETTINGS: ReportLensSettings = {
  lineCategories: ["code"],
  externalPackages: false,
  typeOnlyDependencies: true,
  runtimeDependencies: true,
  structureEdges: true,
  dependencyDisplay: "focused",
  projectFileColor: "coverage",
  projectFileSize: "line-categories",
}

const STRUCTURE_SETTINGS: ReportLensSettings = {
  lineCategories: ["code"],
  externalPackages: false,
  typeOnlyDependencies: true,
  runtimeDependencies: true,
  structureEdges: true,
  dependencyDisplay: "hidden",
  projectFileColor: "neutral",
  projectFileSize: "line-categories",
}

const COVERAGE_SETTINGS: ReportLensSettings = {
  lineCategories: ["code"],
  externalPackages: false,
  typeOnlyDependencies: true,
  runtimeDependencies: true,
  structureEdges: true,
  dependencyDisplay: "hidden",
  projectFileColor: "coverage",
  projectFileSize: "line-categories",
}

const COUPLING_SETTINGS: ReportLensSettings = {
  lineCategories: ["code"],
  externalPackages: false,
  typeOnlyDependencies: true,
  runtimeDependencies: true,
  structureEdges: false,
  dependencyDisplay: "focused",
  projectFileColor: "coverage",
  projectFileSize: "visible-degree",
}

/** Create the initial Overview state over every discovered workspace package. */
export function initialReportPresentationState(workspacePackagePaths: readonly string[]): ReportPresentationState {
  return {
    scope: { workspacePackages: new Set(workspacePackagePaths) },
    lens: "overview",
    advancedOverrides: {},
    coverageFilters: DEFAULT_COVERAGE_FILTERS,
  }
}

/** Return a fresh copy of one named lens's deterministic settings. */
export function reportLensPreset(lens: ReportLens): ReportLensSettings {
  const preset =
    lens === "overview"
      ? OVERVIEW_SETTINGS
      : lens === "structure"
        ? STRUCTURE_SETTINGS
        : lens === "coverage"
          ? COVERAGE_SETTINGS
          : COUPLING_SETTINGS
  return { ...preset, lineCategories: [...preset.lineCategories] }
}

/** Resolve the selected lens plus explicit advanced overrides into complete visual settings. */
export function reportLensSettings(state: ReportPresentationState): ReportLensSettings {
  const preset = reportLensPreset(state.lens)
  return {
    lineCategories: state.advancedOverrides.lineCategories ?? preset.lineCategories,
    externalPackages: state.advancedOverrides.externalPackages ?? preset.externalPackages,
    typeOnlyDependencies: state.advancedOverrides.typeOnlyDependencies ?? preset.typeOnlyDependencies,
    runtimeDependencies: state.advancedOverrides.runtimeDependencies ?? preset.runtimeDependencies,
    structureEdges: state.advancedOverrides.structureEdges ?? preset.structureEdges,
    dependencyDisplay: state.advancedOverrides.dependencyDisplay ?? preset.dependencyDisplay,
    projectFileColor: state.advancedOverrides.projectFileColor ?? preset.projectFileColor,
    projectFileSize: state.advancedOverrides.projectFileSize ?? preset.projectFileSize,
  }
}

/** Derive whether the selected named lens still exactly describes the active presentation. */
export function activeReportLens(state: ReportPresentationState): ActiveReportLens {
  return hasAdvancedOverrides(state.advancedOverrides) ? "custom" : state.lens
}

/** Select a named lens, preserve codebase scope, and remove every advanced override. */
export function selectReportLens(state: ReportPresentationState, lens: ReportLens): ReportPresentationState {
  return {
    scope: state.scope,
    lens,
    advancedOverrides: {},
    coverageFilters: state.coverageFilters,
  }
}

/** Replace codebase scope without changing the selected lens or its advanced overrides. */
export function updateReportScope(state: ReportPresentationState, scope: ReportScopeState): ReportPresentationState {
  return { ...state, scope }
}

/** Replace Coverage lens thresholds without changing scope or presentation settings. */
export function updateCoverageFilters(state: ReportPresentationState, coverageFilters: CoverageFilterState): ReportPresentationState {
  return { ...state, coverageFilters }
}

/**
 * Replace advanced settings and retain only values that differ from the selected lens.
 *
 * Returning every value to the preset automatically leaves the derived Custom state.
 */
export function customizeReportLens(state: ReportPresentationState, settings: ReportLensSettings): ReportPresentationState {
  const preset = reportLensPreset(state.lens)
  const advancedOverrides: ReportAdvancedOverrides = {
    ...(sameLineCategories(settings.lineCategories, preset.lineCategories) ? {} : { lineCategories: [...settings.lineCategories] }),
    ...(settings.externalPackages === preset.externalPackages ? {} : { externalPackages: settings.externalPackages }),
    ...(settings.typeOnlyDependencies === preset.typeOnlyDependencies ? {} : { typeOnlyDependencies: settings.typeOnlyDependencies }),
    ...(settings.runtimeDependencies === preset.runtimeDependencies ? {} : { runtimeDependencies: settings.runtimeDependencies }),
    ...(settings.structureEdges === preset.structureEdges ? {} : { structureEdges: settings.structureEdges }),
    ...(settings.dependencyDisplay === preset.dependencyDisplay ? {} : { dependencyDisplay: settings.dependencyDisplay }),
    ...(settings.projectFileColor === preset.projectFileColor ? {} : { projectFileColor: settings.projectFileColor }),
    ...(settings.projectFileSize === preset.projectFileSize ? {} : { projectFileSize: settings.projectFileSize }),
  }
  return { ...state, advancedOverrides }
}

function hasAdvancedOverrides(overrides: ReportAdvancedOverrides): boolean {
  return (
    overrides.lineCategories !== undefined ||
    overrides.externalPackages !== undefined ||
    overrides.typeOnlyDependencies !== undefined ||
    overrides.runtimeDependencies !== undefined ||
    overrides.structureEdges !== undefined ||
    overrides.dependencyDisplay !== undefined ||
    overrides.projectFileColor !== undefined ||
    overrides.projectFileSize !== undefined
  )
}

function sameLineCategories(left: readonly ReportLineCategory[], right: readonly ReportLineCategory[]): boolean {
  return left.length === right.length && left.every((category, index) => category === right[index])
}
