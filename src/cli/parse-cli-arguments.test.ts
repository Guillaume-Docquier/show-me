import { Result } from "@guillaume-docquier/tools-ts"
import { expect, it } from "vitest"
import { parseCliArguments } from "./parse-cli-arguments.js"

it("uses the current directory when the project path is omitted", () => {
  // Act
  const result = parseCliArguments([])

  // Assert
  expect(result).toEqual(
    Result.Success({
      _tag: "GenerateReport",
      projectPath: ".",
      outputPath: undefined,
      coveragePath: undefined,
    }),
  )
})

it("parses the project, output, and coverage paths", () => {
  // Act
  const result = parseCliArguments(["../project", "--output", "report.html", "--coverage", "coverage.json"])

  // Assert
  expect(result).toEqual(
    Result.Success({
      _tag: "GenerateReport",
      projectPath: "../project",
      outputPath: "report.html",
      coveragePath: "coverage.json",
    }),
  )
})

it("rejects unknown options", () => {
  // Act
  const result = parseCliArguments(["--open"])

  // Assert
  expect(result).toEqual(
    Result.Failure({
      _tag: "InvalidCliArguments",
      message: "Unknown option: --open",
    }),
  )
})
