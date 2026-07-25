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
      fileSelectionOverride: undefined,
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
      fileSelectionOverride: undefined,
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
      fileSelectionOverride: undefined,
    }),
  )
})

it("replaces the built-in exclusions with repeated patterns", () => {
  // Act
  const result = parseCliArguments(["--exclude", "generated/**", "--exclude", "vendor/*.ts"])

  // Assert
  expect(result).toEqual(
    Result.Success({
      _tag: "GenerateReport",
      projectPath: ".",
      outputPath: undefined,
      coveragePath: undefined,
      fileSelectionOverride: {
        exclusionPatterns: ["generated/**", "vendor/*.ts"],
      },
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
  [["--exclude"], "--exclude requires a pattern."],
  [["--exclude", "--output"], "--exclude requires a pattern."],
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
  [["--exclude", ""], "--exclude requires a non-empty pattern."],
  [["--exclude", "  "], "--exclude requires a non-empty pattern."],
  [["--exclude", "first\nsecond"], 'Invalid --exclude pattern "first\\nsecond": patterns must contain exactly one line.'],
  [["--exclude", "# generated"], 'Invalid --exclude pattern "# generated": comment patterns are not exclusions.'],
  [["--exclude", "!src/keep.ts"], 'Invalid --exclude pattern "!src/keep.ts": negation is not supported.'],
  [["--exclude", "src\\generated\\**"], 'Invalid --exclude pattern "src\\\\generated\\\\**": use forward slashes.'],
  [["--exclude", "C:/project/**"], 'Invalid --exclude pattern "C:/project/**": patterns must be project-relative.'],
  [["--exclude", "src/../outside.ts"], 'Invalid --exclude pattern "src/../outside.ts": dot path segments are not supported.'],
] as const)("rejects an invalid exclusion pattern: %j", (arguments_, message) => {
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
