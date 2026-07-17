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

it("accepts options before the project path", () => {
  // Act
  const result = parseCliArguments(["--output", "report.html", "--coverage", "coverage.json", "../project"])

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

it.each([
  ["--help", "Help"],
  ["-h", "Help"],
  ["--version", "Version"],
  ["-v", "Version"],
] as const)("parses %s as the %s command", (argument, commandTag) => {
  // Act
  const result = parseCliArguments([argument])

  // Assert
  expect(result).toEqual(Result.Success({ _tag: commandTag }))
})

it.each([
  [["--output"], "--output requires a path."],
  [["--output", "--coverage"], "--output requires a path."],
  [["--coverage"], "--coverage requires a path."],
  [["--coverage", "--output"], "--coverage requires a path."],
] as const)("rejects an option without a path: %j", (arguments_, message) => {
  // Act
  const result = parseCliArguments(arguments_)

  // Assert
  expect(result).toEqual(
    Result.Failure({
      _tag: "InvalidCliArguments",
      message,
    }),
  )
})

it.each([
  [["--output", "first.html", "--output", "second.html"], "--output may only be specified once."],
  [["--coverage", "first.json", "--coverage", "second.json"], "--coverage may only be specified once."],
] as const)("rejects a duplicate option: %j", (arguments_, message) => {
  // Act
  const result = parseCliArguments(arguments_)

  // Assert
  expect(result).toEqual(
    Result.Failure({
      _tag: "InvalidCliArguments",
      message,
    }),
  )
})

it("rejects a second project path", () => {
  // Act
  const result = parseCliArguments(["first-project", "second-project"])

  // Assert
  expect(result).toEqual(
    Result.Failure({
      _tag: "InvalidCliArguments",
      message: "Only one project path may be specified.",
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
