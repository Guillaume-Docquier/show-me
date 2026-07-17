import { Result } from "@guillaume-docquier/tools-ts"
import { describe, expect, it } from "vitest"
import { ProjectFilePath } from "../../project-files/project-file-path.js"
import {
  classifyJavaScriptTypeScriptLines,
  type JavaScriptTypeScriptCommentSpan,
  type JavaScriptTypeScriptJsxCommentContainerSpan,
} from "./classify-javascript-typescript-lines.js"
import { collectStaticRuntimeRequests } from "./collect-static-runtime-requests.js"

describe("classifyJavaScriptTypeScriptLines", () => {
  it.each([
    ["", { code: 0, comment: 0, blank: 0 }],
    ["\n", { code: 0, comment: 0, blank: 1 }],
    ["\r\n", { code: 0, comment: 0, blank: 1 }],
    ["\r", { code: 0, comment: 0, blank: 1 }],
    ["const value = true\n", { code: 1, comment: 0, blank: 0 }],
    ["const first = true\r\n\r\nconst second = true", { code: 2, comment: 0, blank: 1 }],
    ["// first\r// second", { code: 0, comment: 2, blank: 0 }],
  ] as const)("classifies physical lines in %j", (sourceText, expected) => {
    // Arrange
    const syntax = parseSyntax("fixture.ts", sourceText)

    // Act
    const metrics = classifyJavaScriptTypeScriptLines(sourceText, syntax.comments, syntax.jsxCommentContainers)

    // Assert
    expect(metrics).toEqual(expected)
  })

  it("uses code precedence for mixed lines and comment for every line inside a block comment", () => {
    // Arrange
    const sourceText = ["const before = true // trailing", "/* first", "", " * third", " */", "const after = true"].join("\n")

    // Act
    const syntax = parseSyntax("fixture.ts", sourceText)
    const metrics = classifyJavaScriptTypeScriptLines(sourceText, syntax.comments, syntax.jsxCommentContainers)

    // Assert
    expect(metrics).toEqual({ code: 2, comment: 4, blank: 0 })
  })

  it("keeps comment-like text inside syntax as code and recognizes JSX comment containers", () => {
    // Arrange
    const sourceText = [
      'const stringValue = "// string /* value */"',
      "const regularExpression = /\\/\\/|\\/\\*/u",
      "const template = `first",
      "// template text",
      "/* more template text */`",
      "const view = (",
      '  <section title="// attribute">',
      "    {/* JSX comment */}",
      "    <span>/* JSX text */</span>",
      "  </section>",
      ")",
      "const objectValue = {",
      "  /* ordinary object comment */",
      "}",
    ].join("\n")

    // Act
    const syntax = parseSyntax("fixture.tsx", sourceText)
    const metrics = classifyJavaScriptTypeScriptLines(sourceText, syntax.comments, syntax.jsxCommentContainers)

    // Assert
    expect(metrics).toEqual({ code: 12, comment: 2, blank: 0 })
  })

  it("uses Oxc JavaScript string offsets after Unicode text", () => {
    // Arrange
    const sourceText = 'const café = "☕"\n// commentaire'
    const syntax = parseSyntax("fixture.ts", sourceText)

    // Act
    const metrics = classifyJavaScriptTypeScriptLines(sourceText, syntax.comments, syntax.jsxCommentContainers)

    // Assert
    expect(syntax.comments).toEqual([{ start: 17, end: 31, type: "line" }])
    expect(metrics).toEqual({ code: 1, comment: 1, blank: 0 })
  })

  it("classifies Oxc's hashbang comment token as a comment", () => {
    // Arrange
    const sourceText = "#!/usr/bin/env node\n// comment"

    // Act
    const syntax = parseSyntax("fixture.js", sourceText)
    const metrics = classifyJavaScriptTypeScriptLines(sourceText, syntax.comments, syntax.jsxCommentContainers)

    // Assert
    expect(metrics).toEqual({ code: 0, comment: 2, blank: 0 })
  })

  it.each([
    ["", 0],
    ["one", 1],
    ["one\n", 1],
    ["one\n\n", 2],
    ["one\r\ntwo\rthree", 3],
    ["/* first\n\nthird */", 3],
  ] as const)("assigns all %i physical lines exactly once for %j", (sourceText, physicalLineCount) => {
    // Arrange
    const syntax = parseSyntax("fixture.ts", sourceText)

    // Act
    const metrics = classifyJavaScriptTypeScriptLines(sourceText, syntax.comments, syntax.jsxCommentContainers)

    // Assert
    expect(metrics.code + metrics.comment + metrics.blank).toBe(physicalLineCount)
  })
})

function parseSyntax(
  fileName: string,
  sourceText: string,
): {
  readonly comments: readonly JavaScriptTypeScriptCommentSpan[]
  readonly jsxCommentContainers: readonly JavaScriptTypeScriptJsxCommentContainerSpan[]
} {
  const path = ProjectFilePath.parse(fileName)
  if (Result.isFailure(path)) {
    throw new Error("Invalid test path: " + fileName)
  }
  const syntax = collectStaticRuntimeRequests({ path: path.value, absolutePath: fileName, sourceText })
  if (Result.isFailure(syntax)) {
    throw syntax.error
  }
  return syntax.value
}
