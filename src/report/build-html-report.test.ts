import { Result } from "@guillaume-docquier/tools-ts"
import { expect, it } from "vitest"
import { analyzeProject } from "../analysis/analyze-project.js"
import { fixtureProjectPath } from "../testing/fixture-project.js"
import { buildHtmlReport } from "./build-html-report.js"

it("builds one offline document without embedding source contents", async () => {
  // Arrange
  const analysis = await analyzeProject(fixtureProjectPath("minimal-javascript"))
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
  const analysis = await analyzeProject(fixtureProjectPath("minimal-javascript"))
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
