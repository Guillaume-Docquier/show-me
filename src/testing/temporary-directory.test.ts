import { access } from "node:fs/promises"
import { expect, it } from "vitest"
import { withTemporaryDirectory } from "./temporary-directory.js"

it("removes the temporary directory after test work completes", async () => {
  // Arrange
  let temporaryDirectory = ""

  // Act
  await withTemporaryDirectory(async (directory) => {
    temporaryDirectory = directory
    await expect(access(directory)).resolves.toBeUndefined()
  })

  // Assert
  await expect(access(temporaryDirectory)).rejects.toThrow()
})
