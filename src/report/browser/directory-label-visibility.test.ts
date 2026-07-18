import { describe, expect, it } from "vitest"
import { visibleDirectoryDepth } from "./directory-label-visibility.js"

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
