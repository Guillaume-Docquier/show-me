import { Result } from "@guillaume-docquier/tools-ts"
import { parseSync, Visitor } from "oxc-parser"
import type { AnalysisDiagnostic } from "../../analysis/project-analysis.js"
import type { ProjectFilePath } from "../../project-files/project-file-path.js"
import type {
  JavaScriptTypeScriptCommentSpan,
  JavaScriptTypeScriptJsxCommentContainerSpan,
} from "./classify-javascript-typescript-lines.js"

/**
 * Source data required for syntax-level runtime-request collection.
 */
export type StaticRuntimeRequestSource = {
  readonly path: ProjectFilePath
  readonly absolutePath: string
  readonly sourceText: string
}

/**
 * Runtime requests and recoverable parser diagnostics from one source file.
 */
export type StaticRuntimeRequestCollection = {
  readonly requests: readonly string[]
  readonly comments: readonly JavaScriptTypeScriptCommentSpan[]
  readonly jsxCommentContainers: readonly JavaScriptTypeScriptJsxCommentContainerSpan[]
  readonly diagnostics: readonly AnalysisDiagnostic[]
}

/**
 * Collect static runtime ESM requests without exposing Oxc AST values.
 *
 * @param file - Complete source input for one project file.
 * @returns Runtime requests and diagnostics, or an unexpected parser-boundary failure.
 */
export function collectStaticRuntimeRequests(file: StaticRuntimeRequestSource): Result<StaticRuntimeRequestCollection, Error> {
  const parsed = Result.tryCatch(() => parseSync(file.absolutePath, file.sourceText, { sourceType: "unambiguous" }))
  if (Result.isFailure(parsed)) {
    return parsed
  }

  const requests = new Set<string>()
  for (const importDeclaration of parsed.value.module.staticImports) {
    if (importDeclaration.entries.length === 0 || importDeclaration.entries.some((entry) => !entry.isType)) {
      requests.add(importDeclaration.moduleRequest.value)
    }
  }
  for (const exportDeclaration of parsed.value.module.staticExports) {
    for (const entry of exportDeclaration.entries) {
      if (!entry.isType && entry.moduleRequest !== null) {
        requests.add(entry.moduleRequest.value)
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
    requests: [...requests],
    comments,
    jsxCommentContainers: collectJsxCommentContainers(file.sourceText, comments, jsxExpressionContainers),
    diagnostics: parsed.value.errors.map((error) => ({
      code: "JAVASCRIPT_TYPESCRIPT_PARSE_ERROR",
      message: error.message,
      file: file.path,
    })),
  })
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
