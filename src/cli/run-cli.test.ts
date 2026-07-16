import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { TypeGuard } from "@guillaume-docquier/tools-ts"
import { describe, expect, it } from "vitest"
import { fixtureProjectPath } from "../testing/fixture-project.js"
import { withTemporaryDirectory } from "../testing/temporary-directory.js"
import { type CliOutput, runCli } from "./run-cli.js"

const TEST_BROWSER_BUNDLE = "document.documentElement.dataset.testBundle='ready'"

type CapturedOutput = {
  readonly output: CliOutput
  readonly standardOutput: string[]
  readonly standardError: string[]
}

describe("runCli report generation", () => {
  it("analyzes and writes show-me.html in the invocation directory by default", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      await writeFile(join(currentDirectory, "index.ts"), "export const value = 1")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli([], captured.output, { currentDirectory, browserBundle: TEST_BROWSER_BUNDLE })

      // Assert
      const outputPath = join(currentDirectory, "show-me.html")
      const html = await readFile(outputPath, "utf8")
      expect(exitCode).toBe(0)
      expect(html).toContain("index.ts")
      expect(captured.standardOutput.join("")).toContain(outputPath)
      expect(captured.standardOutput.join("")).toMatch(/Completed in \d+\.\d ms\./u)
      expect(captured.standardError).toEqual([])
    })
  })

  it("supports explicit project and output paths", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      const projectDirectory = join(currentDirectory, "project")
      const reportDirectory = join(currentDirectory, "reports")
      await mkdir(projectDirectory)
      await mkdir(reportDirectory)
      await writeFile(join(projectDirectory, "app.js"), "export const app = true")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli(["project", "--output", "reports/graph.html"], captured.output, {
        currentDirectory,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      const html = await readFile(join(reportDirectory, "graph.html"), "utf8")
      expect(exitCode).toBe(0)
      expect(html).toContain("app.js")
    })
  })

  it("overwrites an existing report without a flag", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      await writeFile(join(currentDirectory, "index.js"), "export const value = true")
      const outputPath = join(currentDirectory, "show-me.html")
      await writeFile(outputPath, "stale report")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli([], captured.output, { currentDirectory, browserBundle: TEST_BROWSER_BUNDLE })

      // Assert
      const html = await readFile(outputPath, "utf8")
      expect(exitCode).toBe(0)
      expect(html).not.toContain("stale report")
      expect(html).toContain("index.js")
    })
  })

  it("reports analysis failures and does not write a report", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      const captured = captureOutput()

      // Act
      const exitCode = await runCli(["missing-project"], captured.output, {
        currentDirectory,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      expect(exitCode).toBe(1)
      expect(captured.standardOutput).toEqual([])
      expect(captured.standardError.join("")).toContain("Could not read project root")
    })
  })

  it("writes directed dependencies and side-panel counts into the report", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      const outputPath = join(currentDirectory, "static-esm.html")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli([fixtureProjectPath("static-esm"), "--output", outputPath], captured.output, {
        currentDirectory,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      const html = await readFile(outputPath, "utf8")
      const serializedPresentation = html.match(/<script>window\.showMePresentation=(.+);<\/script>/u)?.[1]
      if (serializedPresentation === undefined) {
        throw new Error("Generated report did not embed its presentation model.")
      }
      const presentation: unknown = JSON.parse(serializedPresentation)
      if (!TypeGuard.isRecord(presentation) || !TypeGuard.isArray(presentation.nodes) || !TypeGuard.isArray(presentation.edges)) {
        throw new Error("Generated report presentation did not contain node and edge collections.")
      }

      expect(exitCode).toBe(0)
      expect(presentation.edges).toHaveLength(13)
      expect(presentation.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "src/main.ts", imports: 7, consumers: 0 }),
          expect.objectContaining({ path: "src/runtime.ts", imports: 0, consumers: 2 }),
        ]),
      )
      expect(presentation.edges).toEqual(
        expect.arrayContaining([expect.objectContaining({ source: "src/main.ts", target: "src/runtime.ts" })]),
      )
    })
  })
})

function captureOutput(): CapturedOutput {
  const standardOutput: string[] = []
  const standardError: string[] = []
  return {
    standardOutput,
    standardError,
    output: {
      writeStandardOutput(text): void {
        standardOutput.push(text)
      },
      writeStandardError(text): void {
        standardError.push(text)
      },
    },
  }
}
