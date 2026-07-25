import { Result } from "@guillaume-docquier/tools-ts"
import { parseSync, Visitor } from "oxc-parser"
import type { AnalysisDiagnostic, DependencyKind } from "../../analysis/project-analysis.js"
import type { ProjectFilePath } from "../../project-files/project-file-path.js"
import type {
  JavaScriptTypeScriptCommentSpan,
  JavaScriptTypeScriptJsxCommentContainerSpan,
} from "./classify-javascript-typescript-lines.js"

/**
 * Source data required for syntax-level dependency-request collection.
 */
export type StaticDependencyRequestSource = {
  readonly path: ProjectFilePath
  readonly absolutePath: string
  readonly sourceText: string
}

/**
 * One static ESM request classified without type checking.
 */
export type StaticDependencyRequest = {
  readonly request: string
  readonly kind: DependencyKind
}

/** Dependency requests and recoverable parser diagnostics from one source file. */
export type StaticDependencyRequestCollection = {
  readonly requests: readonly StaticDependencyRequest[]
  readonly comments: readonly JavaScriptTypeScriptCommentSpan[]
  readonly jsxCommentContainers: readonly JavaScriptTypeScriptJsxCommentContainerSpan[]
  readonly diagnostics: readonly AnalysisDiagnostic[]
}

/**
 * Collect static ESM requests without exposing Oxc AST values.
 *
 * @param file - Complete source input for one project file.
 * @returns Classified requests and diagnostics, or an unexpected parser-boundary failure.
 */
export function collectStaticDependencyRequests(file: StaticDependencyRequestSource): Result<StaticDependencyRequestCollection, Error> {
  const parsed = Result.tryCatch(() => parseSync(file.absolutePath, file.sourceText, { sourceType: "unambiguous" }))
  if (Result.isFailure(parsed)) {
    return parsed
  }

  const requestKindByRequest = new Map<string, DependencyKind>()
  for (const importDeclaration of parsed.value.module.staticImports) {
    retainRequest(
      requestKindByRequest,
      importDeclaration.moduleRequest.value,
      importDeclaration.entries.length === 0 || importDeclaration.entries.some((entry) => !entry.isType) ? "runtime" : "type-only",
    )
  }
  for (const exportDeclaration of parsed.value.module.staticExports) {
    for (const entry of exportDeclaration.entries) {
      if (entry.moduleRequest !== null) {
        retainRequest(requestKindByRequest, entry.moduleRequest.value, entry.isType ? "type-only" : "runtime")
      }
    }
  }

  const comments: readonly JavaScriptTypeScriptCommentSpan[] = parsed.value.comments.map((comment) => ({
    start: comment.start,
    end: comment.end,
    type: comment.type === "Line" ? "line" : "block",
  }))
  const jsxExpressionContainers: Array<{ readonly start: number; readonly end: number }> = []
  new Visitor({
    JSXExpressionContainer(container): void {
      if (container.expression.type === "JSXEmptyExpression") {
        jsxExpressionContainers.push({ start: container.start, end: container.end })
      }
    },
  }).visit(parsed.value.program)

  return Result.Success({
    requests: [...requestKindByRequest].map(([request, kind]) => ({ request, kind })),
    comments,
    jsxCommentContainers: collectJsxCommentContainers(file.sourceText, comments, jsxExpressionContainers),
    diagnostics: parsed.value.errors.map((error) => ({
      code: "JAVASCRIPT_TYPESCRIPT_PARSE_ERROR",
      message: error.message,
      file: file.path,
    })),
  })
}

function retainRequest(requests: Map<string, DependencyKind>, request: string, kind: DependencyKind): void {
  if (requests.get(request) !== "runtime") {
    requests.set(request, kind)
  }
}

function collectJsxCommentContainers(
  sourceText: string,
  comments: readonly JavaScriptTypeScriptCommentSpan[],
  containers: ReadonlyArray<{ readonly start: number; readonly end: number }>,
): readonly JavaScriptTypeScriptJsxCommentContainerSpan[] {
  const result: JavaScriptTypeScriptJsxCommentContainerSpan[] = []
  for (const container of containers) {
    const containedComments = comments.filter((comment) => comment.start > container.start && comment.end < container.end)
    const onlyComment = containedComments[0]
    if (
      containedComments.length === 1 &&
      onlyComment?.type === "block" &&
      sourceText.slice(container.start + 1, onlyComment.start).trim().length === 0 &&
      sourceText.slice(onlyComment.end, container.end - 1).trim().length === 0
    ) {
      result.push({
        start: container.start,
        end: container.end,
        commentStart: onlyComment.start,
        commentEnd: onlyComment.end,
      })
    }
  }
  return result
}
