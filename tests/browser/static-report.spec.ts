import { execFile } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { Assert } from "@guillaume-docquier/tools-ts"
import { expect, test, type Locator } from "@playwright/test"
import { analyzeProject } from "../../src/analysis/analyze-project.js"
import { buildHtmlReport } from "../../src/report/build-html-report.js"
import { fixtureProjectPath } from "../../src/testing/fixture-project.js"
import { withTemporaryDirectory } from "../../src/testing/temporary-directory.js"

const execFileAsync = promisify(execFile)

test("keeps every report region usable together on a large desktop", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const reportPath = await test.step("Generate a report with files, relationships, and graph controls", async () => {
      const analysis = await analyzeProject({ projectRoot: fixtureProjectPath("external-packages") })
      Assert.isSuccess(analysis)
      const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
      const path = join(temporaryDirectory, "desktop-shell.html")
      await writeFile(path, buildHtmlReport(analysis.value, browserBundle), "utf8")
      return path
    })

    await test.step("Open the four-region report shell at a large desktop viewport", async () => {
      await page.setViewportSize({ width: 1920, height: 1080 })
      await page.goto(pathToFileURL(reportPath).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")

      const files = page.locator("#files")
      const graph = page.locator("#graph")
      const details = page.locator("#details")
      const controls = page.locator("#controls")
      await expect(files).toBeVisible()
      await expect(graph).toBeVisible()
      await expect(details).toBeVisible()
      await expect(controls).toBeVisible()

      const filesBounds = await files.boundingBox()
      const graphBounds = await graph.boundingBox()
      const detailsBounds = await details.boundingBox()
      const controlsBounds = await controls.boundingBox()
      Assert.isDefined(filesBounds)
      Assert.isDefined(graphBounds)
      Assert.isDefined(detailsBounds)
      Assert.isDefined(controlsBounds)
      expect(filesBounds.x + filesBounds.width).toBeLessThanOrEqual(graphBounds.x)
      expect(graphBounds.x + graphBounds.width).toBeLessThanOrEqual(detailsBounds.x)
      expect(graphBounds.y + graphBounds.height).toBeLessThanOrEqual(controlsBounds.y)
      expect(Math.abs(graphBounds.x - controlsBounds.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(graphBounds.width - controlsBounds.width)).toBeLessThanOrEqual(1)
      expect(graphBounds.width).toBeGreaterThan(filesBounds.width + detailsBounds.width)
    })

    await test.step("Navigate files, inspect details, and change controls without losing the graph", async () => {
      const graph = page.locator("#graph")
      await expect(graph.locator("canvas.sigma-structure")).toBeVisible()
      await page.locator("#files").getByRole("button", { name: "src/entry.ts", exact: true }).click()
      await expect(page.locator("#selected-path")).toHaveText("src/entry.ts")

      await page.locator("#controls").getByRole("checkbox", { name: "External packages" }).check()
      await expect(page.locator("html")).toHaveAttribute("data-external-packages", "visible")
      await expect(page.locator("#files #external-package-section")).toBeVisible()
      await expect(page.locator("#details #selected-dependencies")).toHaveText("4")
      await expect(graph).toHaveAttribute("data-visible-node-count", "6")
      await expect(page.locator("#files")).toBeVisible()
      await expect(page.locator("#details")).toBeVisible()
      await expect(page.locator("#controls")).toBeVisible()
    })
  })
})

test("navigates a collapsible and searchable project-files tree", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const report = await test.step("Generate a real report with nested project files", async () => {
      const analysis = await analyzeProject({ projectRoot: fixtureProjectPath("static-esm") })
      Assert.isSuccess(analysis)
      const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
      const path = join(temporaryDirectory, "files-tree.html")
      await writeFile(path, buildHtmlReport(analysis.value, browserBundle), "utf8")
      return { path, fileCount: analysis.value.files.length }
    })

    await test.step("Expand and collapse directories without changing the visible graph", async () => {
      await page.goto(pathToFileURL(report.path).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      await expect(page.locator("#project-file-count")).toHaveText(`${report.fileCount} / ${report.fileCount} project files`)
      const srcDirectory = page.locator('[data-directory-path="src"]')
      const mainFile = page.locator('#file-list button[data-node-id="project-file:src/main.ts"]')
      await expect(srcDirectory).toHaveAttribute("aria-expanded", "true")
      await expect(mainFile).toBeVisible()
      await expect(mainFile).toHaveText("main.ts")

      await srcDirectory.click()
      await expect(srcDirectory).toHaveAttribute("aria-expanded", "false")
      await expect(mainFile).toBeHidden()
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-node-count", String(report.fileCount))

      await srcDirectory.click()
      await expect(srcDirectory).toHaveAttribute("aria-expanded", "true")
      await expect(mainFile).toBeVisible()
    })

    await test.step("Filter by full path while retaining the matching hierarchy", async () => {
      const search = page.getByRole("searchbox", { name: "Search files" })
      await search.fill("DIRECTORY/INDEX")
      await expect(page.locator('#file-list button[data-node-id="project-file:src/directory/index.ts"]')).toBeVisible()
      await expect(page.locator("#file-list button[data-node-id]")).toHaveCount(1)
      await expect(page.locator('[data-directory-path="src/directory"]')).toBeVisible()
      await expect(page.locator("#project-file-count")).toHaveText(`${report.fileCount} / ${report.fileCount} project files`)

      await search.fill("does-not-exist")
      await expect(page.locator("#file-list")).toBeHidden()
      await expect(page.locator("#file-tree-empty")).toHaveText("No project files match this search.")

      await search.fill("")
      await expect(page.locator("#file-tree-empty")).toBeHidden()
      await expect(page.locator("#file-list button[data-node-id]")).toHaveCount(report.fileCount)
    })

    await test.step("Bring a hovered file into view without replacing click selection", async () => {
      const graph = page.locator("#graph")
      const mainFile = page.locator('#file-list button[data-node-id="project-file:src/main.ts"]')
      const runtimeFile = page.locator('#file-list button[data-node-id="project-file:src/runtime.ts"]')
      await mainFile.click()
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", "project-file:src/main.ts")
      await expect(graph).toHaveAttribute("data-camera-focused-node", "project-file:src/main.ts")

      await runtimeFile.hover()
      await expect(graph).toHaveAttribute("data-camera-focused-node", "project-file:src/runtime.ts")
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", "project-file:src/main.ts")
      const graphBounds = await graph.boundingBox()
      const serializedPositions = await graph.getAttribute("data-visible-node-positions")
      Assert.isDefined(graphBounds)
      Assert.isDefined(serializedPositions)
      const runtimePosition =
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- It's a test, malformed diagnostics must fail this browser assertion.
        (JSON.parse(serializedPositions) as Array<{ readonly id: string; readonly x: number; readonly y: number }>).find(
          ({ id }) => id === "project-file:src/runtime.ts",
        )
      Assert.isDefined(runtimePosition)
      expect(Math.abs(runtimePosition.x - graphBounds.width / 2)).toBeLessThanOrEqual(2)
      expect(Math.abs(runtimePosition.y - graphBounds.height / 2)).toBeLessThanOrEqual(2)

      await runtimeFile.click()
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", "project-file:src/runtime.ts")
      await expect(runtimeFile).toHaveAttribute("aria-current", "true")
    })
  })
})

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
      await expect(page.locator("#project-file-count")).toHaveText("1 / 1 project file")
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
      const serializedNodePositions = await graph.getAttribute("data-visible-node-positions")
      Assert.isDefined(serializedNodePositions)
      const nodePosition =
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- It's a test, if the cast is wrong, we'll know soon enough
        (JSON.parse(serializedNodePositions) as Array<{ readonly id: string; readonly x: number; readonly y: number }>).find(
          ({ id }) => id === report.longPathNodeId,
        )
      Assert.isDefined(nodePosition)
      const pointerX = bounds.x + nodePosition.x
      const pointerY = bounds.y + nodePosition.y
      await page.mouse.move(pointerX, pointerY)
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
      expect(
        Math.min(Math.abs(tooltipBounds.x - (pointerX + 14)), Math.abs(tooltipBounds.x - (pointerX - tooltipBounds.width - 14))),
      ).toBeLessThanOrEqual(1)
      expect(
        Math.min(Math.abs(tooltipBounds.y - (pointerY + 14)), Math.abs(tooltipBounds.y - (pointerY - tooltipBounds.height - 14))),
      ).toBeLessThanOrEqual(1)
      return { pointerX, pointerY }
    })

    await test.step("Select the file and rebuild every non-empty line-category view", async () => {
      await page.mouse.click(pointer.pointerX, pointer.pointerY)
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
      await expect(graph).toHaveAttribute("data-graph-node-count", "7")
      await expect(graph).toHaveAttribute("data-directory-node-count", "3")
      await expect(graph).toHaveAttribute("data-structure-edge-count", "6")
      await expect(page.locator("#external-package-section")).toBeHidden()
      await expect(page.locator("#external-package-list button")).toHaveCount(0)
      const signature = await graph.getAttribute("data-layout-signature")
      await page.locator("#file-list").getByRole("button", { name: "src/entry.ts", exact: true }).click()
      await expect(page.locator("#selected-dependencies")).toHaveText("2")
      await expect(page.locator("#selected-dependency-nodes button")).toHaveText(["src/alias/value.ts", "src/aliased.ts"])
      return signature
    })

    await test.step("Reveal packages and combine visibility with line-category sizing", async () => {
      const graph = page.locator("#graph")
      const externalPackages = page.getByRole("checkbox", { name: "External packages" })
      await externalPackages.check()
      await expect(page.locator("html")).toHaveAttribute("data-external-packages", "visible")
      await expect(graph).toHaveAttribute("data-visible-node-count", "6")
      await expect(graph).toHaveAttribute("data-graph-node-count", "9")
      await expect(graph).toHaveAttribute("data-directory-node-count", "3")
      await expect(graph).toHaveAttribute("data-structure-edge-count", "6")
      await expect(page.locator("#external-package-section")).toBeVisible()
      await expect(page.locator("#external-package-list button")).toHaveCount(2)
      await expect(page.locator("#selected-dependencies")).toHaveText("4")
      await expect(page.locator("#selected-dependency-nodes button")).toHaveCount(4)
      await expect(page.locator("#selected-dependency-nodes")).toContainText("External package")
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

    await test.step("Inspect browser-derived dependency and consumer navigation", async () => {
      await page.goto(pathToFileURL(reportPath).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-edge-count", "13")
      await page.locator("#file-list").getByRole("button", { name: "src/main.ts", exact: true }).click()
      await expect(page.getByRole("heading", { name: "Dependencies", exact: true })).toBeVisible()
      await expect(page.getByText("Imports", { exact: true })).toHaveCount(0)
      await expect(page.locator("#selected-dependencies")).toHaveText("7")
      await expect(page.locator("#selected-dependency-nodes button")).toHaveText([
        "src/default-export.ts",
        "src/directory/index.ts",
        "src/lib/aliased.ts",
        "src/mixed.ts",
        "src/ordinary-type.ts",
        "src/runtime.ts",
        "src/side-effect.js",
      ])
      await page.locator("#selected-dependency-nodes").getByRole("button", { name: "src/runtime.ts", exact: true }).click()
      await expect(page.locator("#selected-consumers")).toHaveText("2")
      await expect(page.locator("#selected-consumer-files button")).toHaveText(["src/main.ts", "src/reexports.ts"])
    })
  })
})

test("uses weighted folder nodes as the primary force graph under dependency arrows", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const reportPath = await test.step("Generate a report with one cross-branch dependency", async () => {
      const projectDirectory = join(temporaryDirectory, "project")
      const featureDirectory = join(projectDirectory, "src", "features", "accounts")
      const deepFeatureDirectory = join(featureDirectory, "workflows", "commands")
      const platformDirectory = join(projectDirectory, "src", "platform", "database")
      await mkdir(deepFeatureDirectory, { recursive: true })
      await mkdir(platformDirectory, { recursive: true })
      await writeFile(join(featureDirectory, "create.ts"), 'import "../../platform/database/query.js"\n', "utf8")
      await writeFile(join(deepFeatureDirectory, "deep.ts"), "export const deep = true\n", "utf8")
      await writeFile(join(platformDirectory, "query.ts"), "export const query = true\n", "utf8")
      const analysis = await analyzeProject({ projectRoot: projectDirectory })
      Assert.isSuccess(analysis)
      const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
      const path = join(temporaryDirectory, "structure.html")
      await writeFile(path, buildHtmlReport(analysis.value, browserBundle), "utf8")
      return path
    })

    await test.step("Inspect the structural graph, force weights, and overlaid dependency", async () => {
      await page.goto(pathToFileURL(reportPath).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      const graph = page.locator("#graph")
      await expect(graph).toHaveAttribute("data-visible-node-count", "3")
      await expect(graph).toHaveAttribute("data-visible-edge-count", "1")
      await expect(graph).toHaveAttribute("data-graph-node-count", "11")
      await expect(graph).toHaveAttribute("data-directory-node-count", "8")
      await expect(graph).toHaveAttribute("data-structure-edge-count", "10")
      await expect(graph).toHaveAttribute("data-structure-edge-weight", "6")
      await expect(graph).toHaveAttribute("data-dependency-edge-weight", "0.25")
      const structureCanvas = graph.locator("canvas.sigma-structure")
      await expect(structureCanvas).toHaveCount(1)
      expect(
        await structureCanvas.evaluate((canvas) => {
          if (!(canvas instanceof HTMLCanvasElement)) {
            return false
          }
          return (
            canvas.width === canvas.clientWidth * window.devicePixelRatio && canvas.height === canvas.clientHeight * window.devicePixelRatio
          )
        }),
      ).toBe(true)
    })

    await test.step("Reveal directory and project-file labels progressively while zooming", async () => {
      const graph = page.locator("#graph")
      await expect(graph).toHaveAttribute("data-visible-directory-label-depth", "1")
      await expect(graph).toHaveAttribute("data-visible-directory-labels", '["project","src"]')
      await expect(graph).toHaveAttribute("data-file-label-visibility", "hidden")
      await expect(graph).toHaveAttribute("data-rendered-file-labels", "[]")
      const bounds = await graph.boundingBox()
      Assert.isDefined(bounds)
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)

      await page.mouse.wheel(0, 120)
      await expect(graph).toHaveAttribute("data-visible-directory-label-depth", "1")
      await expect(graph).toHaveAttribute("data-visible-directory-labels", '["project","src"]')
      await page.waitForTimeout(300)
      await page.mouse.wheel(0, 120)
      await expect(graph).toHaveAttribute("data-visible-directory-label-depth", "0")
      await expect(graph).toHaveAttribute("data-visible-directory-labels", '["project"]')

      await page.reload()
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.wheel(0, -120)
      await page.waitForTimeout(300)
      await page.mouse.wheel(0, -120)
      await expect(graph).toHaveAttribute("data-file-label-visibility", "visible")
      await expect(graph).not.toHaveAttribute("data-rendered-file-labels", "[]")
      const cameraState = await readJsonAttribute<{ readonly ratio: number }>(graph, "data-camera-state")
      expect(cameraState.ratio).toBeLessThanOrEqual(0.65)
      const labels = await readJsonAttribute<readonly DirectoryLabelDiagnostic[]>(graph, "data-visible-directory-label-rectangles")
      expect(labels.length).toBeGreaterThan(0)
      expectDirectoryLabelsNotToOverlap(labels)

      await page.setViewportSize({ width: 1440, height: 900 })
      await expect(graph).toHaveAttribute("data-file-label-visibility", "visible")
      await expect(graph).not.toHaveAttribute("data-rendered-file-labels", "[]")
      const resizedLabels = await readJsonAttribute<readonly DirectoryLabelDiagnostic[]>(graph, "data-visible-directory-label-rectangles")
      expectDirectoryLabelsNotToOverlap(resizedLabels)
    })
  })
})

test("keeps dense orientation labels collision-free and readable on directory hover", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const reportPath = await test.step("Generate a report with many long sibling directory labels", async () => {
      const projectDirectory = join(temporaryDirectory, "dense-labels")
      for (let index = 0; index < 24; index += 1) {
        const directory = join(
          projectDirectory,
          `orientation-area-${String(index).padStart(2, "0")}-with-a-deliberately-long-descriptive-name`,
        )
        await mkdir(directory, { recursive: true })
        await writeFile(join(directory, "index.ts"), `export const value${index} = ${index}\n`, "utf8")
      }
      const analysis = await analyzeProject({ projectRoot: projectDirectory })
      Assert.isSuccess(analysis)
      const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
      const path = join(temporaryDirectory, "dense-labels.html")
      await writeFile(path, buildHtmlReport(analysis.value, browserBundle), "utf8")
      return path
    })

    const rootLabel = await test.step("Keep only priority labels when viewport rectangles collide", async () => {
      await page.goto(pathToFileURL(reportPath).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      const graph = page.locator("#graph")
      const bounds = await graph.boundingBox()
      Assert.isDefined(bounds)
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.wheel(0, 120)
      await page.waitForTimeout(300)
      await expect.poll(async () => Number(await graph.getAttribute("data-suppressed-directory-label-count"))).toBeGreaterThan(0)

      const labels = await readJsonAttribute<readonly DirectoryLabelDiagnostic[]>(graph, "data-visible-directory-label-rectangles")
      expect(labels.map(({ label }) => label)).toContain("dense-labels")
      expectDirectoryLabelsNotToOverlap(labels)
      const root = labels.find(({ id }) => id === "directory:.")
      Assert.isDefined(root)
      return root
    })

    await test.step("Render a high-contrast label plate without covering the directory node", async () => {
      const graph = page.locator("#graph")
      const bounds = await graph.boundingBox()
      Assert.isDefined(bounds)
      await page.mouse.move(bounds.x + rootLabel.nodeX, bounds.y + rootLabel.nodeY)
      await expect(graph).toHaveAttribute("data-hovered-directory-label", rootLabel.id)
      const hoveredLabels = await readJsonAttribute<readonly DirectoryLabelDiagnostic[]>(graph, "data-visible-directory-label-rectangles")
      const hoveredRoot = hoveredLabels.find(({ id }) => id === rootLabel.id)
      Assert.isDefined(hoveredRoot)
      await expect.poll(async () => (await sampleDirectoryHoverPixels(graph, hoveredRoot)).foregroundPixelCount).toBeGreaterThan(0)

      const pixels = await sampleDirectoryHoverPixels(graph, hoveredRoot)
      expect(pixels.backgroundPixelCount).toBeGreaterThan(0)
      expectRgbNear(pixels.background, "#111821")
      expectRgbNear(pixels.foreground, "#f5f9ff")
      expect(contrastRatio(rgbHex(pixels.foreground), rgbHex(pixels.background))).toBeGreaterThanOrEqual(7)
      expectRgbNear(pixels.directoryNode, "#79b8ff")
      expect(pixels.directoryNode.alpha).toBeGreaterThan(0)
      expect(pixels.hoverAtNodeCenter.alpha).toBe(0)
    })
  })
})

test("explains project-file coverage colors and shows exact coverage in hover tooltips", async ({ page }) => {
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

    await test.step("Open the report and inspect its coverage color mapping and legend", async () => {
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
      const legend = page.locator("#coverage-legend")
      await expect(legend).toBeVisible()
      await expect(legend).toContainText("Line coverage")
      await expect(legend.locator('[data-coverage-legend-entry="uncovered"]')).toHaveText("0% uncovered")
      await expect(legend.locator('[data-coverage-legend-entry="partial"]')).toHaveText("50% partially covered")
      await expect(legend.locator('[data-coverage-legend-entry="covered"]')).toHaveText("100% covered")
      await expect(legend.locator('[data-coverage-legend-entry="unavailable"]')).toHaveText("Not available")
      await page.locator("#file-list").getByRole("button", { name: "covered.ts", exact: true }).click()
      await expect(page.locator("#selected-coverage")).toHaveText("100%")
      await page.locator("#file-list").getByRole("button", { name: "missing.ts", exact: true }).click()
      await expect(page.locator("#selected-coverage")).toHaveText("Not available")
    })

    await test.step("Hover each project-file coverage state to inspect its exact value", async () => {
      for (const { path, coverage } of [
        { path: "covered.ts", coverage: "100%" },
        { path: "partial.ts", coverage: "50%" },
        { path: "uncovered.ts", coverage: "0%" },
        { path: "missing.ts", coverage: "Not available" },
      ]) {
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
        const graphBounds = await graph.boundingBox()
        const serializedPositions = await graph.getAttribute("data-visible-node-positions")
        Assert.isDefined(graphBounds)
        Assert.isDefined(serializedPositions)
        const positions =
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- It's a test, malformed graph diagnostics must fail this browser assertion.
          JSON.parse(serializedPositions) as Array<{ readonly id: string; readonly x: number; readonly y: number }>
        const position = positions.find(({ id }) => id === `project-file:${path}`)
        Assert.isDefined(position)
        await page.mouse.move(graphBounds.x + position.x, graphBounds.y + position.y)
        await expect(page.locator("html")).toHaveAttribute("data-hovered-node", `project-file:${path}`)
        await expect(page.locator("#tooltip .tooltip-metrics")).toContainText("Coverage")
        await expect(page.locator("#tooltip .tooltip-metrics")).toContainText(coverage)
      }
    })
  })
})

test("renders equivalent browser coverage from Istanbul and LCOV CLI inputs", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const reports = await test.step("Generate reports through the built CLI from both coverage formats", async () => {
      const projectDirectory = join(temporaryDirectory, "project")
      await mkdir(projectDirectory)
      for (const path of ["covered.ts", "missing.ts", "partial.ts"]) {
        await writeFile(join(projectDirectory, path), "export const value = true\n", "utf8")
      }
      const istanbulPath = join(temporaryDirectory, "coverage.data")
      const lcovPath = join(temporaryDirectory, "coverage.json")
      await writeFile(
        istanbulPath,
        JSON.stringify({
          "covered.ts": {
            path: "covered.ts",
            statementMap: { 0: { start: { line: 1 } } },
            s: { 0: 1 },
          },
          "partial.ts": {
            path: "partial.ts",
            statementMap: { 0: { start: { line: 1 } }, 1: { start: { line: 2 } } },
            s: { 0: 1, 1: 0 },
          },
        }),
        "utf8",
      )
      await writeFile(lcovPath, "SF:covered.ts\nDA:1,1\nend_of_record\nSF:partial.ts\nDA:1,1\nDA:2,0\nend_of_record\n", "utf8")
      const cliPath = join(process.cwd(), "dist", "cli", "entry.cli.js")
      const istanbulReport = join(temporaryDirectory, "istanbul.html")
      const lcovReport = join(temporaryDirectory, "lcov.html")
      const istanbulExecution = await execFileAsync(
        process.execPath,
        [cliPath, projectDirectory, "--coverage", istanbulPath, "--output", istanbulReport],
        { cwd: temporaryDirectory },
      )
      const lcovExecution = await execFileAsync(
        process.execPath,
        [cliPath, projectDirectory, "--coverage", lcovPath, "--output", lcovReport],
        { cwd: temporaryDirectory },
      )
      expect(istanbulExecution.stderr).toBe("")
      expect(lcovExecution.stderr).toBe("")
      return { istanbulReport, lcovReport }
    })

    const expectedColors = [
      { id: "project-file:covered.ts", color: "#16a34a" },
      { id: "project-file:missing.ts", color: "#8fa3b8" },
      { id: "project-file:partial.ts", color: "#eab308" },
    ]
    const istanbulColors = await test.step("Inspect browser-derived Istanbul coverage", async () => {
      await page.goto(pathToFileURL(reports.istanbulReport).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      await page.locator("#file-list").getByRole("button", { name: "partial.ts", exact: true }).click()
      await expect(page.locator("#selected-coverage")).toHaveText("50%")
      const serializedColors = await page.locator("#graph").getAttribute("data-visible-node-colors")
      Assert.isDefined(serializedColors)
      return JSON.parse(serializedColors)
    })

    await test.step("Inspect equivalent browser-derived LCOV coverage", async () => {
      await page.goto(pathToFileURL(reports.lcovReport).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      await page.locator("#file-list").getByRole("button", { name: "partial.ts", exact: true }).click()
      await expect(page.locator("#selected-coverage")).toHaveText("50%")
      const serializedColors = await page.locator("#graph").getAttribute("data-visible-node-colors")
      Assert.isDefined(serializedColors)
      expect(JSON.parse(serializedColors)).toEqual(expectedColors)
      expect(JSON.parse(serializedColors)).toEqual(istanbulColors)
    })
  })
})

test("renders and filters one complete pnpm workspace without mutating its analysis", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const reportPath = await test.step("Generate one report for the complete deterministic workspace", async () => {
      const analysis = await analyzeProject({ projectRoot: fixtureProjectPath("pnpm-workspace") })
      Assert.isSuccess(analysis)
      const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
      const path = join(temporaryDirectory, "pnpm-workspace.html")
      await writeFile(path, buildHtmlReport(analysis.value, browserBundle), "utf8")
      return path
    })

    await test.step("Open with every workspace package and cross-package edge visible", async () => {
      await page.goto(pathToFileURL(reportPath).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      await expect(page.locator("#project-file-count")).toHaveText("8 / 8 project files")
      await expect(page.locator("#workspace-package-fieldset")).toBeVisible()
      await expect(page.locator("#workspace-package-controls input")).toHaveCount(4)
      await expect(page.locator("#workspace-package-controls input:checked")).toHaveCount(4)
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-node-count", "8")
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-edge-count", "6")
      await expect(page.locator("#file-list button[data-node-id]")).toHaveCount(8)
    })

    await test.step("Scope to backend and retain only its external packages", async () => {
      await page.getByRole("checkbox", { name: "@fixture/root", exact: true }).uncheck()
      await page.getByRole("checkbox", { name: "@fixture/frontend", exact: true }).uncheck()
      await page.getByRole("checkbox", { name: "@fixture/shared", exact: true }).uncheck()
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-node-count", "2")
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-edge-count", "1")
      await expect(page.locator("#project-file-count")).toHaveText("2 / 8 project files")
      await expect(page.locator("#file-list button[data-node-id]")).toHaveCount(2)
      await expect(page.getByRole("button", { name: "apps/frontend/src/main.ts", exact: true })).toHaveCount(0)
      await page.getByRole("checkbox", { name: "External packages" }).check()
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-node-count", "3")
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-edge-count", "2")
      await expect(page.locator("#external-package-list button")).toHaveText(["backend-libraryExternal package"])
      await expect(page.locator("#external-package-list")).not.toContainText("frontend-library")
    })

    await test.step("Fit the current filtered graph after tree focus and zoom without undoing filters", async () => {
      const graph = page.locator("#graph")
      const file = page.locator("#file-list button[data-node-id]").first()
      const focusedNodeId = await file.getAttribute("data-node-id")
      Assert.isDefined(focusedNodeId)
      await file.hover()
      await expect(graph).toHaveAttribute("data-camera-focused-node", focusedNodeId)
      const graphBounds = await graph.boundingBox()
      Assert.isDefined(graphBounds)
      await page.mouse.move(graphBounds.x + graphBounds.width / 2, graphBounds.y + graphBounds.height / 2)
      await page.mouse.wheel(0, -120)
      await page.waitForTimeout(300)
      const disturbedCamera = await readJsonAttribute<CameraDiagnostic>(graph, "data-camera-state")
      expect(disturbedCamera.ratio).not.toBe(1)

      await page.getByRole("button", { name: "Fit current graph" }).click()
      await expect(graph).toHaveAttribute("data-camera-reset", "complete")
      const resetCamera = await readJsonAttribute<CameraDiagnostic>(graph, "data-camera-state")
      expect(resetCamera.x).toBe(0.5)
      expect(resetCamera.y).toBe(0.5)
      expect(resetCamera.angle).toBe(0)
      expect(resetCamera.ratio).toBeGreaterThanOrEqual(1)
      await expect(page.locator("#workspace-package-controls input:checked")).toHaveCount(1)
      await expect(page.getByRole("checkbox", { name: "@fixture/backend", exact: true })).toBeChecked()
      await expect(page.getByRole("checkbox", { name: "External packages" })).toBeChecked()
      await expect(graph).toHaveAttribute("data-visible-node-count", "3")

      const graphNodeCount = Number(await graph.getAttribute("data-graph-node-count"))
      const circles = await readJsonAttribute<readonly NodeCircleDiagnostic[]>(graph, "data-visible-node-positions")
      expect(circles).toHaveLength(graphNodeCount)
      expect(new Set(circles.map(({ id }) => id)).size).toBe(graphNodeCount)
      const settledGraphBounds = await graph.boundingBox()
      Assert.isDefined(settledGraphBounds)
      for (const circle of circles) {
        expect(circle.radius).toBeGreaterThan(0)
        expect(circle.x - circle.radius).toBeGreaterThanOrEqual(0)
        expect(circle.x + circle.radius).toBeLessThanOrEqual(settledGraphBounds.width)
        expect(circle.y - circle.radius).toBeGreaterThanOrEqual(0)
        expect(circle.y + circle.radius).toBeLessThanOrEqual(settledGraphBounds.height)
      }
    })

    await test.step("Hide every workspace and show a deliberate empty state", async () => {
      await page.getByRole("checkbox", { name: "@fixture/backend", exact: true }).uncheck()
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-node-count", "0")
      await expect(page.locator("#project-file-count")).toHaveText("0 / 8 project files")
      await expect(page.locator("#file-list")).toBeHidden()
      await expect(page.locator("#file-tree-empty")).toHaveText("No project files are visible. Select a workspace package to show files.")
    })

    await test.step("Restore the complete immutable analysis", async () => {
      await page.getByRole("checkbox", { name: "External packages" }).uncheck()
      await page.getByRole("checkbox", { name: "@fixture/root", exact: true }).check()
      await page.getByRole("checkbox", { name: "@fixture/backend", exact: true }).check()
      await page.getByRole("checkbox", { name: "@fixture/frontend", exact: true }).check()
      await page.getByRole("checkbox", { name: "@fixture/shared", exact: true }).check()
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-node-count", "8")
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-edge-count", "6")
      await expect(page.locator("#project-file-count")).toHaveText("8 / 8 project files")
      await expect(page.locator("#file-list button[data-node-id]")).toHaveCount(8)
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
      await expect(page.locator("header p")).toHaveText("0 / 0 project files")
      await expect(page.locator("#selected-empty")).toBeVisible()
      await expect(page.locator("#file-tree-empty")).toHaveText("This report contains no project files.")
      await expect(page.locator("#file-list button[data-node-id]")).toHaveCount(0)

      const graph = page.locator("#graph")
      await page.getByRole("button", { name: "Fit current graph" }).click()
      await expect(graph).toHaveAttribute("data-camera-reset", "complete")
      const circles = await readJsonAttribute<readonly NodeCircleDiagnostic[]>(graph, "data-visible-node-positions")
      expect(circles).toHaveLength(1)
      const graphBounds = await graph.boundingBox()
      Assert.isDefined(graphBounds)
      const [rootDirectory] = circles
      Assert.isDefined(rootDirectory)
      expect(rootDirectory.x - rootDirectory.radius).toBeGreaterThanOrEqual(0)
      expect(rootDirectory.x + rootDirectory.radius).toBeLessThanOrEqual(graphBounds.width)
      expect(rootDirectory.y - rootDirectory.radius).toBeGreaterThanOrEqual(0)
      expect(rootDirectory.y + rootDirectory.radius).toBeLessThanOrEqual(graphBounds.height)
      expect(pageErrors).toEqual([])
    })
  })
})

type DirectoryLabelDiagnostic = {
  readonly id: string
  readonly label: string
  readonly nodeX: number
  readonly nodeY: number
  readonly bounds: {
    readonly left: number
    readonly top: number
    readonly right: number
    readonly bottom: number
  }
}

type CameraDiagnostic = {
  readonly x: number
  readonly y: number
  readonly angle: number
  readonly ratio: number
}

type NodeCircleDiagnostic = {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly radius: number
}

type RgbDiagnostic = {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
}

type DirectoryHoverPixelDiagnostic = {
  readonly background: RgbDiagnostic
  readonly backgroundPixelCount: number
  readonly foreground: RgbDiagnostic
  readonly foregroundPixelCount: number
  readonly directoryNode: RgbDiagnostic
  readonly hoverAtNodeCenter: RgbDiagnostic
}

async function readJsonAttribute<T>(locator: Locator, attribute: string): Promise<T> {
  const serialized = await locator.getAttribute(attribute)
  Assert.isDefined(serialized)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: These diagnostics come from the real report; malformed data must fail the consuming assertion.
  return JSON.parse(serialized) as T
}

function expectDirectoryLabelsNotToOverlap(labels: readonly DirectoryLabelDiagnostic[]): void {
  for (const [index, left] of labels.entries()) {
    for (const right of labels.slice(index + 1)) {
      const overlaps =
        left.bounds.left < right.bounds.right &&
        left.bounds.right > right.bounds.left &&
        left.bounds.top < right.bounds.bottom &&
        left.bounds.bottom > right.bounds.top
      expect(overlaps, `${left.label} overlaps ${right.label}`).toBe(false)
    }
  }
}

async function sampleDirectoryHoverPixels(
  graph: Locator,
  directoryLabel: DirectoryLabelDiagnostic,
): Promise<DirectoryHoverPixelDiagnostic> {
  const screenshot = await graph.screenshot()
  return await graph.evaluate(
    async (container, diagnostic): Promise<DirectoryHoverPixelDiagnostic> => {
      const { label, screenshotBase64 } = diagnostic
      const hoverCanvas = container.querySelector("canvas.sigma-hovers")
      if (!(hoverCanvas instanceof HTMLCanvasElement)) {
        throw new Error("Sigma hover canvas is required for pixel diagnostics.")
      }
      const hoverContext = hoverCanvas.getContext("2d", { willReadFrequently: true })
      if (hoverContext === null || hoverCanvas.clientWidth === 0 || hoverCanvas.clientHeight === 0) {
        throw new Error("Sigma hover canvas is not readable.")
      }
      const renderedReport = new Image()
      renderedReport.src = `data:image/png;base64,${screenshotBase64}`
      await renderedReport.decode()
      const renderedReportCanvas = document.createElement("canvas")
      renderedReportCanvas.width = renderedReport.naturalWidth
      renderedReportCanvas.height = renderedReport.naturalHeight
      const renderedReportContext = renderedReportCanvas.getContext("2d", { willReadFrequently: true })
      if (renderedReportContext === null || container.clientWidth === 0 || container.clientHeight === 0) {
        throw new Error("Rendered report screenshot is not readable.")
      }
      renderedReportContext.drawImage(renderedReport, 0, 0)

      const colorAt = (context: CanvasRenderingContext2D, x: number, y: number, scaleX: number, scaleY: number): RgbDiagnostic => {
        const pixel = context.getImageData(
          Math.max(0, Math.min(context.canvas.width - 1, Math.round(x * scaleX))),
          Math.max(0, Math.min(context.canvas.height - 1, Math.round(y * scaleY))),
          1,
          1,
        ).data
        return { red: pixel[0] ?? 0, green: pixel[1] ?? 0, blue: pixel[2] ?? 0, alpha: pixel[3] ?? 0 }
      }
      const closestColor = (
        image: ImageData,
        target: readonly [number, number, number],
      ): { readonly color: RgbDiagnostic; readonly matchingPixelCount: number } => {
        let closest = { red: 0, green: 0, blue: 0, alpha: 0 }
        let closestDistance = Number.POSITIVE_INFINITY
        let matchingPixelCount = 0
        for (let offset = 0; offset < image.data.length; offset += 4) {
          const red = image.data[offset] ?? 0
          const green = image.data[offset + 1] ?? 0
          const blue = image.data[offset + 2] ?? 0
          const alpha = image.data[offset + 3] ?? 0
          if (alpha < 200) {
            continue
          }
          const distance = Math.hypot(red - target[0], green - target[1], blue - target[2])
          if (distance <= 24) {
            matchingPixelCount += 1
          }
          if (distance < closestDistance) {
            closestDistance = distance
            closest = { red, green, blue, alpha }
          }
        }
        return { color: closest, matchingPixelCount }
      }

      const hoverScaleX = hoverCanvas.width / hoverCanvas.clientWidth
      const hoverScaleY = hoverCanvas.height / hoverCanvas.clientHeight
      const left = Math.max(0, Math.floor(label.bounds.left * hoverScaleX))
      const top = Math.max(0, Math.floor(label.bounds.top * hoverScaleY))
      const right = Math.min(hoverCanvas.width, Math.ceil(label.bounds.right * hoverScaleX))
      const bottom = Math.min(hoverCanvas.height, Math.ceil(label.bounds.bottom * hoverScaleY))
      const plate = hoverContext.getImageData(left, top, Math.max(1, right - left), Math.max(1, bottom - top))
      // Exclude the directory outline's rightmost pixel so foreground matches inside this region can only be label glyphs.
      const textLeft = Math.min(right - 1, Math.max(left, Math.floor((label.bounds.left + 5) * hoverScaleX)))
      const text = hoverContext.getImageData(textLeft, top, Math.max(1, right - textLeft), Math.max(1, bottom - top))
      const background = closestColor(plate, [17, 24, 33])
      const foreground = closestColor(text, [245, 249, 255])
      const screenshotScaleX = renderedReportCanvas.width / container.clientWidth
      const screenshotScaleY = renderedReportCanvas.height / container.clientHeight
      return {
        background: background.color,
        backgroundPixelCount: background.matchingPixelCount,
        foreground: foreground.color,
        foregroundPixelCount: foreground.matchingPixelCount,
        directoryNode: colorAt(renderedReportContext, label.nodeX, label.nodeY, screenshotScaleX, screenshotScaleY),
        hoverAtNodeCenter: colorAt(hoverContext, label.nodeX, label.nodeY, hoverScaleX, hoverScaleY),
      }
    },
    { label: directoryLabel, screenshotBase64: screenshot.toString("base64") },
  )
}

function expectRgbNear(actual: RgbDiagnostic, expected: string): void {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(expected.slice(offset, offset + 2), 16))
  const [red, green, blue] = channels
  Assert.isDefined(red)
  Assert.isDefined(green)
  Assert.isDefined(blue)
  expect(Math.abs(actual.red - red)).toBeLessThanOrEqual(2)
  expect(Math.abs(actual.green - green)).toBeLessThanOrEqual(2)
  expect(Math.abs(actual.blue - blue)).toBeLessThanOrEqual(2)
}

function rgbHex(color: RgbDiagnostic): string {
  return `#${[color.red, color.green, color.blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function relativeLuminance(color: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
  const [red, green, blue] = channels.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  Assert.isDefined(red)
  Assert.isDefined(green)
  Assert.isDefined(blue)
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}
