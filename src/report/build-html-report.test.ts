import { Result, TypeGuard, branded } from "@guillaume-docquier/tools-ts"
import { expect, it } from "vitest"
import { analyzeProject } from "../analysis/analyze-project.js"
import type { ExternalPackageName } from "../analysis/external-package-name.js"
import { PROJECT_ANALYSIS_SCHEMA_VERSION, type ProjectAnalysis } from "../analysis/project-analysis.js"
import { ProjectFilePath } from "../project-files/project-file-path.js"
import { fixtureProjectPath } from "../testing/fixture-project.js"
import { buildHtmlReport } from "./build-html-report.js"

it("embeds the complete project analysis without presentation-only data", async () => {
  // Arrange
  const analysis = await analyzeProject({ projectRoot: fixtureProjectPath("external-packages") })
  if (Result.isFailure(analysis)) {
    throw new Error(`Fixture analysis failed: ${analysis.error._tag}`)
  }
  const diagnosticFile = parseProjectFilePath("src/entry.ts")
  const enrichedAnalysis: ProjectAnalysis = {
    ...analysis.value,
    files: analysis.value.files.map((file, index) => (index === 0 ? { ...file, coverage: { lines: 50 } } : file)),
    diagnostics: [{ code: "test-diagnostic", message: "Diagnostic detail", file: diagnosticFile }],
  }
  const browserBundle = "document.documentElement.dataset.bundleMarker='embedded'"

  // Act
  const html = buildHtmlReport(enrichedAnalysis, browserBundle)
  const embeddedAnalysis = embeddedProjectAnalysis(html)

  // Assert
  expect(embeddedAnalysis).toEqual(JSON.parse(JSON.stringify(enrichedAnalysis)))
  expect(embeddedAnalysis).toMatchObject({
    schemaVersion: PROJECT_ANALYSIS_SCHEMA_VERSION,
    project: analysis.value.project,
    files: expect.arrayContaining([
      expect.objectContaining({
        path: analysis.value.files[0]?.path,
        language: "typescript",
        lines: expect.objectContaining({ code: expect.any(Number), comment: expect.any(Number), blank: expect.any(Number) }),
        coverage: { lines: 50 },
      }),
    ]),
    dependencies: analysis.value.dependencies,
    externalPackages: analysis.value.externalPackages,
    externalPackageDependencies: analysis.value.externalPackageDependencies,
    diagnostics: [{ code: "test-diagnostic", message: "Diagnostic detail", file: "src/entry.ts" }],
  })
  expect(JSON.stringify(embeddedAnalysis)).not.toMatch(
    /"(?:color|size|displayName|tooltipName|importedNodeIds|consumerNodeIds|nodes|edges|id)"/u,
  )
  expect(html).toContain("<!doctype html>")
  expect(html).toContain("<title>Show Me</title>")
  expect(html).toContain('<h1 id="project-name"></h1><p id="project-file-count"></p>')
  expect(html).toContain(browserBundle)
  expect(html).not.toContain('src="')
  expect(html).not.toMatch(/https?:\/\//u)
})

it("escapes hostile analysis and browser bundle text inside one offline document", () => {
  // Arrange
  const unsafeText = "</script><script>unsafe()</script>&" + String.fromCodePoint(0x20_28, 0x20_29)
  const unsafePath = parseProjectFilePath(`src/${unsafeText}.ts`)
  // Deliberately bypass package parsing to keep the report boundary safe even if an upstream invariant regresses.
  const unsafePackageName = branded<ExternalPackageName>(unsafeText)
  const analysis: ProjectAnalysis = {
    schemaVersion: PROJECT_ANALYSIS_SCHEMA_VERSION,
    project: { name: unsafeText },
    files: [
      {
        path: unsafePath,
        language: unsafeText,
        lines: { code: 1, comment: 0, blank: 0 },
        coverage: undefined,
      },
    ],
    dependencies: [],
    externalPackages: [{ name: unsafePackageName }],
    externalPackageDependencies: [{ source: unsafePath, target: unsafePackageName, kind: "runtime" }],
    diagnostics: [{ code: unsafeText, message: unsafeText, file: unsafePath }],
  }
  const browserBundle = 'window.bundleValue = "</ScRiPt><script>bundleUnsafe()</script>"'

  // Act
  const html = buildHtmlReport(analysis, browserBundle)

  // Assert
  expect(html).not.toContain(unsafeText)
  expect(html).not.toContain("</ScRiPt>")
  expect(html).not.toContain("</script><script>bundleUnsafe()")
  expect(html).toContain("\\u003c/script\\u003e\\u003cscript\\u003eunsafe()\\u003c/script\\u003e\\u0026\\u2028\\u2029")
  expect(html).toContain("<\\/script><script>bundleUnsafe()<\\/script>")
  expect(html.match(/<\/script>/gu)).toHaveLength(2)
})

it("does not embed project source contents", async () => {
  // Arrange
  const analysis = await analyzeProject({ projectRoot: fixtureProjectPath("minimal-javascript") })
  if (Result.isFailure(analysis)) {
    throw new Error(`Fixture analysis failed: ${analysis.error._tag}`)
  }

  // Act
  const html = buildHtmlReport(analysis.value, "window.bundleLoaded=true")

  // Assert
  expect(html).toContain("index.js")
  expect(html).not.toContain('export const message = "hello"')
})

function embeddedProjectAnalysis(html: string): unknown {
  const serializedAnalysis = html.match(/<script>window\.showMeAnalysis=(.+);<\/script>/u)?.[1]
  if (serializedAnalysis === undefined) {
    throw new Error("Generated report did not embed its project analysis.")
  }

  const analysis: unknown = JSON.parse(serializedAnalysis)
  if (
    !TypeGuard.isRecord(analysis) ||
    !TypeGuard.isArray(analysis.files) ||
    !TypeGuard.isArray(analysis.dependencies) ||
    !TypeGuard.isArray(analysis.externalPackages) ||
    !TypeGuard.isArray(analysis.externalPackageDependencies) ||
    !TypeGuard.isArray(analysis.diagnostics)
  ) {
    throw new Error("Generated report analysis did not contain the complete analysis collections.")
  }
  return analysis
}

function parseProjectFilePath(input: string): ProjectFilePath {
  const result = ProjectFilePath.parse(input)
  if (Result.isFailure(result)) {
    throw new Error(`Invalid test project file path: ${input}`)
  }
  return result.value
}
