import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { TypeGuard } from "@guillaume-docquier/tools-ts"
import { describe, expect, it } from "vitest"
import { PROJECT_CONFIGURATION_FILE_NAME } from "../configuration/project-configuration.js"
import { fixtureProjectPath, type FixtureProjectName } from "../testing/fixture-project.js"
import { withTemporaryDirectory } from "../testing/temporary-directory.js"
import { type CliOutput, runCli } from "./run-cli.js"

const TEST_BROWSER_BUNDLE = "document.documentElement.dataset.testBundle='ready'"

type CapturedOutput = {
  readonly output: CliOutput
  readonly standardOutput: string[]
  readonly standardError: string[]
}

type EmbeddedAnalysis = {
  readonly files: readonly unknown[]
  readonly dependencies: readonly unknown[]
  readonly externalPackages: readonly unknown[]
  readonly externalPackageDependencies: readonly unknown[]
}

describe("project configuration through the CLI", () => {
  it("keeps built-in exclusions when project configuration is absent", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      const projectRoot = fixtureProjectPath("project-configuration-absent")
      const outputPath = join(currentDirectory, "report.html")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli([projectRoot, "--output", outputPath], captured.output, {
        currentDirectory,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      const analysis = parseAnalysis(await readFile(outputPath, "utf8"))
      expect(exitCode).toBe(0)
      expect(projectFilePaths(analysis)).toEqual(["index.ts"])
      expect(captured.standardError).toEqual([])
    })
  })

  it("falls back to built-in exclusions when the configured value is absent", async () => {
    await withTemporaryDirectory(async (projectRoot) => {
      // Arrange
      await writeFile(join(projectRoot, PROJECT_CONFIGURATION_FILE_NAME), "{}", "utf8")
      await writeFile(join(projectRoot, "app.ts"), "export const app = true", "utf8")
      await writeFile(join(projectRoot, "app.test.ts"), "export const test = true", "utf8")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli([], captured.output, {
        currentDirectory: projectRoot,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      const analysis = parseAnalysis(await readFile(join(projectRoot, "show-me.html"), "utf8"))
      expect(exitCode).toBe(0)
      expect(projectFilePaths(analysis)).toEqual(["app.ts"])
      expect(captured.standardError).toEqual([])
    })
  })

  it("discovers only the analyzed-root configuration and anchors patterns at that root", async () => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      const projectRoot = join(currentDirectory, "project")
      await mkdir(join(projectRoot, "nested"), { recursive: true })
      await writeFile(join(currentDirectory, PROJECT_CONFIGURATION_FILE_NAME), '{"exclude":["*.ts"]}', "utf8")
      await writeFile(join(projectRoot, PROJECT_CONFIGURATION_FILE_NAME), '{"exclude":["/root.ts"]}', "utf8")
      await writeFile(join(projectRoot, "root.ts"), "export const root = true", "utf8")
      await writeFile(join(projectRoot, "nested", "root.ts"), "export const nested = true", "utf8")
      await writeFile(join(projectRoot, "app.test.ts"), "export const test = true", "utf8")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli(["project"], captured.output, {
        currentDirectory,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      const analysis = parseAnalysis(await readFile(join(currentDirectory, "show-me.html"), "utf8"))
      expect(exitCode).toBe(0)
      expect(projectFilePaths(analysis)).toEqual(["app.test.ts", "nested/root.ts"])
      expect(captured.standardError).toEqual([])
    })
  })

  it("treats an explicitly empty configured array as a full replacement without weakening permanent exclusions", async () => {
    await withTemporaryDirectory(async (projectRoot) => {
      // Arrange
      await mkdir(join(projectRoot, "node_modules"))
      await writeFile(join(projectRoot, PROJECT_CONFIGURATION_FILE_NAME), '{"exclude":[]}', "utf8")
      await writeFile(join(projectRoot, ".gitignore"), "ignored.ts\n", "utf8")
      await writeFile(join(projectRoot, "app.ts"), "export const app = true", "utf8")
      await writeFile(join(projectRoot, "app.test.ts"), "export const test = true", "utf8")
      await writeFile(join(projectRoot, "ignored.ts"), "export const ignored = true", "utf8")
      await writeFile(join(projectRoot, "node_modules", "dependency.ts"), "export const dependency = true", "utf8")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli([], captured.output, {
        currentDirectory: projectRoot,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      const analysis = parseAnalysis(await readFile(join(projectRoot, "show-me.html"), "utf8"))
      expect(exitCode).toBe(0)
      expect(projectFilePaths(analysis)).toEqual(["app.test.ts", "app.ts"])
      expect(captured.standardError).toEqual([])
    })
  })

  it("uses a defined CLI value instead of the configured value without combining them", async () => {
    await withTemporaryDirectory(async (projectRoot) => {
      // Arrange
      await writeFile(join(projectRoot, PROJECT_CONFIGURATION_FILE_NAME), '{"exclude":["*.generated.*"]}', "utf8")
      await writeFile(join(projectRoot, "app.ts"), "export const app = true", "utf8")
      await writeFile(join(projectRoot, "app.test.ts"), "export const test = true", "utf8")
      await writeFile(join(projectRoot, "output.generated.ts"), "export const generated = true", "utf8")
      const captured = captureOutput()

      // Act
      const exitCode = await runCli(["--exclude", "*.test.*"], captured.output, {
        currentDirectory: projectRoot,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      const analysis = parseAnalysis(await readFile(join(projectRoot, "show-me.html"), "utf8"))
      expect(exitCode).toBe(0)
      expect(projectFilePaths(analysis)).toEqual(["app.ts", "output.generated.ts"])
      expect(captured.standardError).toEqual([])
    })
  })

  it("produces identical analysis for equivalent configured and CLI selection", async () => {
    await withTemporaryDirectory(async (projectRoot) => {
      // Arrange
      const configuredReport = join(projectRoot, "configured.html")
      const cliReport = join(projectRoot, "cli.html")
      await writeFile(join(projectRoot, PROJECT_CONFIGURATION_FILE_NAME), '{"exclude":["*.generated.*"]}', "utf8")
      await writeFile(join(projectRoot, "app.ts"), "export const app = true", "utf8")
      await writeFile(join(projectRoot, "app.test.ts"), "export const test = true", "utf8")
      await writeFile(join(projectRoot, "output.generated.ts"), "export const generated = true", "utf8")
      const configuredOutput = captureOutput()
      const cliOutput = captureOutput()

      // Act
      const configuredExitCode = await runCli(["--output", configuredReport], configuredOutput.output, {
        currentDirectory: projectRoot,
        browserBundle: TEST_BROWSER_BUNDLE,
      })
      const cliExitCode = await runCli(["--exclude", "*.generated.*", "--output", cliReport], cliOutput.output, {
        currentDirectory: projectRoot,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      const configuredAnalysis = parseAnalysis(await readFile(configuredReport, "utf8"))
      const cliAnalysis = parseAnalysis(await readFile(cliReport, "utf8"))
      expect(configuredExitCode).toBe(0)
      expect(cliExitCode).toBe(0)
      expect(configuredAnalysis).toEqual(cliAnalysis)
      expect(configuredOutput.standardError).toEqual([])
      expect(cliOutput.standardError).toEqual([])
    })
  })

  it("applies persisted selection consistently to report files, metrics, coverage, and relationships", async () => {
    await withTemporaryDirectory(async (projectRoot) => {
      // Arrange
      const sourceDirectory = join(projectRoot, "src")
      const coverageDirectory = join(projectRoot, "coverage")
      await mkdir(sourceDirectory)
      await mkdir(coverageDirectory)
      await writeFile(join(projectRoot, PROJECT_CONFIGURATION_FILE_NAME), '{"exclude":["src/helper.ts"]}', "utf8")
      await writeFile(join(sourceDirectory, "app.ts"), 'import "./helper.js"\nexport const app = true\n', "utf8")
      await writeFile(join(sourceDirectory, "helper.ts"), "export const helper = true\n", "utf8")
      await writeFile(join(sourceDirectory, "app.test.ts"), 'import "./app.js"\nexport const tested = true\n', "utf8")
      await writeFile(
        join(coverageDirectory, "coverage-final.json"),
        JSON.stringify({
          [join(projectRoot, "src", "app.ts")]: istanbulFileCoverage(join(projectRoot, "src", "app.ts"), 1),
          [join(projectRoot, "src", "helper.ts")]: istanbulFileCoverage(join(projectRoot, "src", "helper.ts"), 0),
          [join(projectRoot, "src", "app.test.ts")]: istanbulFileCoverage(join(projectRoot, "src", "app.test.ts"), 1),
        }),
        "utf8",
      )
      const captured = captureOutput()

      // Act
      const exitCode = await runCli([], captured.output, {
        currentDirectory: projectRoot,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      const analysis = parseAnalysis(await readFile(join(projectRoot, "show-me.html"), "utf8"))
      expect(exitCode).toBe(0)
      expect(analysis.files).toEqual([
        {
          path: "src/app.test.ts",
          language: "typescript",
          lines: { code: 2, comment: 0, blank: 0 },
          coverage: { lines: 100 },
        },
        {
          path: "src/app.ts",
          language: "typescript",
          lines: { code: 2, comment: 0, blank: 0 },
          coverage: { lines: 100 },
        },
      ])
      expect(analysis.dependencies).toEqual([{ source: "src/app.test.ts", target: "src/app.ts", kind: "runtime" }])
      expect(captured.standardError).toEqual([])
    })
  })

  it.each([
    ["project-configuration-malformed", "Could not parse project configuration"],
    ["project-configuration-invalid", "Invalid project configuration"],
  ] as const)("reports useful configuration errors for %s", async (fixtureName, expectedMessage) => {
    await withTemporaryDirectory(async (currentDirectory) => {
      // Arrange
      const projectRoot = fixtureProjectPath(fixtureName satisfies FixtureProjectName)
      const captured = captureOutput()

      // Act
      const exitCode = await runCli([projectRoot], captured.output, {
        currentDirectory,
        browserBundle: TEST_BROWSER_BUNDLE,
      })

      // Assert
      expect(exitCode).toBe(1)
      expect(captured.standardOutput).toEqual([])
      expect(captured.standardError.join("")).toContain(expectedMessage)
      expect(captured.standardError.join("")).toContain(join(projectRoot, PROJECT_CONFIGURATION_FILE_NAME))
    })
  })
})

function istanbulFileCoverage(path: string, hits: number): object {
  return {
    path,
    statementMap: {
      "0": {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 1 },
      },
    },
    s: { "0": hits },
    fnMap: {},
    f: {},
    branchMap: {},
    b: {},
  }
}

function projectFilePaths(analysis: EmbeddedAnalysis): readonly unknown[] {
  return analysis.files.map((file) => (TypeGuard.isRecord(file) ? file.path : undefined))
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
