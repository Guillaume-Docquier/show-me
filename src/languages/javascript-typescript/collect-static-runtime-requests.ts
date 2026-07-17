import { Result } from "@guillaume-docquier/tools-ts"
import { parseSync } from "oxc-parser"
import type { AnalysisDiagnostic } from "../../analysis/project-analysis.js"
import type { ProjectFilePath } from "../../project-files/project-file-path.js"

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

  return Result.Success({
    requests: [...requests],
    diagnostics: parsed.value.errors.map((error) => ({
      code: "JAVASCRIPT_TYPESCRIPT_PARSE_ERROR",
      message: error.message,
      file: file.path,
    })),
  })
}
