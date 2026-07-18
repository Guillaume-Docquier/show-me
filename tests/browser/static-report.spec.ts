import { execFile } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { Assert } from "@guillaume-docquier/tools-ts"
import { expect, test } from "@playwright/test"
import { analyzeProject } from "../../src/analysis/analyze-project.js"
import { buildHtmlReport } from "../../src/report/build-html-report.js"
import { fixtureProjectPath } from "../../src/testing/fixture-project.js"
import { withTemporaryDirectory } from "../../src/testing/temporary-directory.js"

const execFileAsync = promisify(execFile)

test("supports graph hover, selection, clearing, and side-panel navigation", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const report = await test.step("Generate a raw-analysis report with a long project path", async () => {
      const projectDirectory = join(temporaryDirectory, "project")
      const longPath = "fixtures/projects/minimal-typescript/src/index.ts"
      const sourceDirectory = join(projectDirectory, "fixtures", "projects", "minimal-typescript", "src")
      await mkdir(sourceDirectory, { recursive: true })
      await writeFile(join(sourceDirectory, "index.ts"), "// comment\n\nexport const message = 'hello'\n\n", "utf8")
      const analysis = await analyzeProject({ projectRoot: projectDirectory })
      Assert.isSuccess(analysis)
      const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
      const reportPath = join(temporaryDirectory, "show-me.html")
      await writeFile(reportPath, buildHtmlReport(analysis.value, browserBundle), "utf8")
      return { reportPath, longPath, longPathNodeId: "project-file:" + longPath }
    })

    const pointer = await test.step("Open the report and inspect browser-derived heading and tooltip content", async () => {
      await page.goto(pathToFileURL(report.reportPath).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      await expect(page).toHaveTitle("project · Show Me")
      await expect(page.locator("#project-name")).toHaveText("project")
      await expect(page.locator("#project-file-count")).toHaveText("1 project files")
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-node-count", "1")
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-edge-count", "0")
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
      Assert.isDefined(bounds)
      const centerX = bounds.x + bounds.width / 2
      const centerY = bounds.y + bounds.height / 2
      await page.mouse.move(centerX, centerY)
      await expect(page.locator("html")).toHaveAttribute("data-hovered-node", report.longPathNodeId)
      const tooltip = page.locator("#tooltip")
      await expect(tooltip).toBeVisible()
      const tooltipPath = tooltip.locator("strong")
      await expect(tooltipPath).toHaveText("...ures/projects/minimal-typescript/src/index.ts")
      await expect(tooltip.locator(".tooltip-metrics")).toContainText("Code")
      await expect(tooltip.locator(".tooltip-metrics")).toContainText("Comments")
      await expect(tooltip.locator(".tooltip-metrics")).toContainText("Blank")
      expect(await tooltipPath.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
      const tooltipBounds = await tooltip.boundingBox()
      Assert.isDefined(tooltipBounds)
      expect(Math.abs(tooltipBounds.x - (centerX + 14))).toBeLessThanOrEqual(1)
      expect(Math.abs(tooltipBounds.y - (centerY + 14))).toBeLessThanOrEqual(1)
      return { centerX, centerY }
    })

    await test.step("Select the file and rebuild every non-empty line-category view", async () => {
      await page.mouse.click(pointer.centerX, pointer.centerY)
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", report.longPathNodeId)
      await expect(page.locator("#selected-path")).toHaveText(report.longPath)
      await expect(page.locator("#selected-code-lines")).toHaveText("1")
      await expect(page.locator("#selected-comment-lines")).toHaveText("1")
      await expect(page.locator("#selected-blank-lines")).toHaveText("2")

      const graph = page.locator("#graph")
      const codeControl = page.getByRole("checkbox", { name: "Code" })
      const commentControl = page.getByRole("checkbox", { name: "Comments" })
      const blankControl = page.getByRole("checkbox", { name: "Blank" })
      await expect(codeControl).toBeChecked()
      await expect(codeControl).toBeDisabled()
      const initialLayoutSignature = await graph.getAttribute("data-layout-signature")
      const seenStates = new Set<string>()
      const recordState = async (state: string): Promise<void> => {
        await expect(page.locator("html")).toHaveAttribute("data-active-line-categories", state)
        await expect(page.locator("html")).toHaveAttribute("data-selected-node", report.longPathNodeId)
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
    })

    await test.step("Clear selection and navigate back through the accessible file list", async () => {
      await page.getByRole("button", { name: "Clear selection" }).click()
      await expect(page.locator("html")).not.toHaveAttribute("data-selected-node", /.+/u)
      await page.getByRole("button", { name: report.longPath }).click()
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", report.longPathNodeId)
      await expect(page.getByRole("button", { name: report.longPath })).toHaveAttribute("aria-current", "true")
    })
  })
})

test("keeps packages hidden by default and rebuilds one combined metric and package view", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const pageErrors: string[] = []
    page.on("pageerror", (error) => {
      pageErrors.push(error.message)
    })
    const reports = await test.step("Generate package-aware and file-only reports from raw analysis", async () => {
      const analysis = await analyzeProject({ projectRoot: fixtureProjectPath("external-packages") })
      Assert.isSuccess(analysis)
      const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
      const reportPath = join(temporaryDirectory, "external-packages.html")
      const fileOnlyReportPath = join(temporaryDirectory, "file-only.html")
      await writeFile(reportPath, buildHtmlReport(analysis.value, browserBundle), "utf8")
      await writeFile(
        fileOnlyReportPath,
        buildHtmlReport({ ...analysis.value, externalPackages: [], externalPackageDependencies: [] }, browserBundle),
        "utf8",
      )
      return { reportPath, fileOnlyReportPath }
    })

    const defaultLayoutSignature = await test.step("Open the default file-only projection", async () => {
      await page.goto(pathToFileURL(reports.reportPath).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      const graph = page.locator("#graph")
      const externalPackages = page.getByRole("checkbox", { name: "External packages" })
      await expect(externalPackages).not.toBeChecked()
      await expect(page.locator("html")).toHaveAttribute("data-external-packages", "hidden")
      await expect(graph).toHaveAttribute("data-visible-node-count", "4")
      await expect(page.locator("#external-package-section")).toBeHidden()
      await expect(page.locator("#external-package-list button")).toHaveCount(0)
      const signature = await graph.getAttribute("data-layout-signature")
      await page.locator("#file-list").getByRole("button", { name: "src/entry.ts", exact: true }).click()
      await expect(page.locator("#selected-imports")).toHaveText("2")
      await expect(page.locator("#selected-imported-files button")).toHaveText(["src/alias/value.ts", "src/aliased.ts"])
      return signature
    })

    await test.step("Reveal packages and combine visibility with line-category sizing", async () => {
      const graph = page.locator("#graph")
      const externalPackages = page.getByRole("checkbox", { name: "External packages" })
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
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", "external-package:react")
      await commentControl.uncheck()
    })

    await test.step("Hide a selected package and restore exact file-only inputs", async () => {
      await page.getByRole("checkbox", { name: "External packages" }).uncheck()
      await expect(page.locator("html")).toHaveAttribute("data-external-packages", "hidden")
      await expect(page.locator("html")).not.toHaveAttribute("data-selected-node", /.+/u)
      await expect(page.locator("#graph")).toHaveAttribute("data-layout-signature", defaultLayoutSignature ?? "")
      await page.goto(pathToFileURL(reports.fileOnlyReportPath).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      await expect(page.locator("#graph")).toHaveAttribute("data-layout-signature", defaultLayoutSignature ?? "")
      expect(pageErrors).toEqual([])
    })
  })
})

test("derives project-file edges and relationship indexes in the browser", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const reportPath = await test.step("Generate the static-ESM report", async () => {
      const analysis = await analyzeProject({ projectRoot: fixtureProjectPath("static-esm") })
      Assert.isSuccess(analysis)
      const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
      const path = join(temporaryDirectory, "show-me.html")
      await writeFile(path, buildHtmlReport(analysis.value, browserBundle), "utf8")
      return path
    })

    await test.step("Inspect browser-derived import and consumer navigation", async () => {
      await page.goto(pathToFileURL(reportPath).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-edge-count", "13")
      await page.locator("#file-list").getByRole("button", { name: "src/main.ts", exact: true }).click()
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
})

test("derives covered, uncovered, partial, and missing-coverage colors in the browser", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const reportPath = await test.step("Generate a report containing all raw coverage states", async () => {
      const projectDirectory = join(temporaryDirectory, "project")
      await mkdir(projectDirectory)
      for (const path of ["covered.ts", "missing.ts", "partial.ts", "uncovered.ts"]) {
        await writeFile(join(projectDirectory, path), "export const value = true\n", "utf8")
      }
      const analysis = await analyzeProject({ projectRoot: projectDirectory })
      Assert.isSuccess(analysis)
      const coverageByPath = new Map([
        ["covered.ts", 100],
        ["partial.ts", 50],
        ["uncovered.ts", 0],
      ])
      const coveredAnalysis = {
        ...analysis.value,
        files: analysis.value.files.map((file) => {
          const coverage = coverageByPath.get(file.path)
          return { ...file, coverage: coverage === undefined ? undefined : { lines: coverage } }
        }),
      }
      const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
      const path = join(temporaryDirectory, "coverage.html")
      await writeFile(path, buildHtmlReport(coveredAnalysis, browserBundle), "utf8")
      return path
    })

    await test.step("Open the report and inspect colors derived from embedded analysis", async () => {
      await page.goto(pathToFileURL(reportPath).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      const serializedColors = await page.locator("#graph").getAttribute("data-visible-node-colors")
      Assert.isDefined(serializedColors)
      expect(JSON.parse(serializedColors)).toEqual([
        { id: "project-file:covered.ts", color: "#16a34a" },
        { id: "project-file:missing.ts", color: "#8fa3b8" },
        { id: "project-file:partial.ts", color: "#eab308" },
        { id: "project-file:uncovered.ts", color: "#dc2626" },
      ])
      await page.locator("#file-list").getByRole("button", { name: "covered.ts", exact: true }).click()
      await expect(page.locator("#selected-coverage")).toHaveText("100%")
      await page.locator("#file-list").getByRole("button", { name: "missing.ts", exact: true }).click()
      await expect(page.locator("#selected-coverage")).toHaveText("Not available")
    })
  })
})

test("opens an empty report generated by the built CLI and real browser bundle", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const pageErrors: string[] = []
    page.on("pageerror", (error) => {
      pageErrors.push(error.message)
    })
    const report = await test.step("Generate an empty report through the built CLI", async () => {
      const projectDirectory = join(temporaryDirectory, "empty-project")
      const reportPath = join(temporaryDirectory, "empty-report.html")
      await mkdir(projectDirectory)
      const cliPath = join(process.cwd(), "dist", "cli", "entry.cli.js")
      const execution = await execFileAsync(process.execPath, [cliPath, projectDirectory, "--output", reportPath], {
        cwd: temporaryDirectory,
      })
      return { execution, reportPath }
    })

    await test.step("Open the empty report without browser errors", async () => {
      await page.goto(pathToFileURL(report.reportPath).href)
      expect(report.execution.stderr).toBe("")
      expect(report.execution.stdout).toContain("Report written to " + report.reportPath)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      await expect(page.locator("header p")).toHaveText("0 project files")
      await expect(page.locator("#selected-empty")).toBeVisible()
      await expect(page.locator("#file-list button")).toHaveCount(0)
      expect(pageErrors).toEqual([])
    })
  })
})
