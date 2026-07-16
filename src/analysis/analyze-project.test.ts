import { Result } from "@guillaume-docquier/tools-ts"
import { expect, it } from "vitest"
import { fixtureProjectPath } from "../testing/fixture-project.js"
import { analyzeProject } from "./analyze-project.js"

it("opens a real fixture through the analysis application seam", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("minimal-javascript")

  // Act
  const result = await analyzeProject(projectRoot)

  // Assert
  expect(result).toEqual(
    Result.Success({
      schemaVersion: 1,
      project: {
        name: "minimal-javascript",
      },
      files: [
        {
          path: "index.js",
          language: "javascript",
          lines: {
            nonBlank: 1,
          },
          coverage: undefined,
        },
      ],
      dependencies: [],
      diagnostics: [],
    }),
  )
})

it("returns a typed failure when the project root is missing", async () => {
  // Arrange
  const missingProjectRoot = `${fixtureProjectPath("minimal-javascript")}-missing`

  // Act
  const result = await analyzeProject(missingProjectRoot)

  // Assert
  expect(Result.isFailure(result)).toBe(true)
  if (Result.isFailure(result)) {
    expect(result.error._tag).toBe("ProjectRootReadFailed")
  }
})
