import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { Result, isNodeJSError } from "@guillaume-docquier/tools-ts"
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser"
import { z } from "zod"
import {
  ProjectFileSelection,
  type InvalidProjectFileExclusionPattern,
  type ProjectFileSelection as ProjectFileSelectionInput,
} from "../project-files/project-file-selection.js"

/**
 * The only automatically discovered Show Me project-configuration filename.
 */
export const PROJECT_CONFIGURATION_FILE_NAME = "show-me.config.json"

/**
 * Persisted project configuration parsed into application inputs.
 */
export type ProjectConfiguration = {
  readonly fileSelection: ProjectFileSelectionInput | undefined
}

/**
 * One malformed JSONC token reported at the project-configuration boundary.
 */
export type ProjectConfigurationJsonIssue = {
  readonly code: string
  readonly offset: number
  readonly length: number
}

/**
 * One value rejected by the project-configuration schema.
 */
export type ProjectConfigurationSchemaIssue = {
  readonly path: string
  readonly message: string
}

/**
 * An expected failure while loading persisted project configuration.
 */
export type ProjectConfigurationError =
  | {
      readonly _tag: "ProjectConfigurationReadFailed"
      readonly configurationFile: string
      readonly cause: Error
    }
  | {
      readonly _tag: "ProjectConfigurationJsonInvalid"
      readonly configurationFile: string
      readonly issues: readonly ProjectConfigurationJsonIssue[]
    }
  | {
      readonly _tag: "ProjectConfigurationSchemaInvalid"
      readonly configurationFile: string
      readonly issues: readonly ProjectConfigurationSchemaIssue[]
    }
  | {
      readonly _tag: "ProjectConfigurationFileSelectionInvalid"
      readonly configurationFile: string
      readonly cause: InvalidProjectFileExclusionPattern
    }

const projectConfigurationSchema = z.strictObject({
  exclude: z.array(z.string()).optional(),
})

/**
 * Load the optional configuration file from one analyzed project root.
 *
 * Missing configuration is represented as an absent file-selection value so
 * the command boundary can apply built-in defaults after CLI precedence.
 *
 * @param projectRoot - Directory selected for analysis.
 * @returns Parsed application configuration, or a typed read or parse failure.
 */
export async function loadProjectConfiguration(projectRoot: string): Promise<Result<ProjectConfiguration, ProjectConfigurationError>> {
  const configurationFile = join(resolve(projectRoot), PROJECT_CONFIGURATION_FILE_NAME)
  const contents = await Result.tryCatch(readFile(configurationFile, "utf8"))

  if (Result.isFailure(contents)) {
    if (isMissingConfigurationFile(contents.error)) {
      return Result.Success({ fileSelection: undefined })
    }

    return Result.Failure({
      _tag: "ProjectConfigurationReadFailed",
      configurationFile,
      cause: contents.error,
    })
  }

  const parseErrors: ParseError[] = []
  const untrustedConfiguration: unknown = parse(contents.value, parseErrors, {
    allowTrailingComma: true,
  })

  if (parseErrors.length > 0) {
    return Result.Failure({
      _tag: "ProjectConfigurationJsonInvalid",
      configurationFile,
      issues: parseErrors.map(({ error, offset, length }) => ({
        code: printParseErrorCode(error),
        offset,
        length,
      })),
    })
  }

  const parsedConfiguration = projectConfigurationSchema.safeParse(untrustedConfiguration)
  if (!parsedConfiguration.success) {
    return Result.Failure({
      _tag: "ProjectConfigurationSchemaInvalid",
      configurationFile,
      issues: parsedConfiguration.error.issues.map((issue) => ({
        path: issue.path.length === 0 ? "<root>" : issue.path.map(String).join("."),
        message: issue.message,
      })),
    })
  }

  if (parsedConfiguration.data.exclude === undefined) {
    return Result.Success({ fileSelection: undefined })
  }

  const fileSelection = ProjectFileSelection.parse(parsedConfiguration.data.exclude)
  if (Result.isFailure(fileSelection)) {
    return Result.Failure({
      _tag: "ProjectConfigurationFileSelectionInvalid",
      configurationFile,
      cause: fileSelection.error,
    })
  }

  return Result.Success({ fileSelection: fileSelection.value })
}

function isMissingConfigurationFile(error: Error): boolean {
  return isNodeJSError(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")
}
