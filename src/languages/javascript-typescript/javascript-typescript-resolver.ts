import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { Result, TypeGuard } from "@guillaume-docquier/tools-ts"
import { findNodeAtLocation, parseTree, printParseErrorCode, type ParseError } from "jsonc-parser"
import { ResolverFactory, type NapiResolveOptions } from "oxc-resolver"
import { compareText } from "../../text/compare-text.js"
import { JAVASCRIPT_TYPESCRIPT_EXECUTABLE_EXTENSIONS } from "./javascript-typescript-file-support.js"

/**
 * Language-owned dependency-resolution operations without exposing Oxc values.
 */
export type JavaScriptTypeScriptResolver = {
  readonly resolveRequest: (sourceFile: string, request: string) => Result<JavaScriptTypeScriptResolution, Error>
}

/**
 * Project-aware result for one dependency request.
 */
export type JavaScriptTypeScriptResolution = {
  readonly path: string | undefined
  readonly matchesConfiguredAlias: boolean
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
    const configuredAliasPatternsByConfigPath = new Map<string, readonly string[]>()
    if (rootConfigPath !== undefined) {
      readConfiguredAliasPatterns(rootConfigPath, configuredAliasPatternsByConfigPath)
    }

    const resolverOptions = {
      conditionNames: ["node", "import"],
      extensionAlias: {
        ".js": [".ts", ".tsx", ".js", ".jsx"],
        ".cjs": [".cts", ".cjs"],
        ".mjs": [".mts", ".mjs"],
      },
      extensions: [...JAVASCRIPT_TYPESCRIPT_EXECUTABLE_EXTENSIONS],
      mainFields: ["module", "main"],
    } satisfies NapiResolveOptions
    const resolver = new ResolverFactory({ ...resolverOptions, tsconfig: "auto" })
    const resolverByJavaScriptConfigPath = new Map<string, ResolverFactory>()

    return {
      resolveRequest(sourceFile: string, request: string): Result<JavaScriptTypeScriptResolution, Error> {
        return Result.tryCatch(() => {
          const configPath = nearestProjectConfigPath(projectRoot, sourceFile)
          const resolution =
            configPath?.endsWith("jsconfig.json") === true
              ? resolverForJavaScriptConfig(configPath, resolverOptions, resolverByJavaScriptConfigPath).sync(dirname(sourceFile), request)
              : resolver.resolveFileSync(sourceFile, request)
          const configuredAliasPatterns =
            configPath === undefined ? [] : readConfiguredAliasPatterns(configPath, configuredAliasPatternsByConfigPath)
          return {
            path: resolution.path,
            matchesConfiguredAlias: configuredAliasPatterns.some((pattern) => matchesAliasPattern(request, pattern)),
          }
        })
      },
    }
  })
}

function resolverForJavaScriptConfig(
  configPath: string,
  resolverOptions: NapiResolveOptions,
  resolverByJavaScriptConfigPath: Map<string, ResolverFactory>,
): ResolverFactory {
  const cachedResolver = resolverByJavaScriptConfigPath.get(configPath)
  if (cachedResolver !== undefined) {
    return cachedResolver
  }

  const resolver = new ResolverFactory({
    ...resolverOptions,
    tsconfig: { configFile: configPath, references: "auto" },
  })
  resolverByJavaScriptConfigPath.set(configPath, resolver)
  return resolver
}

function rootProjectConfigPath(projectRoot: string): string | undefined {
  const typeScriptConfig = resolve(projectRoot, "tsconfig.json")
  if (existsSync(typeScriptConfig)) {
    return typeScriptConfig
  }

  const javaScriptConfig = resolve(projectRoot, "jsconfig.json")
  return existsSync(javaScriptConfig) ? javaScriptConfig : undefined
}

function nearestProjectConfigPath(projectRoot: string, sourceFile: string): string | undefined {
  const absoluteProjectRoot = resolve(projectRoot)
  let directory = dirname(resolve(sourceFile))

  while (true) {
    const typeScriptConfig = resolve(directory, "tsconfig.json")
    if (existsSync(typeScriptConfig)) {
      return typeScriptConfig
    }

    const javaScriptConfig = resolve(directory, "jsconfig.json")
    if (existsSync(javaScriptConfig)) {
      return javaScriptConfig
    }

    if (directory === absoluteProjectRoot) {
      return undefined
    }

    const parentDirectory = dirname(directory)
    if (parentDirectory === directory) {
      return undefined
    }
    directory = parentDirectory
  }
}

function readConfiguredAliasPatterns(
  configPath: string,
  configuredAliasPatternsByConfigPath: Map<string, readonly string[]>,
  visitedConfigPaths: ReadonlySet<string> = new Set(),
): readonly string[] {
  const absoluteConfigPath = resolve(configPath)
  const cachedPatterns = configuredAliasPatternsByConfigPath.get(absoluteConfigPath)
  if (cachedPatterns !== undefined) {
    return cachedPatterns
  }
  if (visitedConfigPaths.has(absoluteConfigPath)) {
    return []
  }

  const parseErrors: ParseError[] = []
  const config = parseTree(readFileSync(absoluteConfigPath, "utf8"), parseErrors, { allowTrailingComma: true })
  const firstParseError = parseErrors[0]
  if (firstParseError !== undefined) {
    throw new Error(`Could not parse ${absoluteConfigPath}: ${printParseErrorCode(firstParseError.error)}.`)
  }

  if (config === undefined) {
    return []
  }

  const visitedPaths = new Set(visitedConfigPaths).add(absoluteConfigPath)
  const paths = findNodeAtLocation(config, ["compilerOptions", "paths"])
  const patterns: string[] = []
  if (paths?.type === "object") {
    for (const property of paths.children ?? []) {
      const key = property.children?.[0]
      if (key?.type === "string" && TypeGuard.isString(key.value)) {
        patterns.push(key.value)
      }
    }
  }

  for (const relatedConfigPath of relatedProjectConfigPaths(absoluteConfigPath, config)) {
    patterns.push(...readConfiguredAliasPatterns(relatedConfigPath, configuredAliasPatternsByConfigPath, visitedPaths))
  }

  const configuredAliasPatterns = [...new Set(patterns)].sort(compareText)
  configuredAliasPatternsByConfigPath.set(absoluteConfigPath, configuredAliasPatterns)
  return configuredAliasPatterns
}

function relatedProjectConfigPaths(configPath: string, config: NonNullable<ReturnType<typeof parseTree>>): readonly string[] {
  const configuredPaths: string[] = []
  const extendsNode = findNodeAtLocation(config, ["extends"])
  if (extendsNode?.type === "string" && TypeGuard.isString(extendsNode.value)) {
    configuredPaths.push(extendsNode.value)
  } else if (extendsNode?.type === "array") {
    for (const child of extendsNode.children ?? []) {
      if (child.type === "string" && TypeGuard.isString(child.value)) {
        configuredPaths.push(child.value)
      }
    }
  }

  const references = findNodeAtLocation(config, ["references"])
  if (references?.type === "array") {
    for (const reference of references.children ?? []) {
      const path = findNodeAtLocation(reference, ["path"])
      if (path?.type === "string" && TypeGuard.isString(path.value)) {
        configuredPaths.push(path.value)
      }
    }
  }

  return configuredPaths
    .filter((configuredPath) => configuredPath.startsWith(".") || isAbsolute(configuredPath))
    .map((configuredPath) => resolveProjectConfigPath(dirname(configPath), configuredPath))
    .filter((relatedConfigPath): relatedConfigPath is string => relatedConfigPath !== undefined)
}

function resolveProjectConfigPath(configDirectory: string, configuredPath: string): string | undefined {
  const absoluteConfiguredPath = resolve(configDirectory, configuredPath)
  const candidates = absoluteConfiguredPath.endsWith(".json")
    ? [absoluteConfiguredPath]
    : [`${absoluteConfiguredPath}.json`, resolve(absoluteConfiguredPath, "tsconfig.json")]
  return candidates.find((candidate) => existsSync(candidate))
}

function matchesAliasPattern(request: string, pattern: string): boolean {
  const wildcardIndex = pattern.indexOf("*")
  if (wildcardIndex === -1) {
    return request === pattern
  }

  return request.startsWith(pattern.slice(0, wildcardIndex)) && request.endsWith(pattern.slice(wildcardIndex + 1))
}
