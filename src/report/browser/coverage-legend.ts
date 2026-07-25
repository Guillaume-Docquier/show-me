import { COVERAGE_LEGEND_ENTRIES, coverageColor } from "./report-presentation.js"

/** Render the fixed line-coverage interpretation key. */
export function renderCoverageLegend(container: HTMLElement): void {
  const reportDocument = container.ownerDocument
  container.replaceChildren()
  const title = reportDocument.createElement("span")
  title.className = "coverage-legend-title"
  title.textContent = "Line coverage"
  const scale = reportDocument.createElement("span")
  scale.className = "coverage-legend-scale"
  const gradient = reportDocument.createElement("i")
  gradient.className = "coverage-legend-gradient"
  gradient.setAttribute("aria-hidden", "true")
  const coverageGradientColors = COVERAGE_LEGEND_ENTRIES.filter(({ coverage }) => coverage !== undefined).map(({ coverage }) =>
    coverageColor(coverage),
  )
  gradient.style.backgroundImage = `linear-gradient(to right, ${coverageGradientColors.join(", ")})`
  scale.append(gradient)
  container.append(title, scale)

  for (const entry of COVERAGE_LEGEND_ENTRIES) {
    const label = reportDocument.createElement("span")
    label.className = "coverage-legend-entry"
    label.dataset.coverageLegendEntry = entry.id
    const swatch = reportDocument.createElement("i")
    swatch.className = "coverage-legend-swatch"
    swatch.setAttribute("aria-hidden", "true")
    swatch.style.backgroundColor = coverageColor(entry.coverage)
    label.append(swatch, reportDocument.createTextNode(entry.label))
    container.append(label)
  }
}
