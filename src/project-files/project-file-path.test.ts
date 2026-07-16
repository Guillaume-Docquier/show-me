import { join, resolve } from "node:path"
import { Result } from "@guillaume-docquier/tools-ts"
import { describe, expect, it } from "vitest"
import { ProjectFilePath } from "./project-file-path.js"

describe("ProjectFilePath", () => {
  it("normalizes platform separators", () => {
    // Act
    const result = ProjectFilePath.parse("src\\nested\\index.ts")

    // Assert
    expect(result).toEqual(Result.Success("src/nested/index.ts"))
  })

  it("rejects paths outside the project root", () => {
    // Act
    const result = ProjectFilePath.parse("../outside.ts")

    // Assert
    expect(result).toEqual(
      Result.Failure({
        _tag: "InvalidProjectFilePath",
        input: "../outside.ts",
        reason: "outside-project-root",
      }),
    )
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
