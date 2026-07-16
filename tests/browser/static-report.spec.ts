import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Result } from "@guillaume-docquier/tools-ts"
import { expect, test } from "@playwright/test"
import { analyzeProject } from "../../src/analysis/analyze-project.js"
import { importIstanbulCoverage } from "../../src/coverage/import-istanbul-coverage.js"
import { buildHtmlReport } from "../../src/report/build-html-report.js"
import { fixtureProjectPath } from "../../src/testing/fixture-project.js"
import { withTemporaryDirectory } from "../../src/testing/temporary-directory.js"

test("supports graph hover, selection, clearing, and side-panel navigation", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    // Arrange
    const projectDirectory = join(temporaryDirectory, "project")
    const longPath = "fixtures/projects/minimal-typescript/src/index.ts"
    const sourceDirectory = join(projectDirectory, "fixtures", "projects", "minimal-typescript", "src")
    await mkdir(sourceDirectory, { recursive: true })
    await writeFile(join(sourceDirectory, "index.ts"), "export const message = 'hello'\n", "utf8")

    const analysis = await analyzeProject(projectDirectory)
    if (Result.isFailure(analysis)) {
      throw new Error(`Fixture analysis failed: ${analysis.error._tag}`)
    }
    const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
    const reportPath = join(temporaryDirectory, "show-me.html")
    await writeFile(reportPath, buildHtmlReport(analysis.value, browserBundle), "utf8")

    // Act
    await page.goto(pathToFileURL(reportPath).href)
    await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve()
          })
        })
      })
    })
    const graph = page.locator("#graph")
    const bounds = await graph.boundingBox()
    if (bounds === null) {
      throw new Error("Graph did not have browser bounds.")
    }
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2
    await page.mouse.move(centerX, centerY)

    // Assert
    await expect(page.locator("html")).toHaveAttribute("data-hovered-node", longPath)
    const tooltip = page.locator("#tooltip")
    await expect(tooltip).toBeVisible()
    const tooltipPath = tooltip.locator("strong")
    await expect(tooltipPath).toHaveText("...ures/projects/minimal-typescript/src/index.ts")
    expect(await tooltipPath.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    const tooltipBounds = await tooltip.boundingBox()
    if (tooltipBounds === null) {
      throw new Error("Tooltip did not have browser bounds.")
    }
    expect(Math.abs(tooltipBounds.x - (centerX + 14))).toBeLessThanOrEqual(1)
    expect(Math.abs(tooltipBounds.y - (centerY + 14))).toBeLessThanOrEqual(1)

    await page.mouse.click(centerX, centerY)
    await expect(page.locator("html")).toHaveAttribute("data-selected-node", longPath)
    await expect(page.locator("#selected-path")).toHaveText(longPath)

    await page.getByRole("button", { name: "Clear selection" }).click()
    await expect(page.locator("html")).not.toHaveAttribute("data-selected-node", /.+/u)

    await page.getByRole("button", { name: longPath }).click()
    await expect(page.locator("html")).toHaveAttribute("data-selected-node", longPath)
    await expect(page.getByRole("button", { name: longPath })).toHaveAttribute("aria-current", "true")
  })
})

test("shows imported and consumer project files in the selected-node side panel", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    // Arrange
    const analysis = await analyzeProject(fixtureProjectPath("static-esm"))
    if (Result.isFailure(analysis)) {
      throw new Error(`Fixture analysis failed: ${analysis.error._tag}`)
    }
    const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
    const reportPath = join(temporaryDirectory, "show-me.html")
    await writeFile(reportPath, buildHtmlReport(analysis.value, browserBundle), "utf8")

    // Act
    await page.goto(pathToFileURL(reportPath).href)
    await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
    await page.locator("#file-list").getByRole("button", { name: "src/main.ts", exact: true }).click()

    // Assert
    await expect(page.locator("#selected-imports")).toHaveText("7")
    await expect(page.locator("#selected-imported-files button")).toHaveText([
      "src/default-export.ts",
      "src/directory/index.ts",
      "src/lib/aliased.ts",
      "src/mixed.ts",
      "src/ordinary-type.ts",
      "src/runtime.ts",
      "src/side-effect.js",
    ])

    await page.locator("#selected-imported-files").getByRole("button", { name: "src/runtime.ts", exact: true }).click()
    await expect(page.locator("#selected-consumers")).toHaveText("2")
    await expect(page.locator("#selected-consumer-files button")).toHaveText(["src/main.ts", "src/reexports.ts"])
  })
})

test("shows numeric line coverage in the tooltip and selected-file side panel", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    // Arrange
    const projectDirectory = join(temporaryDirectory, "project")
    await mkdir(projectDirectory)
    await writeFile(join(projectDirectory, "index.ts"), "export const value = true\n", "utf8")
    const coverageFile = join(temporaryDirectory, "coverage-final.json")
    await writeFile(
      coverageFile,
      JSON.stringify({
        "index.ts": {
          path: "index.ts",
          statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 25 } } },
          s: { 0: 1 },
          fnMap: {},
          f: {},
          branchMap: {},
          b: {},
        },
      }),
      "utf8",
    )
    const analysis = await analyzeProject(projectDirectory)
    if (Result.isFailure(analysis)) {
      throw new Error(`Fixture analysis failed: ${analysis.error._tag}`)
    }
    const coveredAnalysis = await importIstanbulCoverage(analysis.value, projectDirectory, coverageFile)
    if (Result.isFailure(coveredAnalysis)) {
      throw new Error(`Fixture coverage import failed: ${coveredAnalysis.error._tag}`)
    }
    const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
    const reportPath = join(temporaryDirectory, "show-me.html")
    await writeFile(reportPath, buildHtmlReport(coveredAnalysis.value, browserBundle), "utf8")

    // Act
    await page.goto(pathToFileURL(reportPath).href)
    await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve()
          })
        })
      })
    })
    const graphBounds = await page.locator("#graph").boundingBox()
    if (graphBounds === null) {
      throw new Error("Graph did not have browser bounds.")
    }
    const centerX = graphBounds.x + graphBounds.width / 2
    const centerY = graphBounds.y + graphBounds.height / 2
    await page.mouse.move(centerX, centerY)

    // Assert
    const tooltip = page.locator("#tooltip")
    await expect(tooltip).toBeVisible()
    await expect(tooltip.locator(".tooltip-metrics")).toContainText("100%")
    await expect(tooltip.locator(".tooltip-metrics")).toContainText("Coverage")

    await page.mouse.click(centerX, centerY)
    await expect(page.locator("#selected-coverage")).toHaveText("100%")
  })
})
