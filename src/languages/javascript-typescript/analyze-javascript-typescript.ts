import { existsSync, readFileSync } from "node:fs"
import { dirname, extname, resolve } from "node:path"
import { Result, TypeGuard } from "@guillaume-docquier/tools-ts"
import { findNodeAtLocation, parseTree, printParseErrorCode, type ParseError } from "jsonc-parser"
import { parseSync } from "oxc-parser"
import { ResolverFactory } from "oxc-resolver"
import type { AnalysisDiagnostic, ProjectDependency } from "../../analysis/project-analysis.js"
import type { ProjectFilePath } from "../../project-files/project-file-path.js"

const EXECUTABLE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"])

/**
 * Source input understood by the internal JavaScript and TypeScript language module.
 */
export type JavaScriptTypeScriptSourceFile = {
  readonly path: ProjectFilePath
  readonly absolutePath: string
  readonly sourceText: string
}

/**
 * Language-neutral dependency data produced by JavaScript and TypeScript analysis.
 */
export type JavaScriptTypeScriptAnalysis = {
  readonly dependencies: readonly ProjectDependency[]
  readonly diagnostics: readonly AnalysisDiagnostic[]
}

/**
 * A classified failure at an Oxc adapter boundary.
 */
export type JavaScriptTypeScriptAnalysisError =
  | {
      readonly _tag: "JavaScriptTypeScriptParserFailed"
      readonly file: ProjectFilePath
      readonly cause: Error
    }
  | {
      readonly _tag: "JavaScriptTypeScriptResolverInitializationFailed"
      readonly projectRoot: string
      readonly cause: Error
    }
  | {
      readonly _tag: "JavaScriptTypeScriptResolverFailed"
      readonly file: ProjectFilePath
      readonly request: string
      readonly cause: Error
    }

/**
 * Analyze static runtime ESM relationships without exposing parser or resolver values.
 *
 * @param projectRoot - Root of the project being analyzed.
 * @param files - Discovered JavaScript and TypeScript source files.
 * @returns Unique directed dependencies and non-fatal diagnostics, or a classified adapter failure.
 */
export function analyzeJavaScriptTypeScript(
  projectRoot: string,
  files: readonly JavaScriptTypeScriptSourceFile[],
): Result<JavaScriptTypeScriptAnalysis, JavaScriptTypeScriptAnalysisError> {
  const resolverResult = Result.tryCatch(() => createResolverContext(projectRoot))
  if (Result.isFailure(resolverResult)) {
    return Result.Failure({
      _tag: "JavaScriptTypeScriptResolverInitializationFailed",
      projectRoot,
      cause: resolverResult.error,
    })
  }

  const discoveredPathByAbsolutePath = new Map(files.map((file) => [resolve(file.absolutePath), file.path]))
  const dependencyByKey = new Map<string, ProjectDependency>()
  const diagnostics: AnalysisDiagnostic[] = []

  for (const file of files) {
    const parsed = Result.tryCatch(() => parseSync(file.absolutePath, file.sourceText, { sourceType: "unambiguous" }))
    if (Result.isFailure(parsed)) {
      return Result.Failure({
        _tag: "JavaScriptTypeScriptParserFailed",
        file: file.path,
        cause: parsed.error,
      })
    }

    for (const error of parsed.value.errors) {
      diagnostics.push({
        code: "JAVASCRIPT_TYPESCRIPT_PARSE_ERROR",
        message: error.message,
        file: file.path,
      })
    }

    const runtimeRequests = new Set<string>()
    for (const importDeclaration of parsed.value.module.staticImports) {
      if (importDeclaration.entries.length === 0 || importDeclaration.entries.some((entry) => !entry.isType)) {
        runtimeRequests.add(importDeclaration.moduleRequest.value)
      }
    }
    for (const exportDeclaration of parsed.value.module.staticExports) {
      for (const entry of exportDeclaration.entries) {
        if (!entry.isType && entry.moduleRequest !== null) {
          runtimeRequests.add(entry.moduleRequest.value)
        }
      }
    }

    for (const request of runtimeRequests) {
      const resolution = Result.tryCatch(() => resolverResult.value.resolver.sync(dirname(file.absolutePath), request))
      if (Result.isFailure(resolution)) {
        return Result.Failure({
          _tag: "JavaScriptTypeScriptResolverFailed",
          file: file.path,
          request,
          cause: resolution.error,
        })
      }

      if (resolution.value.path === undefined) {
        if (shouldDiagnoseUnresolvedRequest(request, resolverResult.value.configuredAliasPatterns)) {
          diagnostics.push({
            code: "UNRESOLVED_RUNTIME_DEPENDENCY",
            message: `Could not resolve runtime dependency ${JSON.stringify(request)}.`,
            file: file.path,
          })
        }
        continue
      }

      const target = discoveredPathByAbsolutePath.get(resolve(resolution.value.path))
      if (target === undefined) {
        continue
      }

      const key = `${file.path}\u0000${target}`
      dependencyByKey.set(key, {
        source: file.path,
        target,
        kind: "runtime",
      })
    }
  }

  return Result.Success({
    dependencies: [...dependencyByKey.values()].sort(compareDependencies),
    diagnostics: diagnostics.sort(compareDiagnostics),
  })
}

type ResolverContext = {
  readonly resolver: ResolverFactory
  readonly configuredAliasPatterns: readonly string[]
}

function createResolverContext(projectRoot: string): ResolverContext {
  const rootConfigPath = rootProjectConfigPath(projectRoot)
  return {
    resolver: new ResolverFactory({
      conditionNames: ["node", "import"],
      extensionAlias: {
        ".js": [".ts", ".tsx", ".js", ".jsx"],
        ".cjs": [".cts", ".cjs"],
        ".mjs": [".mts", ".mjs"],
      },
      extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
      mainFields: ["module", "main"],
      ...(rootConfigPath === undefined ? {} : { tsconfig: { configFile: rootConfigPath } }),
    }),
    configuredAliasPatterns: rootConfigPath === undefined ? [] : readConfiguredAliasPatterns(rootConfigPath),
  }
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
  return patterns.sort((left, right) => left.localeCompare(right))
}

function shouldDiagnoseUnresolvedRequest(request: string, configuredAliasPatterns: readonly string[]): boolean {
  if (configuredAliasPatterns.some((pattern) => matchesAliasPattern(request, pattern))) {
    return true
  }

  if (!request.startsWith(".") && !request.startsWith("/")) {
    return false
  }
  const extension = extname(request)
  return extension.length === 0 || EXECUTABLE_EXTENSIONS.has(extension.toLowerCase())
}

function matchesAliasPattern(request: string, pattern: string): boolean {
  const wildcardIndex = pattern.indexOf("*")
  if (wildcardIndex === -1) {
    return request === pattern
  }

  return request.startsWith(pattern.slice(0, wildcardIndex)) && request.endsWith(pattern.slice(wildcardIndex + 1))
}

function compareDependencies(left: ProjectDependency, right: ProjectDependency): number {
  const sourceComparison = left.source.localeCompare(right.source)
  return sourceComparison === 0 ? left.target.localeCompare(right.target) : sourceComparison
}

function compareDiagnostics(left: AnalysisDiagnostic, right: AnalysisDiagnostic): number {
  const fileComparison = (left.file ?? "").localeCompare(right.file ?? "")
  if (fileComparison !== 0) {
    return fileComparison
  }

  const codeComparison = left.code.localeCompare(right.code)
  return codeComparison === 0 ? left.message.localeCompare(right.message) : codeComparison
}
