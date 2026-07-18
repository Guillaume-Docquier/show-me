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
  --coverage <path>  Read one explicit Istanbul or LCOV report
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

  it("writes raw directed dependencies into the report", async () => {
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
      const analysis = parseAnalysis(html)

      expect(exitCode).toBe(0)
      expect(analysis.dependencies).toHaveLength(13)
      expect(analysis.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "src/main.ts",
          }),
          expect.objectContaining({
            path: "src/runtime.ts",
          }),
        ]),
      )
      expect(analysis.dependencies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "src/main.ts",
            target: "src/runtime.ts",
          }),
        ]),
      )
      expect(analysis.externalPackages).toEqual([{ name: "external-package" }])
      expect(analysis.externalPackageDependencies).toEqual([{ source: "src/main.ts", target: "external-package", kind: "runtime" }])
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
      const analysis = parseAnalysis(await readFile(join(currentDirectory, "show-me.html"), "utf8"))
      expect(exitCode).toBe(0)
      expect(analysis.files).toEqual(expect.arrayContaining([expect.objectContaining({ path: "index.ts", coverage: { lines: 100 } })]))
      expect(captured.standardOutput.join("")).not.toContain("No coverage file found")
      expect(captured.standardError).toEqual([])
    })
  })

  it("automatically imports LCOV when coverage-final.json is absent", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      await writeFile(join(currentDirectory, "index.ts"), "export const value = 1")
      const coverageDirectory = join(currentDirectory, "coverage")
      await mkdir(coverageDirectory)
      await writeFile(join(coverageDirectory, "lcov.info"), lcov("index.ts", 1), "utf8")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli([], captured.output, { currentDirectory, browserBundle: TEST_BROWSER_BUNDLE })

      // Assert
      const analysis = parseAnalysis(await readFile(join(currentDirectory, "show-me.html"), "utf8"))
      expect(exitCode).toBe(0)
      expect(analysis.files).toEqual(expect.arrayContaining([expect.objectContaining({ path: "index.ts", coverage: { lines: 100 } })]))
      expect(captured.standardOutput.join("")).not.toContain("No coverage file found")
      expect(captured.standardError).toEqual([])
    })
  })

  it("automatically combines coverage from the project root and package roots", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      const backendRoot = join(currentDirectory, "backend")
      const frontendRoot = join(currentDirectory, "frontend")
      await mkdir(join(currentDirectory, "coverage"))
      await mkdir(join(backendRoot, "src"), { recursive: true })
      await mkdir(join(backendRoot, "coverage"))
      await mkdir(join(frontendRoot, "src"), { recursive: true })
      await mkdir(join(frontendRoot, "coverage"))
      await writeFile(join(currentDirectory, "index.ts"), "export const root = true")
      await writeFile(join(backendRoot, "package.json"), '{"name":"backend"}', "utf8")
      await writeFile(join(backendRoot, "src", "api.ts"), "export const api = true")
      await writeFile(join(frontendRoot, "package.json"), '{"name":"frontend"}', "utf8")
      await writeFile(join(frontendRoot, "src", "app.ts"), "export const app = true")
      await writeFile(join(currentDirectory, "coverage", "coverage-final.json"), coverageFinal("index.ts", 1), "utf8")
      await writeFile(join(backendRoot, "coverage", "lcov.info"), lcov("src/api.ts", 0), "utf8")
      await writeFile(join(frontendRoot, "coverage", "coverage-final.json"), coverageFinal("src/app.ts", 1), "utf8")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli([], captured.output, { currentDirectory, browserBundle: TEST_BROWSER_BUNDLE })

      // Assert
      const analysis = parseAnalysis(await readFile(join(currentDirectory, "show-me.html"), "utf8"))
      expect(exitCode).toBe(0)
      expect(analysis.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "index.ts", coverage: { lines: 100 } }),
          expect.objectContaining({ path: "backend/src/api.ts", coverage: { lines: 0 } }),
          expect.objectContaining({ path: "frontend/src/app.ts", coverage: { lines: 100 } }),
        ]),
      )
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
      const analysis = parseAnalysis(await readFile(join(currentDirectory, "show-me.html"), "utf8"))
      expect(exitCode).toBe(0)
      expect(analysis.files).toEqual(expect.arrayContaining([expect.objectContaining({ path: "src/app.ts", coverage: { lines: 0 } })]))
      expect(captured.standardError).toEqual([])
    })
  })

  it("recognizes explicit LCOV by content regardless of file extension", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      const projectDirectory = join(currentDirectory, "project", "src")
      await mkdir(projectDirectory, { recursive: true })
      await writeFile(join(projectDirectory, "app.ts"), "export const app = true")
      await writeFile(join(currentDirectory, "coverage.json"), lcov("src/app.ts", 1), "utf8")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli(["project", "--coverage", "coverage.json"], captured.output, {
        currentDirectory,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      const analysis = parseAnalysis(await readFile(join(currentDirectory, "show-me.html"), "utf8"))
      expect(exitCode).toBe(0)
      expect(analysis.files).toEqual(expect.arrayContaining([expect.objectContaining({ path: "src/app.ts", coverage: { lines: 100 } })]))
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
      expect(captured.standardError.join("")).toContain("Could not parse Istanbul coverage file")
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
      expect(captured.standardError.join("")).toContain("Could not parse Istanbul coverage file")
      await expect(readFile(join(currentDirectory, "show-me.html"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    })
  })

  it("fails with an unsupported-format error for an unrecognized explicit file", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      await writeFile(join(currentDirectory, "index.ts"), "export const value = 1")
      await writeFile(join(currentDirectory, "coverage.txt"), "not coverage", "utf8")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli(["--coverage", "coverage.txt"], captured.output, {
        currentDirectory,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      expect(exitCode).toBe(1)
      expect(captured.standardError.join("")).toContain("Unsupported coverage format")
      await expect(readFile(join(currentDirectory, "show-me.html"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    })
  })

  it("reports malformed selected LCOV without trying Istanbul", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      await writeFile(join(currentDirectory, "index.ts"), "export const value = 1")
      await writeFile(join(currentDirectory, "coverage.info"), "SF:index.ts\nDA:1,1", "utf8")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli(["--coverage", "coverage.info"], captured.output, {
        currentDirectory,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      expect(exitCode).toBe(1)
      expect(captured.standardError.join("")).toContain("Could not parse LCOV coverage file")
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

function lcov(path: string, hits: number): string {
  return `TN:\nSF:${path}\nDA:1,${hits}\nend_of_record\n`
}

type EmbeddedAnalysis = {
  readonly files: readonly unknown[]
  readonly dependencies: readonly unknown[]
  readonly externalPackages: readonly unknown[]
  readonly externalPackageDependencies: readonly unknown[]
}

function parseAnalysis(html: string): EmbeddedAnalysis {
  const serializedAnalysis = html.match(/<script>window\.showMeAnalysis=(.+);<\/script>/u)?.[1]
  if (serializedAnalysis === undefined) {
    throw new Error("Generated report did not embed its project analysis.")
  }

  const analysis: unknown = JSON.parse(serializedAnalysis)
  if (
    !TypeGuard.isRecord(analysis) ||
    !TypeGuard.isArray(analysis.files) ||
    !TypeGuard.isArray(analysis.dependencies) ||
    !TypeGuard.isArray(analysis.externalPackages) ||
    !TypeGuard.isArray(analysis.externalPackageDependencies)
  ) {
    throw new Error("Generated report analysis did not contain the expected collections.")
  }
  return {
    files: analysis.files,
    dependencies: analysis.dependencies,
    externalPackages: analysis.externalPackages,
    externalPackageDependencies: analysis.externalPackageDependencies,
  }
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
