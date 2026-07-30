import { expect, it } from "vitest"
import {
  activeReportLens,
  customizeReportLens,
  initialReportPresentationState,
  reportLensPreset,
  reportLensSettings,
  selectReportLens,
  updateReportScope,
} from "./report-lens.js"

it("starts in the deterministic Overview preset over every workspace package", () => {
  // Arrange
  const workspacePackages = ["apps/frontend", "apps/backend"]

  // Act
  const state = initialReportPresentationState(workspacePackages)

  // Assert
  expect(activeReportLens(state)).toBe("overview")
  expect(state.scope.workspacePackages).toEqual(new Set(workspacePackages))
  expect(reportLensSettings(state)).toEqual({
    lineCategories: ["code"],
    externalPackages: false,
    typeOnlyDependencies: true,
    structureEdges: true,
    dependencyDisplay: "focused",
    projectFileColor: "coverage",
  })
})

it("preserves scope and deterministically restores each named lens", () => {
  // Arrange
  const initial = updateReportScope(initialReportPresentationState(["apps/frontend", "apps/backend"]), {
    workspacePackages: new Set(["apps/frontend"]),
  })
  const customized = customizeReportLens(initial, {
    ...reportLensSettings(initial),
    externalPackages: true,
  })

  // Act
  const structure = selectReportLens(customized, "structure")
  const coverage = selectReportLens(structure, "coverage")
  const overview = selectReportLens(coverage, "overview")

  // Assert
  expect(structure.scope.workspacePackages).toEqual(new Set(["apps/frontend"]))
  expect(activeReportLens(structure)).toBe("structure")
  expect(reportLensSettings(structure)).toEqual(reportLensPreset("structure"))
  expect(coverage.scope.workspacePackages).toEqual(new Set(["apps/frontend"]))
  expect(activeReportLens(coverage)).toBe("coverage")
  expect(reportLensSettings(coverage)).toEqual({
    lineCategories: ["code"],
    externalPackages: false,
    typeOnlyDependencies: true,
    structureEdges: true,
    dependencyDisplay: "hidden",
    projectFileColor: "coverage",
  })
  expect(overview.scope.workspacePackages).toEqual(new Set(["apps/frontend"]))
  expect(activeReportLens(overview)).toBe("overview")
  expect(reportLensSettings(overview)).toEqual(reportLensPreset("overview"))
})

it("derives Custom only while advanced settings differ from the selected preset", () => {
  // Arrange
  const initial = initialReportPresentationState([])
  const preset = reportLensSettings(initial)

  // Act
  const customized = customizeReportLens(initial, {
    ...preset,
    lineCategories: ["code", "comment"],
    dependencyDisplay: "all",
  })
  const restored = customizeReportLens(customized, preset)

  // Assert
  expect(activeReportLens(customized)).toBe("custom")
  expect(customized.advancedOverrides).toEqual({
    lineCategories: ["code", "comment"],
    dependencyDisplay: "all",
  })
  expect(activeReportLens(restored)).toBe("overview")
  expect(restored.advancedOverrides).toEqual({})
})
