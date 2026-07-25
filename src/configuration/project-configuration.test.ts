import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Result } from "@guillaume-docquier/tools-ts"
import { expect, it } from "vitest"
import { fixtureProjectPath } from "../testing/fixture-project.js"
import { withTemporaryDirectory } from "../testing/temporary-directory.js"
import { loadProjectConfiguration, PROJECT_CONFIGURATION_FILE_NAME } from "./project-configuration.js"

it("treats an absent root configuration as an absent file-selection value", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("project-configuration-absent")

  // Act
  const result = await loadProjectConfiguration(projectRoot)

  // Assert
  expect(result).toEqual(Result.Success({ fileSelection: undefined }))
})

it("parses comments and trailing commas into the typed file-selection input", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("project-configuration-valid")

  // Act
  const result = await loadProjectConfiguration(projectRoot)

  // Assert
  expect(result).toEqual(
    Result.Success({
      fileSelection: {
        exclusionPatterns: ["*.generated.*"],
      },
    }),
  )
})

it("returns a typed JSONC failure for malformed configuration", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("project-configuration-malformed")

  // Act
  const result = await loadProjectConfiguration(projectRoot)

  // Assert
  expect(Result.isFailure(result)).toBe(true)
  if (Result.isFailure(result)) {
    expect(result.error).toEqual(
      expect.objectContaining({
        _tag: "ProjectConfigurationJsonInvalid",
        configurationFile: join(projectRoot, PROJECT_CONFIGURATION_FILE_NAME),
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: expect.any(String),
            offset: expect.any(Number),
            length: expect.any(Number),
          }),
        ]),
      }),
    )
  }
})

it("returns typed schema issues for configuration values rejected by Zod", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("project-configuration-invalid")

  // Act
  const result = await loadProjectConfiguration(projectRoot)

  // Assert
  expect(Result.isFailure(result)).toBe(true)
  if (Result.isFailure(result)) {
    expect(result.error).toEqual({
      _tag: "ProjectConfigurationSchemaInvalid",
      configurationFile: join(projectRoot, PROJECT_CONFIGURATION_FILE_NAME),
      issues: [
        {
          path: "exclude",
          message: expect.stringContaining("array"),
        },
      ],
    })
  }
})

it("returns a typed file-selection failure for an invalid exclusion pattern", async () => {
  await withTemporaryDirectory(async (projectRoot) => {
    // Arrange
    await writeFile(join(projectRoot, PROJECT_CONFIGURATION_FILE_NAME), '{"exclude":["!keep.ts"]}', "utf8")

    // Act
    const result = await loadProjectConfiguration(projectRoot)

    // Assert
    expect(result).toEqual(
      Result.Failure({
        _tag: "ProjectConfigurationFileSelectionInvalid",
        configurationFile: join(projectRoot, PROJECT_CONFIGURATION_FILE_NAME),
        cause: {
          _tag: "InvalidProjectFileExclusionPattern",
          pattern: "!keep.ts",
          reason: "negated",
        },
      }),
    )
  })
})

it("returns a typed read failure for an unreadable configuration path", async () => {
  await withTemporaryDirectory(async (projectRoot) => {
    // Arrange
    const configurationFile = join(projectRoot, PROJECT_CONFIGURATION_FILE_NAME)
    await mkdir(configurationFile)

    // Act
    const result = await loadProjectConfiguration(projectRoot)

    // Assert
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.error).toEqual(
        expect.objectContaining({
          _tag: "ProjectConfigurationReadFailed",
          configurationFile,
          cause: expect.any(Error),
        }),
      )
    }
  })
})
