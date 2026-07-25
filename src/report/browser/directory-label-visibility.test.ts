import { describe, expect, it } from "vitest"
import {
  fileLabelsAreVisible,
  selectVisibleDirectoryLabels,
  type DirectoryLabelCandidate,
  visibleDirectoryDepth,
} from "./directory-label-visibility.js"

describe("visibleDirectoryDepth", () => {
  it.each([
    { cameraRatio: 4.91, expectedDepth: 0 }, // 3x zoom out
    { cameraRatio: 2.88, expectedDepth: 0 }, // 2x zoom out
    { cameraRatio: 1.7, expectedDepth: 1 }, // 1x zoom out
    { cameraRatio: 1, expectedDepth: 1 }, // Default
    { cameraRatio: 0.58, expectedDepth: 5 }, // 1x zoom in
    { cameraRatio: 0.34, expectedDepth: 10 }, // 2x zoom in
    { cameraRatio: 0.2, expectedDepth: Infinity }, // 3x zoom in
    { cameraRatio: 0.11, expectedDepth: Infinity }, // 4x zoom in
  ])("shows directory depth $expectedDepth at camera ratio $cameraRatio", ({ cameraRatio, expectedDepth }) => {
    expect(visibleDirectoryDepth(cameraRatio)).toBe(expectedDepth)
  })
})

describe("fileLabelsAreVisible", () => {
  it.each([
    { cameraRatio: 0.34, expected: false }, // 2x zoom in
    { cameraRatio: 0.2, expected: true }, // 3x zoom in
    { cameraRatio: 0.11, expected: true }, // 4x zoom in
  ])("returns $expected at camera ratio $cameraRatio", ({ cameraRatio, expected }) => {
    expect(fileLabelsAreVisible(cameraRatio)).toBe(expected)
  })
})

describe("selectVisibleDirectoryLabels", () => {
  it("keeps labels apart while favoring shallow and widely representative directories", () => {
    // Arrange
    const candidates = [
      candidate({ id: "directory:.", label: "project", depth: 0, fileCount: 12, bounds: [10, 10, 90, 30] }),
      candidate({ id: "directory:src", label: "src", depth: 1, fileCount: 10, bounds: [40, 10, 100, 30] }),
      candidate({ id: "directory:small", label: "small", depth: 1, fileCount: 2, bounds: [120, 10, 200, 30] }),
      candidate({ id: "directory:large", label: "large", depth: 1, fileCount: 8, bounds: [150, 10, 230, 30] }),
      candidate({ id: "directory:deep", label: "deep", depth: 3, fileCount: 1, bounds: [10, 50, 70, 70] }),
      candidate({ id: "directory:offscreen", label: "offscreen", depth: 0, fileCount: 20, bounds: [410, 10, 500, 30] }),
    ]

    // Act
    const selected = selectVisibleDirectoryLabels(candidates, { width: 400, height: 200 })

    // Assert
    expect(selected.map(({ id }) => id)).toEqual(["directory:.", "directory:large", "directory:deep"])
  })

  it("lets the directory under the pointer replace an overlapping orientation label", () => {
    // Arrange
    const candidates = [
      candidate({ id: "directory:.", label: "project", depth: 0, fileCount: 12, bounds: [10, 10, 90, 30] }),
      candidate({ id: "directory:deep", label: "deep", depth: 4, fileCount: 1, bounds: [40, 10, 100, 30], hovered: true }),
    ]

    // Act
    const selected = selectVisibleDirectoryLabels(candidates, { width: 400, height: 200 })

    // Assert
    expect(selected.map(({ id }) => id)).toEqual(["directory:deep"])
  })
})

function candidate({
  id,
  label,
  depth,
  fileCount,
  bounds,
  hovered = false,
}: {
  readonly id: string
  readonly label: string
  readonly depth: number
  readonly fileCount: number
  readonly bounds: readonly [number, number, number, number]
  readonly hovered?: boolean
}): DirectoryLabelCandidate {
  return {
    id,
    label,
    depth,
    descendantProjectFileCount: fileCount,
    hovered,
    nodeX: bounds[0],
    nodeY: bounds[1],
    bounds: { left: bounds[0], top: bounds[1], right: bounds[2], bottom: bounds[3] },
  }
}
