import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Result } from "@guillaume-docquier/tools-ts"
import { expect, test } from "@playwright/test"
import { analyzeProject } from "../../src/analysis/analyze-project.js"
import { buildHtmlReport } from "../../src/report/build-html-report.js"
import { fixtureProjectPath } from "../../src/testing/fixture-project.js"
import { withTemporaryDirectory } from "../../src/testing/temporary-directory.js"

test("supports graph hover, selection, clearing, and side-panel navigation", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    // Arrange
    const analysis = await analyzeProject(fixtureProjectPath("minimal-javascript"))
    if (Result.isFailure(analysis)) {
      throw new Error(`Fixture analysis failed: ${analysis.error._tag}`)
    }
    const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
    const reportPath = join(temporaryDirectory, "show-me.html")
    await writeFile(reportPath, buildHtmlReport(analysis.value, browserBundle), "utf8")

    // Act
    await page.goto(pathToFileURL(reportPath).href)
    await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
    const graph = page.locator("#graph")
    const bounds = await graph.boundingBox()
    if (bounds === null) {
      throw new Error("Graph did not have browser bounds.")
    }
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2
    await page.mouse.move(centerX, centerY)

    // Assert
    await expect(page.locator("html")).toHaveAttribute("data-hovered-node", "index.js")
    const tooltip = page.locator("#tooltip")
    await expect(tooltip).toBeVisible()
    const tooltipBounds = await tooltip.boundingBox()
    if (tooltipBounds === null) {
      throw new Error("Tooltip did not have browser bounds.")
    }
    expect(Math.abs(tooltipBounds.x - (centerX + 14))).toBeLessThanOrEqual(1)
    expect(Math.abs(tooltipBounds.y - (centerY + 14))).toBeLessThanOrEqual(1)

    await page.mouse.click(centerX, centerY)
    await expect(page.locator("html")).toHaveAttribute("data-selected-node", "index.js")
    await expect(page.locator("#selected-path")).toHaveText("index.js")

    await page.getByRole("button", { name: "Clear selection" }).click()
    await expect(page.locator("html")).not.toHaveAttribute("data-selected-node", /.+/u)

    await page.getByRole("button", { name: "index.js" }).click()
    await expect(page.locator("html")).toHaveAttribute("data-selected-node", "index.js")
    await expect(page.getByRole("button", { name: "index.js" })).toHaveAttribute("aria-current", "true")
  })
})
