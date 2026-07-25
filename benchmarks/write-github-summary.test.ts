import { describe, expect, test } from "vitest"
import { renderBenchmarkSummary, renderUnavailableBenchmarkSummary } from "./write-github-summary.ts"

describe("renderBenchmarkSummary", () => {
  test("renders hosted-runner measurements and highlights a budget overrun", () => {
    // Arrange
    const summary = {
      workload: {
        generatorVersion: 1,
        fileCount: 1_000,
        totalLineCount: 5_046_995,
      },
      budgets: {
        cliMilliseconds: 15_000,
        peakRssMiB: 1_250,
        reportSizeMiB: 2,
        browserReadyMilliseconds: 15_000,
        browserLayoutMilliseconds: 10_000,
        interactionMilliseconds: 1_000,
      },
      coldCli: cliResult("cold-process", 13_350.6),
      warmCli: cliResult("warm-filesystem-cache", 13_197.8),
      firstBrowser: browserResult("first-browser", 1_029.6),
      repeatedBrowser: browserResult("repeated-browser", 1_038.9),
    }

    // Act
    const markdown = renderBenchmarkSummary(summary, "failure")

    // Assert
    expect(markdown).toContain("> ⚠️ At least one benchmark budget or scenario failed.")
    expect(markdown).toContain("**1,000 files**, **5,046,995 lines**")
    expect(markdown).toContain("| First browser | ✅ 1,291.6 / 15,000.0 ms | ✅ 742.8 / 10,000.0 ms")
    expect(markdown).toContain("⚠️ 1,029.6 / 1,000.0 ms")
    expect(markdown).toContain("- Analysis deterministic: ✅ matched")
    expect(markdown).toContain("- Browser presentation deterministic: ✅ matched")
  })
})

describe("renderUnavailableBenchmarkSummary", () => {
  test("explains when a scenario stopped before structured evidence was written", () => {
    // Arrange
    const error = new Error("summary.json was not found")

    // Act
    const markdown = renderUnavailableBenchmarkSummary("failure", error)

    // Assert
    expect(markdown).toContain("informational and does not block CI")
    expect(markdown).toContain("Structured benchmark evidence was unavailable: summary.json was not found")
  })
})

function cliResult(kind: string, durationMilliseconds: number): Readonly<Record<string, unknown>> {
  return {
    kind,
    environment: {
      platform: "linux 6.17.0-1020-azure",
      cpu: "AMD EPYC 7763 64-Core Processor",
      logicalCpuCount: 4,
      totalMemoryMiB: 15_989.7,
      nodeVersion: "v26.5.0",
    },
    durationMilliseconds,
    peakRssMiB: 823.3,
    reportSizeMiB: 0.818,
    analysisSha256: "analysis",
    phases: [
      { phase: "discovery", durationMilliseconds: 22.1 },
      { phase: "parsing", durationMilliseconds: 11_495 },
    ],
  }
}

function browserResult(kind: string, panMilliseconds: number): Readonly<Record<string, unknown>> {
  return {
    kind,
    readyMilliseconds: 1_291.6,
    phases: [{ phase: "browser-layout", durationMilliseconds: 742.8 }],
    interactions: {
      zoomMilliseconds: 111.2,
      panMilliseconds,
      hoverMilliseconds: 15.8,
      selectionMilliseconds: 19.4,
    },
    layout: {
      minimumGraphClearance: 1,
    },
    presentationSha256: "presentation",
  }
}
