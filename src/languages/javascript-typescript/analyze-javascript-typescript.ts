import { extname, resolve } from "node:path"
import { Result, TypeGuard } from "@guillaume-docquier/tools-ts"
import { ExternalPackageName } from "../../analysis/external-package-name.js"
import type {
  AnalysisDiagnostic,
  ExternalPackageDependency,
  ProjectDependency,
  ProjectFileAnalysis,
} from "../../analysis/project-analysis.js"
import { ProjectFilePath } from "../../project-files/project-file-path.js"
import { compareText } from "../../text/compare-text.js"
import type { WorkspacePackageDefinition } from "../../workspaces/pnpm-workspace.js"
import { classifyJavaScriptTypeScriptLines } from "./classify-javascript-typescript-lines.js"
import { collectStaticRuntimeRequests, type StaticRuntimeRequestSource } from "./collect-static-runtime-requests.js"
import { externalPackageNameFromRequest } from "./external-package-name.js"
import {
  hasJavaScriptTypeScriptExecutableExtension,
  JAVASCRIPT_TYPESCRIPT_EXECUTABLE_EXTENSIONS,
  type JavaScriptTypeScriptLanguageId,
} from "./javascript-typescript-file-support.js"
import { createJavaScriptTypeScriptResolver, type JavaScriptTypeScriptResolver } from "./javascript-typescript-resolver.js"

/**
 * Source input understood by the internal JavaScript and TypeScript language module.
 */
export type JavaScriptTypeScriptSourceFile = StaticRuntimeRequestSource & {
  readonly language: JavaScriptTypeScriptLanguageId
  readonly workspacePackage?: string
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
  workspacePackages: readonly WorkspacePackageDefinition[] = [],
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
      ...(file.workspacePackage === undefined ? {} : { workspacePackage: file.workspacePackage }),
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
        const workspacePackage = workspacePackageForRequest(workspacePackages, request)
        if (workspacePackage !== undefined) {
          const target = resolveWorkspacePackageTarget(workspacePackage, request, discoveredPathByAbsolutePath)
          if (target === undefined) {
            diagnostics.push({
              code: "UNRESOLVED_RUNTIME_DEPENDENCY",
              message: `Could not resolve runtime dependency ${JSON.stringify(request)}.`,
              file: file.path,
            })
          } else {
            const workspaceDependency: ProjectDependency = { source: file.path, target, kind: "runtime" }
            dependencyByKey.set(`${workspaceDependency.source}\u0000${workspaceDependency.target}`, workspaceDependency)
          }
          continue
        }

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

function workspacePackageForRequest(
  workspacePackages: readonly WorkspacePackageDefinition[],
  request: string,
): WorkspacePackageDefinition | undefined {
  return workspacePackages.find((workspacePackage) => request === workspacePackage.name || request.startsWith(`${workspacePackage.name}/`))
}

function resolveWorkspacePackageTarget(
  workspacePackage: WorkspacePackageDefinition,
  request: string,
  discoveredPathByAbsolutePath: ReadonlyMap<string, ProjectFilePath>,
): ProjectFilePath | undefined {
  const subpath = request === workspacePackage.name ? "." : `.${request.slice(workspacePackage.name.length)}`
  const exportedTarget = workspaceExportTarget(workspacePackage.manifest.exports, subpath)
  const candidates =
    exportedTarget === undefined
      ? subpath === "."
        ? [workspacePackage.manifest.module, workspacePackage.manifest.main, "src/index", "index"]
        : [subpath.slice(2)]
      : [exportedTarget]

  for (const candidate of candidates) {
    if (candidate === undefined) {
      continue
    }
    const target = discoveredTargetForCandidate(resolve(workspacePackage.absoluteRoot, candidate), discoveredPathByAbsolutePath)
    if (target !== undefined) {
      return target
    }
  }
  return undefined
}

function workspaceExportTarget(exportsValue: unknown, subpath: string): string | undefined {
  if (subpath === ".") {
    if (TypeGuard.isString(exportsValue) || TypeGuard.isArray(exportsValue)) {
      return runtimeExportTarget(exportsValue)
    }
    if (TypeGuard.isRecord(exportsValue)) {
      return runtimeExportTarget(exportsValue["."] ?? exportsValue)
    }
    return undefined
  }
  return TypeGuard.isRecord(exportsValue) ? runtimeExportTarget(exportsValue[subpath]) : undefined
}

function runtimeExportTarget(value: unknown): string | undefined {
  if (TypeGuard.isString(value)) {
    return value
  }
  if (TypeGuard.isArray(value)) {
    for (const candidate of value) {
      const target = runtimeExportTarget(candidate)
      if (target !== undefined) {
        return target
      }
    }
    return undefined
  }
  if (!TypeGuard.isRecord(value)) {
    return undefined
  }
  for (const condition of ["import", "node", "default"]) {
    const target = runtimeExportTarget(value[condition])
    if (target !== undefined) {
      return target
    }
  }
  return undefined
}

function discoveredTargetForCandidate(
  absoluteCandidate: string,
  discoveredPathByAbsolutePath: ReadonlyMap<string, ProjectFilePath>,
): ProjectFilePath | undefined {
  const extension = extname(absoluteCandidate)
  const candidates = [absoluteCandidate]
  if (extension === ".js") {
    candidates.push(...[".ts", ".tsx", ".jsx"].map((replacement) => absoluteCandidate.slice(0, -3) + replacement))
  } else if (extension === ".cjs") {
    candidates.push(absoluteCandidate.slice(0, -4) + ".cts")
  } else if (extension === ".mjs") {
    candidates.push(absoluteCandidate.slice(0, -4) + ".mts")
  } else if (extension.length === 0) {
    candidates.push(...JAVASCRIPT_TYPESCRIPT_EXECUTABLE_EXTENSIONS.map((candidateExtension) => absoluteCandidate + candidateExtension))
    candidates.push(
      ...JAVASCRIPT_TYPESCRIPT_EXECUTABLE_EXTENSIONS.map((candidateExtension) => resolve(absoluteCandidate, `index${candidateExtension}`)),
    )
  }

  for (const candidate of candidates) {
    const target = discoveredPathByAbsolutePath.get(resolve(candidate))
    if (target !== undefined) {
      return target
    }
  }
  return undefined
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
