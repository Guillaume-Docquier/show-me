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
.report-control-groups, #line-category-controls, #graph-content-controls, #workspace-package-fieldset, #workspace-package-controls {
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
.graph-control-button {
  border: 1px solid #42556a; border-radius: 5px; padding: 6px 9px;
  background: #17202a; color: #d3dee9; font: 600 11px Inter, ui-sans-serif, system-ui, sans-serif; cursor: pointer;
}
.graph-control-button:hover, .graph-control-button:focus-visible {
  border-color: #79b8ff; background: #1b2b3d; color: #f5f9ff; outline: none;
}
.graph-key, .graph-key span { display: flex; align-items: center; gap: 6px; }
.graph-key { gap: 12px; color: #8fa3b8; }
.graph-edge-swatch { display: inline-block; width: 18px; }
.structure-edge-swatch { height: 0; border-top: 1px dashed #6f8295; }
.dependency-edge-swatch { height: 2px; background: rgba(98, 139, 181, 0.32); }
.external-dependency-edge-swatch { height: 2px; background: rgba(154, 104, 193, 0.38); }
.type-only-dependency-edge-swatch { height: 2px; background: rgba(45, 212, 191, 0.5); }
.coverage-legend, .coverage-legend-scale, .coverage-legend-entry { display: flex; align-items: center; }
.coverage-legend { gap: 8px; color: #8fa3b8; font-size: 11px; }
.coverage-legend-title { color: #8fa3b8; }
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
#files { grid-area: files; border-right: 1px solid #25303b; background: #111821; overflow: auto; padding: 18px; }
#graph { grid-area: graph; position: relative; min-width: 0; background: #0d1117; }
#details { grid-area: details; border-left: 1px solid #25303b; background: #111821; overflow: auto; padding: 18px; }
#files h2, .report-controls h2 {
  margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #8fa3b8;
}
.file-search { display: grid; gap: 6px; margin-bottom: 14px; color: #8fa3b8; font-size: 11px; }
.file-search input {
  width: 100%; border: 1px solid #344456; border-radius: 5px; padding: 8px 9px;
  background: #0d141c; color: #e7edf4; font: 11px ui-monospace, SFMono-Regular, Consolas, monospace;
}
.file-search input::placeholder { color: #6f8295; }
.file-search input:focus-visible { border-color: #79b8ff; outline: 1px solid #79b8ff; outline-offset: 1px; }
.file-tree-empty { margin: 4px 0 0; color: #8fa3b8; font-size: 11px; line-height: 1.5; }
.file-tree-empty[hidden], .file-list[hidden] { display: none; }
.report-controls h2 { margin: 0; padding-right: 18px; border-right: 1px solid #25303b; white-space: nowrap; }
#details h3 { margin: 16px 0 7px; font-size: 11px; color: #8fa3b8; }
#selected-empty { color: #6f8295; line-height: 1.5; }
#selected-details[hidden], #external-package-section[hidden], [data-project-file-detail][hidden], [data-dependency-detail][hidden], [data-directory-detail][hidden] { display: none; }
.node-type { color: #c9a7f5; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.node-type { margin-bottom: 6px; }
.detail-path { overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; line-height: 1.45; }
dl { display: grid; grid-template-columns: 1fr auto; gap: 7px 16px; margin: 16px 0 22px; font-size: 12px; }
dt { color: #8fa3b8; } dd { margin: 0; font-variant-numeric: tabular-nums; }
.file-list { display: grid; gap: 5px; padding: 0; margin: 0; list-style: none; }
.file-tree-children { display: grid; gap: 3px; margin: 3px 0 0 9px; padding: 0 0 0 9px; border-left: 1px solid #25303b; list-style: none; }
.file-tree-children[hidden] { display: none; }
.file-list button {
  width: 100%; border: 1px solid transparent; border-radius: 5px; padding: 7px 8px;
  background: transparent; color: #aebdca; text-align: left; font: 11px ui-monospace, SFMono-Regular, Consolas, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
}
.file-list .file-tree-directory-toggle { color: #d3dee9; font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-weight: 600; }
.file-tree-directory-toggle::before { display: inline-block; width: 12px; margin-right: 3px; color: #6f8295; content: "▾"; }
.file-tree-directory-toggle[aria-expanded="false"]::before { content: "▸"; }
.file-list button:hover, .file-list button:focus-visible { border-color: #42556a; background: #18222d; outline: none; }
.relationship-list { margin-bottom: 10px; }
.relationship-empty { padding: 5px 8px; color: #6f8295; font-size: 11px; }
.file-list button[aria-current="true"] { border-color: #79b8ff; color: #f5f9ff; background: #172638; }
.node-kind-label { display: block; margin-top: 2px; color: #c9a7f5; font: 9px ui-sans-serif, system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
.package-swatch { display: inline-block; width: 9px; height: 9px; margin-right: 6px; border: 2px solid #f0ddff; border-radius: 50%; background: #c084fc; }
#external-package-section { margin-top: 20px; }
`
