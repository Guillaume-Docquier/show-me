import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { Result, TypeGuard } from "@guillaume-docquier/tools-ts"
import { findNodeAtLocation, parseTree, printParseErrorCode, type ParseError } from "jsonc-parser"
import { ResolverFactory } from "oxc-resolver"
import { compareText } from "../../text/compare-text.js"
import { JAVASCRIPT_TYPESCRIPT_EXECUTABLE_EXTENSIONS } from "./javascript-typescript-file-support.js"

/**
 * Language-owned dependency-resolution operations without exposing Oxc values.
 */
export type JavaScriptTypeScriptResolver = {
  readonly resolveRequest: (importerFile: string, request: string) => Result<string | undefined, Error>
  readonly matchesConfiguredAlias: (request: string) => boolean
}

/**
 * Create dependency resolution for one JavaScript or TypeScript project.
 *
 * @param projectRoot - Absolute analyzed project root.
 * @returns A resolver adapter, or the initialization error thrown by configuration or Oxc.
 */
export function createJavaScriptTypeScriptResolver(projectRoot: string): Result<JavaScriptTypeScriptResolver, Error> {
  return Result.tryCatch(() => {
    const rootConfigPath = rootProjectConfigPath(projectRoot)
    const resolver = new ResolverFactory({
      conditionNames: ["node", "import"],
      extensionAlias: {
        ".js": [".ts", ".tsx", ".js", ".jsx"],
        ".cjs": [".cts", ".cjs"],
        ".mjs": [".mts", ".mjs"],
      },
      extensions: [...JAVASCRIPT_TYPESCRIPT_EXECUTABLE_EXTENSIONS],
      mainFields: ["module", "main"],
      ...(rootConfigPath === undefined ? {} : { tsconfig: { configFile: rootConfigPath } }),
    })
    const configuredAliasPatterns = rootConfigPath === undefined ? [] : readConfiguredAliasPatterns(rootConfigPath)

    return {
      resolveRequest(importerFile: string, request: string): Result<string | undefined, Error> {
        const resolution = Result.tryCatch(() => resolver.sync(dirname(importerFile), request))
        if (Result.isFailure(resolution)) {
          return resolution
        }
        return Result.Success(resolution.value.path)
      },
      matchesConfiguredAlias(request: string): boolean {
        return configuredAliasPatterns.some((pattern) => matchesAliasPattern(request, pattern))
      },
    }
  })
}

function rootProjectConfigPath(projectRoot: string): string | undefined {
  const typeScriptConfig = resolve(projectRoot, "tsconfig.json")
  if (existsSync(typeScriptConfig)) {
    return typeScriptConfig
  }

  const javaScriptConfig = resolve(projectRoot, "jsconfig.json")
  return existsSync(javaScriptConfig) ? javaScriptConfig : undefined
}

function readConfiguredAliasPatterns(configPath: string): readonly string[] {
  const parseErrors: ParseError[] = []
  const config = parseTree(readFileSync(configPath, "utf8"), parseErrors, { allowTrailingComma: true })
  const firstParseError = parseErrors[0]
  if (firstParseError !== undefined) {
    throw new Error(`Could not parse ${configPath}: ${printParseErrorCode(firstParseError.error)}.`)
  }

  if (config === undefined) {
    return []
  }

  const paths = findNodeAtLocation(config, ["compilerOptions", "paths"])
  if (paths?.type !== "object") {
    return []
  }

  const patterns: string[] = []
  for (const property of paths.children ?? []) {
    const key = property.children?.[0]
    if (key?.type === "string" && TypeGuard.isString(key.value)) {
      patterns.push(key.value)
    }
  }
  return patterns.sort(compareText)
}

function matchesAliasPattern(request: string, pattern: string): boolean {
  const wildcardIndex = pattern.indexOf("*")
  if (wildcardIndex === -1) {
    return request === pattern
  }

  return request.startsWith(pattern.slice(0, wildcardIndex)) && request.endsWith(pattern.slice(wildcardIndex + 1))
}
