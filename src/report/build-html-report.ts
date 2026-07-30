import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { Result } from "@guillaume-docquier/tools-ts"
import type { ProjectAnalysis } from "../analysis/project-analysis.js"
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
  const serializedAnalysis = serializeForInlineScript(analysis)

  return `<!doctype html>
<html lang="en" data-show-me-ready="false">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Show Me</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
<header>
  <div class="report-heading"><h1 id="project-name"></h1><p id="project-file-count"></p></div>
</header>
<main>
  <aside id="files" aria-label="Codebase navigation">
    <div id="sidebar-tabs" class="sidebar-tabs" role="tablist" aria-label="Codebase panels">
      <button id="findings-tab" type="button" role="tab" aria-controls="findings-panel" aria-selected="true">Findings</button>
      <button id="coverage-tab" type="button" role="tab" aria-controls="coverage-panel" aria-selected="false" tabindex="-1" hidden>Coverage</button>
      <button id="project-files-tab" type="button" role="tab" aria-controls="project-files-panel" aria-selected="false" tabindex="-1">Project files</button>
    </div>
    <section id="findings-panel" class="findings-panel" role="tabpanel" aria-labelledby="findings-tab">
      <h2>Findings</h2>
      <p class="findings-intro">Explainable candidates from the active workspace scope. They are starting points for investigation, not verdicts.</p>
      <div id="findings-categories"></div>
      <p id="findings-empty" class="findings-empty" role="status" hidden>No findings in the active workspace scope.</p>
    </section>
    <section id="coverage-panel" class="diagnostic-panel coverage-panel" role="tabpanel" aria-labelledby="coverage-tab" hidden>
      <h2>Coverage</h2>
      <p class="findings-intro">Filter physical code-line size and imported executable-line coverage independently. Show Me does not infer exact uncovered source lines.</p>
      <fieldset class="diagnostic-filters">
        <legend>Coverage filters</legend>
        <label for="coverage-minimum-code-lines">Minimum code lines
          <input id="coverage-minimum-code-lines" type="number" min="0" step="1" value="100">
        </label>
        <label for="coverage-maximum-percentage">Maximum coverage
          <span><input id="coverage-maximum-percentage" type="number" min="0" max="100" step="1" value="80">%</span>
        </label>
        <label><input id="coverage-include-unavailable" type="checkbox" checked>Include unavailable coverage</label>
      </fieldset>
      <dl id="coverage-result-counts" class="diagnostic-counts">
        <dt>Matching files</dt><dd id="coverage-matching-count">0</dd>
        <dt>Known coverage</dt><dd id="coverage-known-count">0</dd>
        <dt>Unavailable coverage</dt><dd id="coverage-unavailable-count">0</dd>
      </dl>
      <p id="coverage-empty" class="findings-empty" role="status" hidden>No files match the active coverage filters.</p>
      <ol id="coverage-results" class="diagnostic-results"></ol>
    </section>
    <section id="project-files-panel" role="tabpanel" aria-labelledby="project-files-tab" hidden>
      <h2 id="files-heading">Project files</h2>
      <label class="file-search" for="file-search">
        <span>Search project paths</span>
        <input id="file-search" type="search" placeholder="Filter by path" autocomplete="off">
      </label>
      <p id="file-search-result-count" class="file-search-result-count" role="status" hidden></p>
      <p id="file-tree-empty" class="file-tree-empty" role="status" hidden></p>
      <ol id="file-list" class="file-list node-list"></ol>
      <section id="selected-tree-section" class="selected-tree-section" hidden>
        <h3>Selected item</h3>
        <ol id="selected-tree-item" class="file-list node-list"></ol>
      </section>
      <section id="external-package-section" hidden>
        <h2><span class="package-swatch" aria-hidden="true"></span>External packages</h2>
        <ol id="external-package-list" class="file-list node-list"></ol>
      </section>
    </section>
  </aside>
  <section id="graph" aria-label="Project folder and file structure with dependency arrows"></section>
  <section id="controls" class="report-controls" aria-labelledby="controls-heading">
    <h2 id="controls-heading">Graph controls</h2>
    <div class="report-control-groups">
      <label class="lens-control" for="lens-selector">
        <span>Lens</span>
        <select id="lens-selector">
          <option value="overview" selected>Overview</option>
          <option value="structure">Structure</option>
          <option value="coverage">Coverage</option>
          <option value="custom" hidden disabled>Custom</option>
        </select>
      </label>
      <button id="reset-camera" class="graph-control-button" type="button">Fit current graph</button>
      <fieldset id="workspace-package-fieldset" hidden>
        <legend>Workspace packages</legend>
        <span id="workspace-package-controls"></span>
      </fieldset>
      <details id="advanced-controls" class="advanced-controls">
        <summary>Advanced</summary>
        <div class="advanced-control-groups">
          <fieldset id="line-category-controls">
            <legend>Size nodes by</legend>
            <label><input id="line-category-code" type="checkbox" value="code" checked>Code</label>
            <label><input id="line-category-comment" type="checkbox" value="comment">Comments</label>
            <label><input id="line-category-blank" type="checkbox" value="blank">Blank</label>
          </fieldset>
          <fieldset id="graph-content-controls">
            <legend>Presentation</legend>
            <label for="project-file-color">File color
              <select id="project-file-color">
                <option value="coverage" selected>Coverage</option>
                <option value="neutral">Neutral</option>
              </select>
            </label>
            <label for="dependency-display">Dependencies
              <select id="dependency-display">
                <option value="all">All</option>
                <option value="focused" selected>Direct focus only</option>
                <option value="hidden">Hidden</option>
              </select>
            </label>
            <label><input id="structure-edges-toggle" type="checkbox" checked>Structure edges</label>
            <label><input id="type-only-dependencies-toggle" type="checkbox" checked>Type-only dependencies</label>
            <label><input id="external-packages-toggle" type="checkbox">External packages</label>
          </fieldset>
        </div>
      </details>
      <div class="graph-key" aria-label="Graph edge types">
        <span id="structure-edge-key"><i class="graph-edge-swatch structure-edge-swatch" aria-hidden="true"></i>Structure</span>
        <span id="runtime-dependency-edge-key"><i class="graph-edge-swatch dependency-edge-swatch" aria-hidden="true"></i>Runtime</span>
        <span id="type-only-dependency-edge-key"><i class="graph-edge-swatch type-only-dependency-edge-swatch" aria-hidden="true"></i>Type only</span>
        <span id="external-dependency-edge-key"><i class="graph-edge-swatch external-dependency-edge-swatch" aria-hidden="true"></i>External</span>
      </div>
      <div id="coverage-legend" class="coverage-legend" aria-label="Project-file coverage colors"></div>
      <span id="active-size-key" class="active-size-key">Size: code lines</span>
    </div>
  </section>
  <aside id="details" aria-label="Graph node details">
    <nav class="selection-navigation" aria-label="Selection navigation">
      <div class="selection-history">
        <button id="navigation-back" type="button" aria-label="Back to previous selection" disabled>←</button>
        <button id="navigation-forward" type="button" aria-label="Forward to next selection" disabled>→</button>
      </div>
      <div id="selection-breadcrumb" class="selection-breadcrumb" aria-label="Selected path"></div>
    </nav>
    <p id="selected-empty" role="status" aria-live="polite">Hover over or select a node to inspect it.</p>
    <section id="selected-details" hidden>
      <div class="node-type" id="selected-node-type"></div>
      <div class="detail-path" id="selected-path"></div>
      <dl>
        <dt data-project-file-detail>Code lines</dt><dd id="selected-code-lines" data-project-file-detail></dd>
        <dt data-project-file-detail>Comment lines</dt><dd id="selected-comment-lines" data-project-file-detail></dd>
        <dt data-project-file-detail>Blank lines</dt><dd id="selected-blank-lines" data-project-file-detail></dd>
        <dt data-dependency-detail>Dependencies</dt><dd id="selected-dependencies" data-dependency-detail></dd>
        <dt data-dependency-detail>Consumers</dt><dd id="selected-consumers" data-dependency-detail></dd>
        <dt data-project-file-detail>Coverage</dt><dd id="selected-coverage" data-project-file-detail></dd>
      </dl>
      <h3 data-dependency-detail>Dependencies</h3>
      <ol id="selected-dependency-nodes" class="file-list relationship-list" data-dependency-detail></ol>
      <h3 data-dependency-detail>Consumers</h3>
      <ol id="selected-consumer-files" class="file-list relationship-list" data-dependency-detail></ol>
      <h3 data-directory-detail>Parent directory</h3>
      <ol id="selected-parent-directory" class="file-list relationship-list" data-directory-detail></ol>
      <h3 data-directory-detail>Child directories and files</h3>
      <ol id="selected-directory-children" class="file-list relationship-list" data-directory-detail></ol>
    </section>
  </aside>
</main>
<script>window.showMeAnalysis=${serializedAnalysis};</script>
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

function serializeForInlineScript(value: ProjectAnalysis): string {
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
