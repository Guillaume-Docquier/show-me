/**
 * Coarse, airy visual styling embedded into every static report.
 */
export const REPORT_STYLES = `
:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  background: #0d1117;
  color: #e7edf4;
}
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
body { display: grid; grid-template-rows: auto 1fr; background: #0d1117; }
header {
  display: flex; align-items: center;
  padding: 14px 20px; border-bottom: 1px solid #25303b;
  background: #111821;
}
h1 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: 0.01em; }
header p { margin: 0; color: #8fa3b8; font-size: 12px; }
.report-heading { display: flex; align-items: baseline; gap: 14px; min-width: 0; }
.report-control-groups, #line-category-controls, #graph-content-controls, #workspace-package-fieldset, #workspace-package-controls,
.advanced-control-groups {
  display: flex; align-items: center; gap: 12px; margin: 0; padding: 0; border: 0;
  color: #aebdca; font-size: 11px;
}
.report-controls {
  grid-area: controls; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center;
  gap: 18px; min-width: 0; padding: 12px 16px; border-top: 1px solid #25303b;
  background: #111821;
}
.report-control-groups { gap: 12px 24px; flex-wrap: wrap; min-width: 0; }
#workspace-package-fieldset[hidden] { display: none; }
.report-controls legend { float: left; margin-right: 2px; color: #8fa3b8; }
.report-controls label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
.report-controls label:has(input:disabled) { color: #6f8295; cursor: default; }
.report-controls input { accent-color: #79b8ff; }
.report-controls select {
  border: 1px solid #42556a; border-radius: 5px; padding: 4px 22px 4px 7px;
  background: #17202a; color: #d3dee9; font: 600 11px Inter, ui-sans-serif, system-ui, sans-serif;
}
.report-controls select:focus-visible { border-color: #79b8ff; outline: 1px solid #79b8ff; outline-offset: 1px; }
.lens-control { color: #8fa3b8; }
.advanced-controls { position: relative; }
.advanced-controls summary {
  border: 1px solid #42556a; border-radius: 5px; padding: 6px 9px;
  background: #17202a; color: #d3dee9; font-weight: 600; cursor: pointer; list-style-position: inside;
}
.advanced-controls[open] summary { border-color: #79b8ff; }
.advanced-control-groups {
  position: absolute; right: 0; bottom: calc(100% + 8px); z-index: 10; align-items: flex-start;
  width: max-content; max-width: min(760px, 70vw); padding: 12px 14px; border: 1px solid #42556a; border-radius: 7px;
  background: #111821; box-shadow: 0 10px 28px rgba(0, 0, 0, .35);
}
#line-category-controls, #graph-content-controls { flex-wrap: wrap; }
#line-category-controls[hidden] { display: none; }
#graph-content-controls { max-width: 540px; }
.graph-control-button {
  border: 1px solid #42556a; border-radius: 5px; padding: 6px 9px;
  background: #17202a; color: #d3dee9; font: 600 11px Inter, ui-sans-serif, system-ui, sans-serif; cursor: pointer;
}
.graph-control-button:hover, .graph-control-button:focus-visible {
  border-color: #79b8ff; background: #1b2b3d; color: #f5f9ff; outline: none;
}
.graph-key, .graph-key span { display: flex; align-items: center; gap: 6px; }
.graph-key { gap: 12px; color: #8fa3b8; }
.graph-key[hidden], .graph-key span[hidden], .coverage-legend[hidden] { display: flex; visibility: hidden; }
.graph-edge-swatch { display: inline-block; width: 18px; }
.structure-edge-swatch { height: 0; border-top: 1px dashed #6f8295; }
.dependency-edge-swatch { height: 2px; background: rgba(98, 139, 181, 0.32); }
.external-dependency-edge-swatch { height: 2px; background: rgba(154, 104, 193, 0.38); }
.type-only-dependency-edge-swatch { height: 2px; background: rgba(163, 230, 53, 0.5); }
.coverage-legend, .coverage-legend-scale, .coverage-legend-entry { display: flex; align-items: center; }
.coverage-legend { gap: 8px; color: #8fa3b8; font-size: 11px; }
.coverage-legend-title { color: #8fa3b8; }
.active-size-key { color: #8fa3b8; font-size: 11px; white-space: nowrap; }
.focus-legend, .focus-legend span { display: flex; align-items: center; gap: 5px; }
.focus-legend { gap: 10px; color: #8fa3b8; font-size: 10px; }
.focus-legend[hidden] { display: flex; visibility: hidden; }
.focus-swatch { display: inline-block; width: 11px; height: 11px; border: 2px solid; border-radius: 50%; }
.selected-focus-swatch { border-color: #f5f9ff; }
.dependency-focus-swatch { border-color: #46d7c6; }
.consumer-focus-swatch { border-color: #ff9b71; border-style: dashed; }
.coverage-legend-scale { gap: 5px; }
.coverage-legend-gradient { display: inline-block; width: 48px; height: 7px; border-radius: 999px; }
.coverage-legend-entry { gap: 4px; white-space: nowrap; }
.coverage-legend-swatch { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
main {
  min-height: 0; display: grid;
  grid-template-columns: clamp(260px, 18vw, 340px) minmax(0, 1fr) clamp(300px, 20vw, 380px);
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas: "files graph details" "files controls details";
}
#files {
  grid-area: files; display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0;
  border-right: 1px solid #25303b; background: #111821; overflow: hidden;
}
.findings-panel, .diagnostic-panel, #project-files-panel { min-height: 0; overflow: auto; padding: 18px; }
#graph { grid-area: graph; position: relative; min-width: 0; background: #0d1117; }
#details { grid-area: details; border-left: 1px solid #25303b; background: #111821; overflow: auto; padding: 18px; }
#files h2, .report-controls h2 {
  margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #8fa3b8;
}
.sidebar-tabs { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; margin: 14px 18px 0; padding: 3px; border-radius: 7px; background: #0d141c; }
.sidebar-tabs[hidden], .findings-panel[hidden], .diagnostic-panel[hidden], #project-files-panel[hidden] { display: none; }
.sidebar-tabs button {
  border: 1px solid transparent; border-radius: 5px; padding: 7px 8px; background: transparent; color: #8fa3b8;
  font: 600 11px Inter, ui-sans-serif, system-ui, sans-serif; cursor: pointer;
}
.sidebar-tabs button[aria-selected="true"] { border-color: #42556a; background: #17202a; color: #f5f9ff; }
.sidebar-tabs button:hover, .sidebar-tabs button:focus-visible { border-color: #79b8ff; color: #f5f9ff; outline: none; }
.findings-intro, .findings-empty { margin: 0 0 16px; color: #8fa3b8; font-size: 11px; line-height: 1.5; }
#findings-categories { display: grid; gap: 20px; }
#findings-categories[hidden], .findings-empty[hidden] { display: none; }
.finding-category h3 {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 8px;
  color: #d3dee9; font-size: 11px; line-height: 1.35;
}
.finding-category-count {
  min-width: 20px; border-radius: 999px; padding: 2px 6px; background: #25303b; color: #8fa3b8;
  font-size: 10px; font-variant-numeric: tabular-nums; text-align: center;
}
.finding-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.finding-list li[hidden] { display: none; }
.finding-card {
  display: grid; gap: 4px; width: 100%; border: 1px solid #25303b; border-radius: 7px; padding: 9px 10px;
  background: #0d141c; color: #aebdca; text-align: left; cursor: pointer;
}
.finding-card:hover, .finding-card:focus-visible { border-color: #79b8ff; background: #162230; outline: none; }
.finding-card[aria-current="true"] { border-color: #79b8ff; background: #172638; }
.finding-entity {
  overflow: hidden; color: #f5f9ff; font: 600 11px ui-monospace, SFMono-Regular, Consolas, monospace;
  text-overflow: ellipsis; white-space: nowrap;
}
.finding-metrics { color: #79b8ff; font-size: 10px; font-variant-numeric: tabular-nums; }
.finding-explanation { color: #8fa3b8; font-size: 10px; line-height: 1.45; }
.finding-list-toggle {
  margin-top: 7px; border: 0; padding: 3px 0; background: transparent; color: #79b8ff;
  font: 600 10px Inter, ui-sans-serif, system-ui, sans-serif; cursor: pointer;
}
.finding-list-toggle:hover, .finding-list-toggle:focus-visible { color: #b7d9ff; text-decoration: underline; outline: none; }
.diagnostic-filters { display: grid; gap: 10px; margin: 0 0 14px; padding: 12px; border: 1px solid #25303b; border-radius: 7px; }
.diagnostic-filters legend { padding: 0 5px; color: #8fa3b8; font-size: 10px; }
.diagnostic-filters label { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #aebdca; font-size: 10px; }
.diagnostic-filters input[type="number"] {
  width: 70px; border: 1px solid #344456; border-radius: 5px; padding: 5px 6px;
  background: #0d141c; color: #e7edf4; font: 11px ui-monospace, SFMono-Regular, Consolas, monospace;
}
.diagnostic-filters input:focus-visible { border-color: #79b8ff; outline: 1px solid #79b8ff; outline-offset: 1px; }
.diagnostic-filters input[type="checkbox"] { accent-color: #79b8ff; }
.diagnostic-counts { margin: 0 0 14px; padding: 0 2px; font-size: 10px; }
.diagnostic-results { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.diagnostic-results[hidden] { display: none; }
.diagnostic-result {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 8px; width: 100%;
  border: 1px solid #25303b; border-radius: 7px; padding: 9px 10px; background: #0d141c; color: #8fa3b8;
  font-size: 10px; font-variant-numeric: tabular-nums; text-align: left; cursor: pointer;
}
.diagnostic-result strong {
  grid-column: 1 / -1; overflow: hidden; color: #f5f9ff;
  font: 600 11px ui-monospace, SFMono-Regular, Consolas, monospace; text-overflow: ellipsis; white-space: nowrap;
}
.diagnostic-result:hover, .diagnostic-result:focus-visible { border-color: #79b8ff; background: #162230; outline: none; }
.diagnostic-result[aria-current="true"] { border-color: #79b8ff; background: #172638; }
.coupling-section { margin-top: 16px; }
.coupling-section h3 { margin: 0 0 8px; color: #d3dee9; font-size: 11px; }
.coupling-section[hidden] { display: none; }
.coupling-cycle-indicator { grid-column: 1 / -1; color: #c9a7f5; }
.boundary-complete-matrix {
  width: 100%; margin: 0 0 12px; border: 1px solid #42556a; border-radius: 6px; padding: 7px 9px;
  background: #172638; color: #b7d9ff; font: 600 10px Inter, ui-sans-serif, system-ui, sans-serif; cursor: pointer;
}
.boundary-complete-matrix[hidden], .boundary-matrix-scroll[hidden] { display: none; }
.boundary-matrix-scroll { max-width: 100%; overflow: auto; padding-bottom: 5px; }
.boundary-matrix { border-collapse: separate; border-spacing: 3px; min-width: 100%; font-size: 9px; }
.boundary-matrix caption { margin-bottom: 8px; color: #8fa3b8; text-align: left; font-size: 10px; }
.boundary-matrix th { max-width: 92px; color: #8fa3b8; font-weight: 600; text-align: left; }
.boundary-matrix th button {
  max-width: 92px; border: 1px solid transparent; border-radius: 4px; padding: 5px; background: transparent; color: #aebdca;
  overflow: hidden; font: 600 9px ui-monospace, SFMono-Regular, Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
}
.boundary-matrix th button:hover, .boundary-matrix th button:focus-visible, .boundary-matrix th button[aria-current="true"] {
  border-color: #79b8ff; background: #172638; color: #f5f9ff; outline: none;
}
.boundary-cell { min-width: 48px; border-radius: 4px; text-align: center; font-variant-numeric: tabular-nums; }
.boundary-cell-self { background: #19232d; }
.boundary-cell-cross { background: #101b27; box-shadow: inset 0 0 0 1px #263c52; }
.boundary-cell > button {
  display: grid; gap: 2px; width: 100%; border: 1px solid transparent; border-radius: 4px; padding: 5px 3px;
  background: transparent; color: #aebdca; font: 9px ui-monospace, SFMono-Regular, Consolas, monospace; cursor: pointer;
}
.boundary-cell > button:hover, .boundary-cell > button:focus-visible, .boundary-cell > button[aria-current="true"] {
  border-color: #79b8ff; background: #17304a; color: #f5f9ff; outline: none;
}
.file-search { display: grid; gap: 6px; margin-bottom: 8px; color: #8fa3b8; font-size: 11px; }
.file-search input {
  width: 100%; border: 1px solid #344456; border-radius: 5px; padding: 8px 9px;
  background: #0d141c; color: #e7edf4; font: 11px ui-monospace, SFMono-Regular, Consolas, monospace;
}
.file-search input::placeholder { color: #6f8295; }
.file-search input:focus-visible { border-color: #79b8ff; outline: 1px solid #79b8ff; outline-offset: 1px; }
.file-search-result-count { margin: 0 0 12px; color: #8fa3b8; font-size: 11px; font-variant-numeric: tabular-nums; }
.file-tree-empty { margin: 4px 0 0; color: #8fa3b8; font-size: 11px; line-height: 1.5; }
.file-tree-empty[hidden], .file-search-result-count[hidden], .file-list[hidden], .selected-tree-section[hidden] { display: none; }
.selected-tree-section { margin-top: 18px; padding-top: 14px; border-top: 1px solid #25303b; }
.selected-tree-section h3 { margin: 0 0 7px; color: #8fa3b8; font-size: 11px; }
.report-controls h2 { margin: 0; padding-right: 18px; border-right: 1px solid #25303b; white-space: nowrap; }
#details h3 { margin: 16px 0 7px; font-size: 11px; color: #8fa3b8; }
#selected-empty { color: #6f8295; line-height: 1.5; }
#selected-details[hidden], #selected-cycle-details[hidden], #selected-boundary-details[hidden], #external-package-section[hidden], [data-project-file-detail][hidden], [data-dependency-detail][hidden], [data-directory-detail][hidden], [data-coupling-detail][hidden] { display: none; }
.node-type { color: #c9a7f5; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.node-type { margin-bottom: 6px; }
.detail-path { overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; line-height: 1.45; }
dl { display: grid; grid-template-columns: 1fr auto; gap: 7px 16px; margin: 16px 0 22px; font-size: 12px; }
dt { color: #8fa3b8; } dd { margin: 0; font-variant-numeric: tabular-nums; }
.file-list { display: grid; gap: 5px; padding: 0; margin: 0; list-style: none; }
.file-tree-children { display: grid; gap: 3px; margin: 3px 0 0 9px; padding: 0 0 0 9px; border-left: 1px solid #25303b; list-style: none; }
.file-tree-children[hidden] { display: none; }
.file-tree-directory-row { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 3px; }
.file-list button {
  width: 100%; border: 1px solid transparent; border-radius: 5px; padding: 7px 8px;
  background: transparent; color: #aebdca; text-align: left; font: 11px ui-monospace, SFMono-Regular, Consolas, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
}
.file-list .file-tree-directory-disclosure { padding: 7px 6px; color: #8fa3b8; text-align: center; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
.file-tree-directory-disclosure::before { content: "▾"; }
.file-tree-directory-disclosure[aria-expanded="false"]::before { content: "▸"; }
.file-list .file-tree-directory-select { color: #d3dee9; font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-weight: 600; }
.file-list button:hover, .file-list button:focus-visible { border-color: #42556a; background: #18222d; outline: none; }
.relationship-list { margin-bottom: 10px; }
.relationship-empty { padding: 5px 8px; color: #6f8295; font-size: 11px; }
.boundary-relationship-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.boundary-relationship-list[hidden], #selected-boundary-empty[hidden] { display: none; }
.boundary-relationship {
  display: grid; gap: 4px; border: 1px solid #25303b; border-radius: 6px; padding: 7px; background: #0d141c;
}
.boundary-relationship span { color: #79b8ff; font-size: 9px; text-transform: uppercase; }
.boundary-relationship button {
  border: 0; padding: 0; background: transparent; color: #d3dee9; overflow-wrap: anywhere;
  font: 10px ui-monospace, SFMono-Regular, Consolas, monospace; text-align: left; cursor: pointer;
}
.boundary-relationship button:hover, .boundary-relationship button:focus-visible { color: #79b8ff; outline: none; text-decoration: underline; }
.file-list button[aria-current="true"] { border-color: #79b8ff; color: #f5f9ff; background: #172638; }
.node-kind-label { display: block; margin-top: 2px; color: #c9a7f5; font: 9px ui-sans-serif, system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
.package-swatch { display: inline-block; width: 9px; height: 9px; margin-right: 6px; border: 2px solid #f0ddff; border-radius: 50%; background: #c084fc; }
#external-package-section { margin-top: 20px; }
.selection-navigation { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; margin-bottom: 18px; }
.selection-history { display: flex; gap: 3px; }
.selection-navigation button, .selection-breadcrumb button {
  border: 1px solid #344456; border-radius: 5px; padding: 5px 7px; background: #17202a; color: #d3dee9;
  font: 600 10px Inter, ui-sans-serif, system-ui, sans-serif; cursor: pointer;
}
.selection-navigation button:disabled { color: #5f7182; cursor: default; opacity: .7; }
.selection-navigation button:not(:disabled):hover, .selection-navigation button:not(:disabled):focus-visible,
.selection-breadcrumb button:hover, .selection-breadcrumb button:focus-visible { border-color: #79b8ff; outline: none; }
.selection-breadcrumb { display: flex; align-items: center; gap: 4px; min-width: 0; color: #6f8295; font-size: 10px; line-height: 1.5; flex-wrap: wrap; }
.selection-breadcrumb button { width: auto; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.selection-breadcrumb-separator { color: #50677d; }
.selection-breadcrumb-current { overflow-wrap: anywhere; color: #d3dee9; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
`
