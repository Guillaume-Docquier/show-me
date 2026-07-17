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
  display: flex; align-items: center; justify-content: space-between;
  gap: 24px; padding: 14px 20px; border-bottom: 1px solid #25303b;
  background: #111821;
}
h1 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: 0.01em; }
header p { margin: 0; color: #8fa3b8; font-size: 12px; }
.report-heading { display: flex; align-items: baseline; gap: 14px; min-width: 0; }
#line-category-controls {
  display: flex; align-items: center; gap: 12px; margin: 0; padding: 0; border: 0;
  color: #aebdca; font-size: 11px;
}
#line-category-controls legend { float: left; margin-right: 2px; color: #8fa3b8; }
#line-category-controls label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
#line-category-controls label:has(input:disabled) { color: #6f8295; cursor: default; }
#line-category-controls input { accent-color: #79b8ff; }
main { min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 320px; }
#graph { position: relative; min-width: 0; background: #0d1117; }
#details { border-left: 1px solid #25303b; background: #111821; overflow: auto; padding: 18px; }
#details h2 { margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #8fa3b8; }
#details h3 { margin: 16px 0 7px; font-size: 11px; color: #8fa3b8; }
#selected-empty { color: #6f8295; line-height: 1.5; }
#selected-details[hidden], #tooltip[hidden] { display: none; }
.detail-path { overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; line-height: 1.45; }
dl { display: grid; grid-template-columns: 1fr auto; gap: 7px 16px; margin: 16px 0 22px; font-size: 12px; }
dt { color: #8fa3b8; } dd { margin: 0; font-variant-numeric: tabular-nums; }
.file-list { display: grid; gap: 5px; padding: 0; margin: 0; list-style: none; }
.file-list button {
  width: 100%; border: 1px solid transparent; border-radius: 5px; padding: 7px 8px;
  background: transparent; color: #aebdca; text-align: left; font: 11px ui-monospace, SFMono-Regular, Consolas, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
}
.file-list button:hover, .file-list button:focus-visible { border-color: #42556a; background: #18222d; outline: none; }
.relationship-list { margin-bottom: 10px; }
.relationship-empty { padding: 5px 8px; color: #6f8295; font-size: 11px; }
.file-list button[aria-current="true"] { border-color: #79b8ff; color: #f5f9ff; background: #172638; }
#tooltip {
  position: fixed; z-index: 10; pointer-events: none; width: min(360px, calc(100vw - 24px));
  padding: 10px 12px; border: 1px solid #42556a; border-radius: 5px;
  background: rgba(17, 24, 33, 0.96); box-shadow: 0 10px 35px rgba(0,0,0,.35); font-size: 11px;
}
#tooltip strong { display: block; margin-bottom: 7px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
.tooltip-metrics { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 9px; color: #8fa3b8; }
.tooltip-metrics span { display: block; color: #e7edf4; font-variant-numeric: tabular-nums; }
.clear-selection {
  width: 100%; margin: 0 0 22px; border: 1px solid #42556a; border-radius: 5px; padding: 7px 9px;
  background: transparent; color: #aebdca; font: inherit; cursor: pointer;
}
.clear-selection:hover, .clear-selection:focus-visible { background: #18222d; color: #f5f9ff; outline: none; }
.clear-selection[hidden] { display: none; }
@media (max-width: 760px) { main { grid-template-columns: 1fr; } #details { display: none; } }
@media (max-width: 640px) { header { align-items: flex-start; flex-direction: column; gap: 8px; } }
`
