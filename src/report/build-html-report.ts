import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { Result } from "@guillaume-docquier/tools-ts"
import type { ProjectAnalysis } from "../analysis/project-analysis.js"
import { buildReportPresentation, type ReportPresentation } from "./report-presentation.js"
import { REPORT_STYLES } from "./report-styles.js"

/**
 * Failure to load the browser asset installed beside the report builder.
 */
export type BrowserBundleReadError = {
  readonly _tag: "BrowserBundleReadFailed"
  readonly browserBundlePath: string
  readonly cause: Error
}

/**
 * Build one self-contained HTML document from internal analysis and a browser bundle.
 *
 * @param analysis - Language-neutral project analysis.
 * @param browserBundle - Prebuilt browser JavaScript to embed.
 * @returns A complete offline HTML document.
 */
export function buildHtmlReport(analysis: ProjectAnalysis, browserBundle: string): string {
  return createHtmlReport(buildReportPresentation(analysis), browserBundle)
}

/**
 * Create an HTML document from renderer-neutral presentation data.
 *
 * @param presentation - Graph data consumed by the browser renderer.
 * @param browserBundle - Prebuilt browser JavaScript to embed.
 * @returns A complete offline HTML document.
 */
export function createHtmlReport(presentation: ReportPresentation, browserBundle: string): string {
  const serializedPresentation = serializeForInlineScript(presentation)
  const title = escapeHtml(presentation.projectName)

  return `<!doctype html>
<html lang="en" data-show-me-ready="false">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Show Me</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
<header><h1>${title}</h1><p>${presentation.nodes.length} project files</p></header>
<main>
  <section id="graph" aria-label="Project file dependency graph"></section>
  <aside id="details" aria-label="File details">
    <h2>Selected file</h2>
    <p id="selected-empty">Select a node or file to inspect it.</p>
    <section id="selected-details" hidden>
      <div class="detail-path" id="selected-path"></div>
      <dl>
        <dt>Non-blank lines</dt><dd id="selected-lines"></dd>
        <dt>Imports</dt><dd id="selected-imports"></dd>
        <dt>Consumers</dt><dd id="selected-consumers"></dd>
        <dt>Coverage</dt><dd id="selected-coverage"></dd>
      </dl>
      <button id="clear-selection" class="clear-selection" type="button" hidden>Clear selection</button>
      <h3>Imports</h3>
      <ol id="selected-imported-files" class="file-list relationship-list"></ol>
      <h3>Consumers</h3>
      <ol id="selected-consumer-files" class="file-list relationship-list"></ol>
    </section>
    <h2>Project files</h2>
    <ol id="file-list" class="file-list"></ol>
  </aside>
</main>
<div id="tooltip" role="tooltip" hidden></div>
<script>window.showMePresentation=${serializedPresentation};</script>
<script>${escapeBrowserBundle(browserBundle)}</script>
</body>
</html>`
}

/**
 * Load the prebuilt browser renderer installed beside this module.
 *
 * @returns Browser JavaScript, or a typed package-asset failure.
 */
export async function loadBrowserBundle(): Promise<Result<string, BrowserBundleReadError>> {
  const browserBundlePath = fileURLToPath(new URL("./browser.js", import.meta.url))
  const browserBundle = await Result.tryCatch(readFile(browserBundlePath, "utf8"))

  if (Result.isFailure(browserBundle)) {
    return Result.Failure({
      _tag: "BrowserBundleReadFailed",
      browserBundlePath,
      cause: browserBundle.error,
    })
  }

  return browserBundle
}

function serializeForInlineScript(value: ReportPresentation): string {
  return escapeInlineScript(JSON.stringify(value))
}

function escapeInlineScript(value: string): string {
  return value
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029")
}

function escapeBrowserBundle(browserBundle: string): string {
  return browserBundle.replace(/<\/script/giu, "<\\/script")
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;")
}
