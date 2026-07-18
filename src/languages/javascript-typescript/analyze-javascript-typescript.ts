import { extname, resolve } from "node:path"
import { Result } from "@guillaume-docquier/tools-ts"
import { ExternalPackageName } from "../../analysis/external-package-name.js"
import type {
  AnalysisDiagnostic,
  ExternalPackageDependency,
  ProjectDependency,
  ProjectFileAnalysis,
} from "../../analysis/project-analysis.js"
import { ProjectFilePath } from "../../project-files/project-file-path.js"
import { compareText } from "../../text/compare-text.js"
import { classifyJavaScriptTypeScriptLines } from "./classify-javascript-typescript-lines.js"
import { collectStaticRuntimeRequests, type StaticRuntimeRequestSource } from "./collect-static-runtime-requests.js"
import { externalPackageNameFromRequest } from "./external-package-name.js"
import { hasJavaScriptTypeScriptExecutableExtension, type JavaScriptTypeScriptLanguageId } from "./javascript-typescript-file-support.js"
import { createJavaScriptTypeScriptResolver, type JavaScriptTypeScriptResolver } from "./javascript-typescript-resolver.js"

/**
 * Source input understood by the internal JavaScript and TypeScript language module.
 */
export type JavaScriptTypeScriptSourceFile = StaticRuntimeRequestSource & {
  readonly language: JavaScriptTypeScriptLanguageId
}

/**
 * Language-neutral file and dependency data produced by JavaScript and TypeScript analysis.
 */
export type JavaScriptTypeScriptAnalysis = {
  readonly files: readonly ProjectFileAnalysis[]
  readonly dependencies: readonly ProjectDependency[]
  readonly externalPackages: ReadonlyArray<{ readonly name: ExternalPackageName }>
  readonly externalPackageDependencies: readonly ExternalPackageDependency[]
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
 * Analyze files and static runtime ESM relationships without exposing parser or resolver values.
 *
 * @param projectRoot - Root of the project being analyzed.
 * @param files - Discovered JavaScript and TypeScript source files.
 * @returns File metrics, unique directed dependencies, and diagnostics, or a classified adapter failure.
 */
export function analyzeJavaScriptTypeScript(
  projectRoot: string,
  files: readonly JavaScriptTypeScriptSourceFile[],
): Result<JavaScriptTypeScriptAnalysis, JavaScriptTypeScriptAnalysisError> {
  const resolverResult = createJavaScriptTypeScriptResolver(projectRoot)
  if (Result.isFailure(resolverResult)) {
    return Result.Failure({
      _tag: "JavaScriptTypeScriptResolverInitializationFailed",
      projectRoot,
      cause: resolverResult.error,
    })
  }

  const discoveredPathByAbsolutePath = new Map(files.map((file) => [resolve(file.absolutePath), file.path]))
  const dependencyByKey = new Map<string, ProjectDependency>()
  const externalPackageNames = new Set<ExternalPackageName>()
  const externalPackageDependencyByKey = new Map<string, ExternalPackageDependency>()
  const diagnostics: AnalysisDiagnostic[] = []
  const analyzedFiles: ProjectFileAnalysis[] = []

  for (const file of files) {
    const requests = collectStaticRuntimeRequests(file)
    if (Result.isFailure(requests)) {
      return Result.Failure({
        _tag: "JavaScriptTypeScriptParserFailed",
        file: file.path,
        cause: requests.error,
      })
    }

    diagnostics.push(...requests.value.diagnostics)
    analyzedFiles.push({
      path: file.path,
      language: file.language,
      lines: classifyJavaScriptTypeScriptLines(file.sourceText, requests.value.comments, requests.value.jsxCommentContainers),
      coverage: undefined,
    })
    for (const request of requests.value.requests) {
      const dependency = resolveProjectDependency(file, request, resolverResult.value, discoveredPathByAbsolutePath)
      if (Result.isFailure(dependency)) {
        return dependency
      }
      if (dependency.value._tag === "Dependency") {
        const resolvedDependency = dependency.value.dependency
        dependencyByKey.set(`${resolvedDependency.source}\u0000${resolvedDependency.target}`, resolvedDependency)
        continue
      }

      if (!dependency.value.matchesConfiguredAlias) {
        const externalPackageName = externalPackageNameFromRequest(request)
        if (externalPackageName !== undefined) {
          externalPackageNames.add(externalPackageName)
          const externalDependency: ExternalPackageDependency = {
            source: file.path,
            target: externalPackageName,
            kind: "runtime",
          }
          externalPackageDependencyByKey.set(`${externalDependency.source}\u0000${externalDependency.target}`, externalDependency)
          continue
        }
      }

      if (dependency.value._tag === "Unresolved" && shouldDiagnoseUnresolvedRequest(request, dependency.value.matchesConfiguredAlias)) {
        diagnostics.push({
          code: "UNRESOLVED_RUNTIME_DEPENDENCY",
          message: `Could not resolve runtime dependency ${JSON.stringify(request)}.`,
          file: file.path,
        })
      }
    }
  }

  return Result.Success({
    files: analyzedFiles,
    dependencies: [...dependencyByKey.values()].sort(compareDependencies),
    externalPackages: [...externalPackageNames].sort((left, right) => ExternalPackageName.compare(left, right)).map((name) => ({ name })),
    externalPackageDependencies: [...externalPackageDependencyByKey.values()].sort(compareExternalPackageDependencies),
    diagnostics: diagnostics.sort(compareDiagnostics),
  })
}

function resolveProjectDependency(
  file: JavaScriptTypeScriptSourceFile,
  request: string,
  resolver: JavaScriptTypeScriptResolver,
  discoveredPathByAbsolutePath: ReadonlyMap<string, ProjectFilePath>,
): Result<ProjectDependencyResolution, JavaScriptTypeScriptAnalysisError> {
  const resolution = resolver.resolveRequest(file.absolutePath, request)
  if (Result.isFailure(resolution)) {
    return Result.Failure({
      _tag: "JavaScriptTypeScriptResolverFailed",
      file: file.path,
      request,
      cause: resolution.error,
    })
  }

  const target = resolution.value.path === undefined ? undefined : discoveredPathByAbsolutePath.get(resolve(resolution.value.path))
  if (resolution.value.path === undefined) {
    return Result.Success({
      _tag: "Unresolved",
      matchesConfiguredAlias: resolution.value.matchesConfiguredAlias,
    })
  }
  return target === undefined
    ? Result.Success({
        _tag: "OutsideAnalysis",
        matchesConfiguredAlias: resolution.value.matchesConfiguredAlias,
      })
    : Result.Success({
        _tag: "Dependency",
        dependency: {
          source: file.path,
          target,
          kind: "runtime",
        },
      })
}

type ProjectDependencyResolution =
  | { readonly _tag: "Unresolved"; readonly matchesConfiguredAlias: boolean }
  | { readonly _tag: "OutsideAnalysis"; readonly matchesConfiguredAlias: boolean }
  | { readonly _tag: "Dependency"; readonly dependency: ProjectDependency }

function shouldDiagnoseUnresolvedRequest(request: string, matchesConfiguredAlias: boolean): boolean {
  if (matchesConfiguredAlias) {
    return true
  }

  if (!request.startsWith(".") && !request.startsWith("/")) {
    return false
  }
  return extname(request).length === 0 || hasJavaScriptTypeScriptExecutableExtension(request)
}

function compareDependencies(left: ProjectDependency, right: ProjectDependency): number {
  const sourceComparison = ProjectFilePath.compare(left.source, right.source)
  return sourceComparison === 0 ? ProjectFilePath.compare(left.target, right.target) : sourceComparison
}

function compareExternalPackageDependencies(left: ExternalPackageDependency, right: ExternalPackageDependency): number {
  const sourceComparison = ProjectFilePath.compare(left.source, right.source)
  return sourceComparison === 0 ? ExternalPackageName.compare(left.target, right.target) : sourceComparison
}

function compareDiagnostics(left: AnalysisDiagnostic, right: AnalysisDiagnostic): number {
  const fileComparison = compareText(left.file ?? "", right.file ?? "")
  if (fileComparison !== 0) {
    return fileComparison
  }

  const codeComparison = compareText(left.code, right.code)
  return codeComparison === 0 ? compareText(left.message, right.message) : codeComparison
}
