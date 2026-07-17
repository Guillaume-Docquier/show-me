import type { ProjectFileLines } from "../../analysis/project-analysis.js"

/**
 * A parser-confirmed JavaScript or TypeScript comment span.
 */
export type JavaScriptTypeScriptCommentSpan = {
  readonly start: number
  readonly end: number
  readonly type: "line" | "block"
}

/**
 * An AST-confirmed JSX expression container whose sole content is one block comment.
 */
export type JavaScriptTypeScriptJsxCommentContainerSpan = {
  readonly start: number
  readonly end: number
  readonly commentStart: number
  readonly commentEnd: number
}

/**
 * Classify every physical source line as code, comment, or blank.
 *
 * A line containing code and a comment is code. Parser-confirmed comment spans
 * ensure comment markers inside strings, templates, regular expressions, JSX
 * text, and similar syntax remain code. Empty input contains no physical lines;
 * LF, CRLF, and CR terminate lines without creating a trailing phantom line.
 *
 * @param sourceText - Complete JavaScript or TypeScript source text.
 * @param commentSpans - Comment spans from the same Oxc parse as dependency collection.
 * @param jsxCommentContainers - AST-confirmed JSX comment containers containing only one block comment.
 * @returns Exclusive physical-line counts whose sum is the total physical line count.
 */
export function classifyJavaScriptTypeScriptLines(
  sourceText: string,
  commentSpans: readonly JavaScriptTypeScriptCommentSpan[],
  jsxCommentContainers: readonly JavaScriptTypeScriptJsxCommentContainerSpan[],
): ProjectFileLines {
  const lines = physicalLines(sourceText)
  const effectiveCommentSpans = expandJsxCommentContainers(commentSpans, jsxCommentContainers).sort(
    (left, right) => left.start - right.start,
  )
  const metrics: MutableProjectFileLines = { code: 0, comment: 0, blank: 0 }
  let firstPossibleComment = 0

  for (const line of lines) {
    let firstComment = effectiveCommentSpans[firstPossibleComment]
    while (firstComment !== undefined && firstComment.end <= line.start) {
      firstPossibleComment += 1
      firstComment = effectiveCommentSpans[firstPossibleComment]
    }

    let cursor = line.start
    let hasComment = false
    let hasCode = false
    for (let commentIndex = firstPossibleComment; commentIndex < effectiveCommentSpans.length; commentIndex += 1) {
      const comment = effectiveCommentSpans[commentIndex]
      if (comment === undefined || startsAfterLine(comment, line)) {
        break
      }
      if (!overlapsLine(comment, line)) {
        continue
      }

      hasComment = true
      const codeEnd = Math.min(comment.start, line.end)
      if (cursor < codeEnd && sourceText.slice(cursor, codeEnd).trim().length > 0) {
        hasCode = true
        break
      }
      cursor = Math.max(cursor, Math.min(comment.end, line.end))
    }
    if (!hasCode && cursor < line.end && sourceText.slice(cursor, line.end).trim().length > 0) {
      hasCode = true
    }

    if (hasCode) {
      metrics.code += 1
    } else if (hasComment) {
      metrics.comment += 1
    } else {
      metrics.blank += 1
    }
  }

  return metrics
}

type MutableProjectFileLines = {
  code: number
  comment: number
  blank: number
}

type PhysicalLine = {
  readonly start: number
  readonly end: number
}

function physicalLines(sourceText: string): readonly PhysicalLine[] {
  if (sourceText.length === 0) {
    return []
  }

  const lines: PhysicalLine[] = []
  const separators = /\r\n|\n|\r/gu
  let lineStart = 0
  for (const separator of sourceText.matchAll(separators)) {
    const separatorStart = separator.index
    lines.push({ start: lineStart, end: separatorStart })
    lineStart = separatorStart + separator[0].length
  }
  if (lineStart < sourceText.length) {
    lines.push({ start: lineStart, end: sourceText.length })
  }
  return lines
}

function overlapsLine(comment: JavaScriptTypeScriptCommentSpan, line: PhysicalLine): boolean {
  if (line.start === line.end) {
    return comment.start < line.start && comment.end > line.start
  }
  return comment.start < line.end && comment.end > line.start
}

function startsAfterLine(comment: JavaScriptTypeScriptCommentSpan, line: PhysicalLine): boolean {
  return line.start === line.end ? comment.start >= line.start : comment.start >= line.end
}

function expandJsxCommentContainers(
  comments: readonly JavaScriptTypeScriptCommentSpan[],
  containers: readonly JavaScriptTypeScriptJsxCommentContainerSpan[],
): JavaScriptTypeScriptCommentSpan[] {
  const containerByComment = new Map(containers.map((container) => [container.commentStart + ":" + container.commentEnd, container]))
  return comments.map((comment) => {
    const container = containerByComment.get(comment.start + ":" + comment.end)
    return container === undefined ? comment : { ...comment, start: container.start, end: container.end }
  })
}
