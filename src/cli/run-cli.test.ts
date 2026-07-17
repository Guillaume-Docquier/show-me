import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { TypeGuard } from "@guillaume-docquier/tools-ts"
import { describe, expect, it } from "vitest"
import packageMetadata from "../../package.json" with { type: "json" }
import { fixtureProjectPath } from "../testing/fixture-project.js"
import { withTemporaryDirectory } from "../testing/temporary-directory.js"
import { type CliOutput, runCli } from "./run-cli.js"

const TEST_BROWSER_BUNDLE = "document.documentElement.dataset.testBundle='ready'"

type CapturedOutput = {
  readonly output: CliOutput
  readonly standardOutput: string[]
  readonly standardError: string[]
}

describe("runCli", () => {
  it("reports invalid arguments on standard error", async () => {
    // Arrange
    const captured = captureOutput()

    // Act
    const exitCode = await runCli(["--open"], captured.output, { browserBundle: TEST_BROWSER_BUNDLE })

    // Assert
    expect(exitCode).toBe(1)
    expect(captured.standardOutput).toEqual([])
    expect(captured.standardError).toEqual(["Unknown option: --open\n"])
  })

  it("prints help without analyzing a project", async () => {
    // Arrange
    const captured = captureOutput()

    // Act
    const exitCode = await runCli(["--help"], captured.output, { browserBundle: TEST_BROWSER_BUNDLE })

    // Assert
    expect(exitCode).toBe(0)
    expect(captured.standardOutput).toEqual([
      `Usage: show-me [project-path] [options]

Options:
  --output <path>    Write the report to this path
  --coverage <path>  Read coverage from this path
  -h, --help         Show this help
  -v, --version      Show the version
`,
    ])
    expect(captured.standardError).toEqual([])
  })

  it("prints the package version without analyzing a project", async () => {
    // Arrange
    const captured = captureOutput()

    // Act
    const exitCode = await runCli(["--version"], captured.output, { browserBundle: TEST_BROWSER_BUNDLE })

    // Assert
    expect(exitCode).toBe(0)
    expect(captured.standardOutput).toEqual([`${packageMetadata.version}\n`])
    expect(captured.standardError).toEqual([])
  })

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
      expect(captured.standardOutput.join("")).toContain("No coverage file found")
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

  it("reports a write failure without printing completion", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      await writeFile(join(currentDirectory, "index.js"), "export const value = true")
      const outputDirectory = join(currentDirectory, "report-directory")
      await mkdir(outputDirectory)
      const captured = captureOutput()

      // Act
      const exitCode = await runCli(["--output", outputDirectory], captured.output, {
        currentDirectory,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      expect(exitCode).toBe(1)
      expect(captured.standardOutput.join("")).not.toContain("Report written")
      expect(captured.standardOutput.join("")).not.toContain("Completed in")
      expect(captured.standardError.join("")).toContain(`Could not write report to ${outputDirectory}:`)
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
      expect(presentation.edges).toHaveLength(14)
      expect(presentation.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "project-file:src/main.ts",
            path: "src/main.ts",
            importedNodeIds: expect.arrayContaining(["external-package:external-package"]),
            consumerNodeIds: [],
          }),
          expect.objectContaining({
            id: "project-file:src/runtime.ts",
            path: "src/runtime.ts",
            importedNodeIds: [],
            consumerNodeIds: ["project-file:src/main.ts", "project-file:src/reexports.ts"],
          }),
          expect.objectContaining({
            id: "external-package:external-package",
            kind: "external-package",
            packageName: "external-package",
          }),
        ]),
      )
      expect(presentation.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "project-file:src/main.ts",
            target: "project-file:src/runtime.ts",
          }),
        ]),
      )
    })
  })

  it("automatically imports project-root coverage when it is present", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      await writeFile(join(currentDirectory, "index.ts"), "export const value = 1")
      const coverageDirectory = join(currentDirectory, "coverage")
      await mkdir(coverageDirectory)
      await writeFile(join(coverageDirectory, "coverage-final.json"), coverageFinal("index.ts", 1), "utf8")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli([], captured.output, { currentDirectory, browserBundle: TEST_BROWSER_BUNDLE })

      // Assert
      const presentation = parsePresentation(await readFile(join(currentDirectory, "show-me.html"), "utf8"))
      expect(exitCode).toBe(0)
      expect(presentation.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ path: "index.ts", coverage: 100 })]))
      expect(captured.standardOutput.join("")).not.toContain("No coverage file found")
      expect(captured.standardError).toEqual([])
    })
  })

  it("resolves an explicit relative coverage path from the invocation directory", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      const projectDirectory = join(currentDirectory, "project", "src")
      const inputDirectory = join(currentDirectory, "inputs")
      await mkdir(projectDirectory, { recursive: true })
      await mkdir(inputDirectory)
      await writeFile(join(projectDirectory, "app.ts"), "export const app = true")
      await writeFile(join(inputDirectory, "coverage.json"), coverageFinal("src/app.ts", 0), "utf8")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli(["project", "--coverage", "inputs/coverage.json"], captured.output, {
        currentDirectory,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      const presentation = parsePresentation(await readFile(join(currentDirectory, "show-me.html"), "utf8"))
      expect(exitCode).toBe(0)
      expect(presentation.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ path: "src/app.ts", coverage: 0 })]))
      expect(captured.standardError).toEqual([])
    })
  })

  it("fails when an explicit coverage file is missing and does not write a report", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      await writeFile(join(currentDirectory, "index.ts"), "export const value = 1")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli(["--coverage", "missing.json"], captured.output, {
        currentDirectory,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      expect(exitCode).toBe(1)
      expect(captured.standardError.join("")).toContain("Could not read coverage file")
      await expect(readFile(join(currentDirectory, "show-me.html"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    })
  })

  it("fails when an explicit coverage path is unreadable and does not write a report", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      await writeFile(join(currentDirectory, "index.ts"), "export const value = 1")
      await mkdir(join(currentDirectory, "coverage-input"))
      const captured = captureOutput()

      // Act
      const exitCode = await runCli(["--coverage", "coverage-input"], captured.output, {
        currentDirectory,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      expect(exitCode).toBe(1)
      expect(captured.standardError.join("")).toContain("Could not read coverage file")
      await expect(readFile(join(currentDirectory, "show-me.html"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    })
  })

  it("fails when an explicit coverage file is invalid and does not write a report", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      await writeFile(join(currentDirectory, "index.ts"), "export const value = 1")
      await writeFile(join(currentDirectory, "invalid.json"), "{", "utf8")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli(["--coverage", "invalid.json"], captured.output, {
        currentDirectory,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      expect(exitCode).toBe(1)
      expect(captured.standardError.join("")).toContain("Could not parse coverage file")
      await expect(readFile(join(currentDirectory, "show-me.html"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    })
  })

  it("fails when automatically discovered coverage is present but invalid", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      await writeFile(join(currentDirectory, "index.ts"), "export const value = 1")
      const coverageDirectory = join(currentDirectory, "coverage")
      await mkdir(coverageDirectory)
      await writeFile(join(coverageDirectory, "coverage-final.json"), "{", "utf8")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli([], captured.output, { currentDirectory, browserBundle: TEST_BROWSER_BUNDLE })

      // Assert
      expect(exitCode).toBe(1)
      expect(captured.standardError.join("")).toContain("Could not parse coverage file")
      await expect(readFile(join(currentDirectory, "show-me.html"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    })
  })
})

function coverageFinal(path: string, hits: number): string {
  return JSON.stringify({
    [path]: {
      path,
      statementMap: {
        0: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 1 },
        },
      },
      s: { 0: hits },
      fnMap: {},
      f: {},
      branchMap: {},
      b: {},
    },
  })
}

function parsePresentation(html: string): { readonly nodes: readonly unknown[]; readonly edges: readonly unknown[] } {
  const serializedPresentation = html.match(/<script>window\.showMePresentation=(.+);<\/script>/u)?.[1]
  if (serializedPresentation === undefined) {
    throw new Error("Generated report did not embed its presentation model.")
  }

  const presentation: unknown = JSON.parse(serializedPresentation)
  if (!TypeGuard.isRecord(presentation) || !TypeGuard.isArray(presentation.nodes) || !TypeGuard.isArray(presentation.edges)) {
    throw new Error("Generated report presentation did not contain node and edge collections.")
  }
  return { nodes: presentation.nodes, edges: presentation.edges }
}

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
