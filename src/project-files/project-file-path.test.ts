import { join, resolve } from "node:path"
import { Result } from "@guillaume-docquier/tools-ts"
import { describe, expect, it } from "vitest"
import { ProjectFilePath } from "./project-file-path.js"

describe("ProjectFilePath", () => {
  it.each([
    ["src\\nested\\index.ts", "src/nested/index.ts"],
    ["./src//nested/../index.ts", "src/index.ts"],
    ["src/index.ts/", "src/index.ts"],
  ])("normalizes %s as %s", (input, expected) => {
    // Act
    const result = ProjectFilePath.parse(input)

    // Assert
    expect(result).toEqual(Result.Success(expected))
  })

  it.each([
    ["", "empty"],
    [".", "project-root"],
    ["./", "project-root"],
    ["src/..", "project-root"],
    ["/repo/src/index.ts", "absolute"],
    ["C:\\repo\\src\\index.ts", "absolute"],
    ["C:src\\index.ts", "absolute"],
    ["\\\\server\\share\\src\\index.ts", "absolute"],
    ["../outside.ts", "outside-project-root"],
    ["src/../../outside.ts", "outside-project-root"],
  ] as const)("rejects %s as %s", (input, reason) => {
    // Act
    const result = ProjectFilePath.parse(input)

    // Assert
    expect(result).toEqual(
      Result.Failure({
        _tag: "InvalidProjectFilePath",
        input,
        reason,
      }),
    )
  })

  it("compares canonical paths by locale-independent ordinal order", () => {
    // Arrange
    const paths = ["é.ts", "a.ts", "B.ts"].map((path) => {
      const result = ProjectFilePath.parse(path)
      if (Result.isFailure(result)) {
        throw new Error(`Invalid test path: ${path}`)
      }
      return result.value
    })

    // Act
    paths.sort((left, right) => ProjectFilePath.compare(left, right))

    // Assert
    expect(paths).toEqual(["B.ts", "a.ts", "é.ts"])
  })

  it("constructs a path from a file below the project root", () => {
    // Arrange
    const projectRoot = resolve("project")
    const projectFile = join(projectRoot, "src", "index.ts")

    // Act
    const result = ProjectFilePath.fromAbsolute(projectRoot, projectFile)

    // Assert
    expect(result).toEqual(Result.Success("src/index.ts"))
  })
})
