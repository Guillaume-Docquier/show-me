import { describe, expect, it } from "vitest"
import { PerformanceProfiler } from "./performance-profiler.js"

describe("PerformanceProfiler", () => {
  it("aggregates repeated synchronous and asynchronous work by phase", async () => {
    // Arrange
    const profiler = new PerformanceProfiler()

    // Act
    const first = profiler.measure("parsing", () => "first")
    const second = await profiler.measureAsync("parsing", async () => "second")
    const packaged = profiler.measure("html-packaging", () => "report")

    // Assert
    expect({ first, second, packaged }).toEqual({ first: "first", second: "second", packaged: "report" })
    expect(profiler.measurements().map(({ phase }) => phase)).toEqual(["parsing", "html-packaging"])
    expect(profiler.measurements().every(({ durationMilliseconds }) => durationMilliseconds >= 0)).toBe(true)
  })

  it("records failed operations before preserving their failure", () => {
    // Arrange
    const profiler = new PerformanceProfiler()
    const failure = new Error("expected benchmark failure")

    // Act / Assert
    expect(() =>
      profiler.measure("resolution", () => {
        throw failure
      }),
    ).toThrow(failure)
    expect(profiler.measurements()).toEqual([
      expect.objectContaining({
        phase: "resolution",
      }),
    ])
  })
})
