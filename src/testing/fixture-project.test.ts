import { basename } from "node:path"
import { describe, expect, it } from "vitest"
import { fixtureProjectPath } from "./fixture-project.js"
import { withTemporaryDirectory } from "./temporary-directory.js"

describe.sequential("fixtureProjectPath", () => {
  it("does not depend on the process working directory", async () => {
    // Arrange
    const originalWorkingDirectory = process.cwd()

    await withTemporaryDirectory(async (temporaryDirectory) => {
      try {
        process.chdir(temporaryDirectory)

        // Act
        const fixturePath = fixtureProjectPath("minimal-typescript")

        // Assert
        expect(basename(fixturePath)).toBe("minimal-typescript")
      } finally {
        process.chdir(originalWorkingDirectory)
      }
    })
  })
})
