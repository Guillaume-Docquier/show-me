import { Result, TypeGuard } from "@guillaume-docquier/tools-ts"
import { expect, it } from "vitest"
import { analyzeProject } from "../analysis/analyze-project.js"
import { importIstanbulCoverage } from "../coverage/import-istanbul-coverage.js"
import { fixtureProjectPath } from "../testing/fixture-project.js"
import { buildHtmlReport } from "./build-html-report.js"

it("builds one offline document without embedding source contents", async () => {
  // Arrange
  const analysis = await analyzeProject({ projectRoot: fixtureProjectPath("minimal-javascript") })
  const browserBundle = "document.documentElement.dataset.bundleMarker='embedded'"

  if (Result.isFailure(analysis)) {
    throw new Error(`Fixture analysis failed: ${analysis.error._tag}`)
  }

  // Act
  const html = buildHtmlReport(analysis.value, browserBundle)

  // Assert
  expect(html).toContain("<!doctype html>")
  expect(html).toContain("index.js")
  expect(html).toContain(browserBundle)
  expect(html).not.toContain('src="')
  expect(html).not.toMatch(/https?:\/\//u)
  expect(html).not.toContain('export const message = "hello"')
})

it("escapes script-closing project data before embedding it", async () => {
  // Arrange
  const analysis = await analyzeProject({ projectRoot: fixtureProjectPath("minimal-javascript") })
  if (Result.isFailure(analysis)) {
    throw new Error(`Fixture analysis failed: ${analysis.error._tag}`)
  }
  const unsafeAnalysis = {
    ...analysis.value,
    project: { name: "</script><script>unsafe()</script>" },
  }

  // Act
  const html = buildHtmlReport(unsafeAnalysis, "window.bundleLoaded=true")

  // Assert
  expect(html).not.toContain("</script><script>unsafe()")
  expect(html).toContain("\\u003c/script\\u003e")
})

it("keeps missing coverage neutral instead of treating it as zero coverage", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("coverage-project")
  const analysis = await analyzeProject({ projectRoot })
  if (Result.isFailure(analysis)) {
    throw new Error(`Fixture analysis failed: ${analysis.error._tag}`)
  }
  const coveredAnalysis = await importIstanbulCoverage(analysis.value, projectRoot, `${projectRoot}/coverage/coverage-final.json`)
  if (Result.isFailure(coveredAnalysis)) {
    throw new Error(`Fixture coverage import failed: ${coveredAnalysis.error._tag}`)
  }

  // Act
  const html = buildHtmlReport(coveredAnalysis.value, "window.bundleLoaded=true")
  const nodes = embeddedReportPresentation(html).nodes

  // Assert
  const absentNode = nodes.find((node) => TypeGuard.isRecord(node) && node.path === "src/absent.ts")
  const uncoveredNode = nodes.find((node) => TypeGuard.isRecord(node) && node.path === "src/uncovered.ts")
  expect(absentNode).toMatchObject({ path: "src/absent.ts", color: "#8fa3b8" })
  expect(absentNode).not.toHaveProperty("coverage")
  expect(uncoveredNode).toMatchObject({ path: "src/uncovered.ts", coverage: 0, color: "#dc2626" })
})

it("omits default-excluded test files and their relationships from the report", async () => {
  // Arrange
  const projectRoot = fixtureProjectPath("test-file-exclusions")
  const analysis = await analyzeProject({ projectRoot })
  if (Result.isFailure(analysis)) {
    throw new Error("Fixture analysis failed: " + analysis.error._tag)
  }
  const coveredAnalysis = await importIstanbulCoverage(analysis.value, projectRoot, projectRoot + "/coverage/coverage-final.json")
  if (Result.isFailure(coveredAnalysis)) {
    throw new Error("Fixture coverage import failed: " + coveredAnalysis.error._tag)
  }

  // Act
  const html = buildHtmlReport(coveredAnalysis.value, "window.bundleLoaded=true")
  const presentation = embeddedReportPresentation(html)

  // Assert
  expect(html).toContain("<p>11 project files</p>")
  expect(
    presentation.nodes.map((node) => {
      if (!TypeGuard.isRecord(node)) {
        throw new Error("Generated report contained an invalid node.")
      }
      return { path: node.path, coverage: node.coverage }
    }),
  ).toEqual([
    { path: "src/__tests__/helper.ts", coverage: undefined },
    { path: "src/app.ts", coverage: 100 },
    { path: "src/aspect.ts", coverage: undefined },
    { path: "src/contest.ts", coverage: undefined },
    { path: "src/runtime.ts", coverage: 0 },
    { path: "src/spec.ts", coverage: undefined },
    { path: "src/suite.spec/helper.ts", coverage: undefined },
    { path: "src/suite.test/helper.ts", coverage: undefined },
    { path: "src/test.ts", coverage: undefined },
    { path: "src/test/helper.ts", coverage: undefined },
    { path: "src/tests/helper.ts", coverage: undefined },
  ])
  expect(presentation.edges).toEqual([
    expect.objectContaining({
      source: "src/app.ts",
      target: "src/runtime.ts",
    }),
  ])
})

function embeddedReportPresentation(html: string): { readonly nodes: readonly unknown[]; readonly edges: readonly unknown[] } {
  const serializedPresentation = html.match(/<script>window\.showMePresentation=(.+);<\/script>/u)?.[1]
  if (serializedPresentation === undefined) {
    throw new Error("Generated report did not embed its presentation model.")
  }

  const presentation: unknown = JSON.parse(serializedPresentation)
  if (!TypeGuard.isRecord(presentation) || !TypeGuard.isArray(presentation.nodes) || !TypeGuard.isArray(presentation.edges)) {
    throw new Error("Generated report presentation did not contain nodes and edges.")
  }
  return { nodes: presentation.nodes, edges: presentation.edges }
}
