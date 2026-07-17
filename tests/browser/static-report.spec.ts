import { execFile } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { Result } from "@guillaume-docquier/tools-ts"
import { expect, test } from "@playwright/test"
import { analyzeProject } from "../../src/analysis/analyze-project.js"
import { importIstanbulCoverage } from "../../src/coverage/import-istanbul-coverage.js"
import { buildHtmlReport } from "../../src/report/build-html-report.js"
import { fixtureProjectPath } from "../../src/testing/fixture-project.js"
import { withTemporaryDirectory } from "../../src/testing/temporary-directory.js"

const execFileAsync = promisify(execFile)

test("supports graph hover, selection, clearing, and side-panel navigation", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    // Arrange
    const projectDirectory = join(temporaryDirectory, "project")
    const longPath = "fixtures/projects/minimal-typescript/src/index.ts"
    const longPathNodeId = "project-file:" + longPath
    const sourceDirectory = join(projectDirectory, "fixtures", "projects", "minimal-typescript", "src")
    await mkdir(sourceDirectory, { recursive: true })
    await writeFile(join(sourceDirectory, "index.ts"), "// comment\n\nexport const message = 'hello'\n\n", "utf8")

    const analysis = await analyzeProject({ projectRoot: projectDirectory })
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
    await expect(page.locator("html")).toHaveAttribute("data-hovered-node", longPathNodeId)
    const tooltip = page.locator("#tooltip")
    await expect(tooltip).toBeVisible()
    const tooltipPath = tooltip.locator("strong")
    await expect(tooltipPath).toHaveText("...ures/projects/minimal-typescript/src/index.ts")
    await expect(tooltip.locator(".tooltip-metrics")).toContainText("Code")
    await expect(tooltip.locator(".tooltip-metrics")).toContainText("Comments")
    await expect(tooltip.locator(".tooltip-metrics")).toContainText("Blank")
    expect(await tooltipPath.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    const tooltipBounds = await tooltip.boundingBox()
    if (tooltipBounds === null) {
      throw new Error("Tooltip did not have browser bounds.")
    }
    expect(Math.abs(tooltipBounds.x - (centerX + 14))).toBeLessThanOrEqual(1)
    expect(Math.abs(tooltipBounds.y - (centerY + 14))).toBeLessThanOrEqual(1)

    await page.mouse.click(centerX, centerY)
    await expect(page.locator("html")).toHaveAttribute("data-selected-node", longPathNodeId)
    await expect(page.locator("#selected-path")).toHaveText(longPath)
    await expect(page.locator("#selected-details dt").first()).toHaveText("Code lines")
    await expect(page.locator("#selected-code-lines")).toHaveText("1")
    await expect(page.locator("#selected-comment-lines")).toHaveText("1")
    await expect(page.locator("#selected-blank-lines")).toHaveText("2")

    const codeControl = page.getByRole("checkbox", { name: "Code" })
    const commentControl = page.getByRole("checkbox", { name: "Comments" })
    const blankControl = page.getByRole("checkbox", { name: "Blank" })
    await expect(codeControl).toBeChecked()
    await expect(codeControl).toBeDisabled()
    await expect(commentControl).not.toBeChecked()
    await expect(blankControl).not.toBeChecked()
    const initialLayoutSignature = await graph.getAttribute("data-layout-signature")
    const seenStates = new Set<string>()
    const recordState = async (state: string): Promise<void> => {
      await expect(page.locator("html")).toHaveAttribute("data-active-line-categories", state)
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", longPathNodeId)
      seenStates.add(state)
    }
    await recordState("code")
    await commentControl.check()
    await recordState("code,comment")
    expect(await graph.getAttribute("data-layout-signature")).not.toBe(initialLayoutSignature)
    await blankControl.check()
    await recordState("code,comment,blank")
    await codeControl.uncheck()
    await recordState("comment,blank")
    await commentControl.uncheck()
    await recordState("blank")
    await codeControl.check()
    await recordState("code,blank")
    await commentControl.check()
    await codeControl.uncheck()
    await blankControl.uncheck()
    await recordState("comment")
    await codeControl.check()
    await commentControl.uncheck()
    await recordState("code")
    expect([...seenStates].sort()).toEqual([
      "blank",
      "code",
      "code,blank",
      "code,comment",
      "code,comment,blank",
      "comment",
      "comment,blank",
    ])
    await expect(graph).toHaveAttribute("data-layout-signature", initialLayoutSignature ?? "")
    await expect(codeControl).toBeDisabled()

    await page.getByRole("button", { name: "Clear selection" }).click()
    await expect(page.locator("html")).not.toHaveAttribute("data-selected-node", /.+/u)

    await page.getByRole("button", { name: longPath }).click()
    await expect(page.locator("html")).toHaveAttribute("data-selected-node", longPathNodeId)
    await expect(page.getByRole("button", { name: longPath })).toHaveAttribute("aria-current", "true")
  })
})

test("keeps packages hidden by default and rebuilds one combined metric and package view", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    // Arrange
    const analysis = await analyzeProject({ projectRoot: fixtureProjectPath("external-packages") })
    if (Result.isFailure(analysis)) {
      throw new Error(`Fixture analysis failed: ${analysis.error._tag}`)
    }
    const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
    const reportPath = join(temporaryDirectory, "external-packages.html")
    const fileOnlyReportPath = join(temporaryDirectory, "file-only.html")
    await writeFile(reportPath, buildHtmlReport(analysis.value, browserBundle), "utf8")
    await writeFile(
      fileOnlyReportPath,
      buildHtmlReport({ ...analysis.value, externalPackages: [], externalPackageDependencies: [] }, browserBundle),
      "utf8",
    )

    // Act
    await page.goto(pathToFileURL(reportPath).href)
    await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")

    // Assert default-hidden state and file-only geometry
    const graph = page.locator("#graph")
    const externalPackages = page.getByRole("checkbox", { name: "External packages" })
    await expect(externalPackages).not.toBeChecked()
    await expect(page.locator("html")).toHaveAttribute("data-external-packages", "hidden")
    await expect(graph).toHaveAttribute("data-visible-node-count", "4")
    await expect(page.locator("#external-package-section")).toBeHidden()
    await expect(page.locator("#external-package-list button")).toHaveCount(0)
    const defaultLayoutSignature = await graph.getAttribute("data-layout-signature")
    await page.locator("#file-list").getByRole("button", { name: "src/entry.ts", exact: true }).click()
    await expect(page.locator("#selected-imports")).toHaveText("2")
    await expect(page.locator("#selected-imported-files button")).toHaveText(["src/alias/value.ts", "src/aliased.ts"])

    // Enable packages and combine that visibility with a line-metric transition.
    await externalPackages.check()
    await expect(page.locator("html")).toHaveAttribute("data-external-packages", "visible")
    await expect(graph).toHaveAttribute("data-visible-node-count", "6")
    await expect(page.locator("#external-package-section")).toBeVisible()
    await expect(page.locator("#external-package-list button")).toHaveCount(2)
    await expect(page.locator("#selected-imports")).toHaveText("4")
    await expect(page.locator("#selected-imported-files button")).toHaveCount(4)
    await expect(page.locator("#selected-imported-files")).toContainText("External package")
    expect(await graph.getAttribute("data-layout-signature")).not.toBe(defaultLayoutSignature)

    const reactPackage = page.locator("#external-package-list button").filter({ hasText: "react" })
    await reactPackage.click()
    await expect(page.locator("html")).toHaveAttribute("data-selected-node", "external-package:react")
    await expect(page.locator("#selected-heading")).toHaveText("Selected external package")
    await expect(page.locator("#selected-node-type")).toHaveText("External package")
    await expect(page.locator("#selected-path")).toHaveText("react")
    await expect(page.locator("#selected-consumers")).toHaveText("2")
    await expect(page.locator("#selected-code-lines")).toBeHidden()

    const commentControl = page.getByRole("checkbox", { name: "Comments" })
    await commentControl.check()
    await expect(page.locator("html")).toHaveAttribute("data-active-line-categories", "code,comment")
    await expect(page.locator("html")).toHaveAttribute("data-external-packages", "visible")
    await expect(page.locator("html")).toHaveAttribute("data-selected-node", "external-package:react")
    await commentControl.uncheck()

    // Hiding a selected package clears it and restores exact file-only geometry.
    await externalPackages.uncheck()
    await expect(page.locator("html")).toHaveAttribute("data-external-packages", "hidden")
    await expect(page.locator("html")).not.toHaveAttribute("data-selected-node", /.+/u)
    await expect(graph).toHaveAttribute("data-layout-signature", defaultLayoutSignature ?? "")

    await page.goto(pathToFileURL(fileOnlyReportPath).href)
    await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
    await expect(page.locator("#graph")).toHaveAttribute("data-layout-signature", defaultLayoutSignature ?? "")
  })
})

test("shows imported and consumer project files in the selected-node side panel", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    // Arrange
    const analysis = await analyzeProject({ projectRoot: fixtureProjectPath("static-esm") })
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
    const analysis = await analyzeProject({ projectRoot: projectDirectory })
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

test("opens an empty report generated by the built CLI and real browser bundle", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    // Arrange
    const projectDirectory = join(temporaryDirectory, "empty-project")
    const reportPath = join(temporaryDirectory, "empty-report.html")
    await mkdir(projectDirectory)
    const cliPath = join(process.cwd(), "dist", "cli", "entry.cli.js")
    const pageErrors: string[] = []
    page.on("pageerror", (error) => {
      pageErrors.push(error.message)
    })

    // Act
    const execution = await execFileAsync(process.execPath, [cliPath, projectDirectory, "--output", reportPath], {
      cwd: temporaryDirectory,
    })
    await page.goto(pathToFileURL(reportPath).href)

    // Assert
    expect(execution.stderr).toBe("")
    expect(execution.stdout).toContain("Report written to " + reportPath)
    await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
    await expect(page.locator("header p")).toHaveText("0 project files")
    await expect(page.locator("#selected-empty")).toBeVisible()
    await expect(page.locator("#file-list button")).toHaveCount(0)
    expect(pageErrors).toEqual([])
  })
})
