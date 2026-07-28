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
      await expect(page.locator('#file-list button[data-node-id^="project-file:"]')).toHaveCount(1)
      await expect(page.locator('[data-directory-path="src/directory"]')).toBeVisible()
      await expect(page.locator("#project-file-count")).toHaveText(`${report.fileCount} / ${report.fileCount} project files`)

      await search.fill("does-not-exist")
      await expect(page.locator("#file-list")).toBeHidden()
      await expect(page.locator("#file-tree-empty")).toHaveText("No project files match this search.")

      await search.fill("")
      await expect(page.locator("#file-tree-empty")).toBeHidden()
      await expect(page.locator('#file-list button[data-node-id^="project-file:"]')).toHaveCount(report.fileCount)
    })

    await test.step("Preview a hovered file without moving the camera, then center it when selected", async () => {
      const graph = page.locator("#graph")
      const mainFile = page.locator('#file-list button[data-node-id="project-file:src/main.ts"]')
      const runtimeFile = page.locator('#file-list button[data-node-id="project-file:src/runtime.ts"]')
      await mainFile.click()
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", "project-file:src/main.ts")
      await expect(graph).toHaveAttribute("data-camera-focused-node", "project-file:src/main.ts")
      const cameraState = await graph.getAttribute("data-camera-state")
      Assert.isDefined(cameraState)

      await runtimeFile.hover()
      await expect(page.locator("html")).toHaveAttribute("data-hovered-node", "project-file:src/runtime.ts")
      await expect(graph).toHaveAttribute("data-dependency-focus", /project-file:src\/runtime\.ts/u)
      await expect(graph).toHaveAttribute("data-rendered-dependency-focus-ring-count", "3")
      await expect(page.locator("#selected-node-type")).toHaveText("Project file")
      await expect(page.locator("#selected-path")).toHaveText("src/runtime.ts")
      await expect(page.locator("#tooltip")).toHaveCount(0)
      await expect(graph).toHaveAttribute("data-camera-focused-node", "project-file:src/main.ts")
      await expect(graph).toHaveAttribute("data-camera-state", cameraState)
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", "project-file:src/main.ts")

      await runtimeFile.click()
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", "project-file:src/runtime.ts")
      await expect(runtimeFile).toHaveAttribute("aria-current", "true")
      await expect(graph).toHaveAttribute("data-camera-focused-node", "project-file:src/runtime.ts")
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

      await page.locator("header").hover()
      await expect(page.locator("html")).not.toHaveAttribute("data-hovered-node", /.+/u)
      await expect(page.locator("#selected-path")).toHaveText("src/runtime.ts")
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
      await mkdir(join(projectDirectory, "src"), { recursive: true })
      await writeFile(join(projectDirectory, "src", "selected.ts"), "export const selected = true\n", "utf8")
      const analysis = await analyzeProject({ projectRoot: projectDirectory })
      Assert.isSuccess(analysis)
      const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
      const reportPath = join(temporaryDirectory, "show-me.html")
      await writeFile(reportPath, buildHtmlReport(analysis.value, browserBundle), "utf8")
      return {
        reportPath,
        longPath,
        longPathNodeId: "project-file:" + longPath,
        selectedPath: "src/selected.ts",
        selectedNodeId: "project-file:src/selected.ts",
      }
    })

    const pointer = await test.step("Preview complete node details on hover without replacing selection", async () => {
      await page.goto(pathToFileURL(report.reportPath).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      await expect(page).toHaveTitle("Show me project")
      await expect(page.locator("#project-name")).toHaveText("project")
      await expect(page.locator("#project-file-count")).toHaveText("2 / 2 project files")
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-node-count", "2")
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-edge-count", "0")
      await expect(page.locator("#details h2")).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Clear selection" })).toHaveCount(0)
      const selectedFileButton = page.getByRole("button", { name: report.selectedPath })
      await selectedFileButton.focus()
      await selectedFileButton.press("Enter")
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", report.selectedNodeId)
      await expect(page.locator("#selected-path")).toHaveText(report.selectedPath)
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
      await expect(graph).toHaveAttribute("data-camera-focused-node", report.selectedNodeId)
      await page.getByRole("button", { name: "Fit current graph" }).click()
      await expect(graph).toHaveAttribute("data-camera-reset", "complete")
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
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", report.selectedNodeId)
      await expect(page.locator("#selected-path")).toHaveText(report.longPath)
      await expect(page.locator("#selected-code-lines")).toHaveText("1")
      await expect(page.locator("#selected-comment-lines")).toHaveText("1")
      await expect(page.locator("#selected-blank-lines")).toHaveText("2")
      await expect(page.locator("#selected-coverage")).toHaveText("Not available")
      await expect(page.locator("#tooltip")).toHaveCount(0)

      await page.mouse.move(bounds.x + 2, bounds.y + 2)
      await expect(page.locator("html")).not.toHaveAttribute("data-hovered-node", report.longPathNodeId)
      await expect(page.locator("#selected-path")).toHaveText(report.selectedPath)
      return { pointerX, pointerY }
    })

    await test.step("Select the file and rebuild every non-empty line-category view", async () => {
      await page.mouse.move(pointer.pointerX, pointer.pointerY)
      await expect(page.locator("html")).toHaveAttribute("data-hovered-node", report.longPathNodeId)
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

    await test.step("Clear selection through the canvas and navigate back through the accessible file list", async () => {
      await page.locator("#graph").click({ position: { x: 2, y: 2 } })
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

test("derives project-file edges and relationships in the browser", async ({ page }) => {
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
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-edge-count", "16")
      await page.locator("#file-list").getByRole("button", { name: "src/main.ts", exact: true }).click()
      await expect(page.getByRole("heading", { name: "Dependencies", exact: true })).toBeVisible()
      await expect(page.getByText("Imports", { exact: true })).toHaveCount(0)
      await expect(page.locator("#selected-dependencies")).toHaveText("9")
      await expect(page.locator("#selected-dependency-nodes button")).toHaveText([
        "src/default-export.ts",
        "src/directory/index.ts",
        "src/lib/aliased.ts",
        "src/lib/type-only.tsType only",
        "src/mixed.ts",
        "src/ordinary-type.ts",
        "src/runtime.ts",
        "src/side-effect.js",
        "src/types-only.tsType only",
      ])
      await page.locator("#selected-dependency-nodes").getByRole("button", { name: "src/runtime.ts", exact: true }).click()
      await expect(page.locator("#selected-consumers")).toHaveText("2")
      await expect(page.locator("#selected-consumer-files button")).toHaveText(["src/main.ts", "src/reexports.ts"])
    })
  })
})

test("shows, distinguishes, filters, and deterministically restores type-only dependencies", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const reportPath = await test.step("Generate a report containing project and external type-only relationships", async () => {
      const analysis = await analyzeProject({ projectRoot: fixtureProjectPath("static-esm") })
      Assert.isSuccess(analysis)
      const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
      const path = join(temporaryDirectory, "type-only-dependencies.html")
      await writeFile(path, buildHtmlReport(analysis.value, browserBundle), "utf8")
      return path
    })

    const initialLayoutSignature = await test.step("Open with distinct type-only arrows and relationship details visible", async () => {
      await page.goto(pathToFileURL(reportPath).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      const graph = page.locator("#graph")
      const typeOnlyDependencies = page.getByRole("checkbox", { name: "Type-only dependencies" })
      await expect(typeOnlyDependencies).toBeChecked()
      await expect(page.locator("html")).toHaveAttribute("data-type-only-dependencies", "visible")
      await expect(graph).toHaveAttribute("data-visible-edge-count", "16")
      await expect(graph).toHaveAttribute("data-rendered-dependency-edge-count", "16")
      await expect(page.locator(".graph-key")).toContainText("Structure")
      await expect(page.locator(".graph-key")).toContainText("Runtime")
      await expect(page.locator(".graph-key")).toContainText("External runtime")
      await expect(page.locator(".graph-key")).toContainText("Type only")
      await expect(page.locator(".type-only-dependency-edge-swatch")).toBeVisible()

      const renderedEdges = await readJsonAttribute<readonly DependencyEdgeDiagnostic[]>(graph, "data-rendered-dependency-edges")
      expect(new Set(renderedEdges.map(({ color }) => color))).toEqual(new Set(["#628bb5", "#a3e635"]))

      await page.locator("#file-list").getByRole("button", { name: "src/main.ts", exact: true }).click()
      await expect(page.locator("#selected-dependencies")).toHaveText("9")
      await expect(page.locator("#selected-dependency-nodes")).toContainText("Type only")
      return await graph.getAttribute("data-layout-signature")
    })

    await test.step("Hide type-only project relationships independently", async () => {
      const graph = page.locator("#graph")
      await page.getByRole("checkbox", { name: "Type-only dependencies" }).uncheck()
      await expect(page.locator("html")).toHaveAttribute("data-type-only-dependencies", "hidden")
      await expect(graph).toHaveAttribute("data-visible-edge-count", "13")
      await expect(graph).toHaveAttribute("data-rendered-dependency-edge-count", "13")
      await expect(page.locator("#selected-dependencies")).toHaveText("7")
      await expect(page.locator("#selected-dependency-nodes")).not.toContainText("Type only")
      expect(await graph.getAttribute("data-layout-signature")).not.toBe(initialLayoutSignature)
    })

    await test.step("Restore type-only project relationships deterministically", async () => {
      const graph = page.locator("#graph")
      await page.getByRole("checkbox", { name: "Type-only dependencies" }).check()
      await expect(graph).toHaveAttribute("data-visible-edge-count", "16")
      await expect(page.locator("#selected-dependencies")).toHaveText("9")
      await expect(page.locator("#selected-dependency-nodes")).toContainText("Type only")
      await expect(graph).toHaveAttribute("data-layout-signature", initialLayoutSignature ?? "")
    })

    await test.step("Compose type-only filtering with external-package visibility", async () => {
      const graph = page.locator("#graph")
      await graph.click({ position: { x: 2, y: 2 } })
      await expect(page.locator("html")).not.toHaveAttribute("data-selected-node", /.+/u)
      await page.getByRole("checkbox", { name: "External packages" }).check()
      await expect(graph).toHaveAttribute("data-visible-edge-count", "18")
      await expect(graph).toHaveAttribute("data-rendered-dependency-edge-count", "18")
      await expect(page.locator("#external-package-list button")).toHaveText([
        "external-packageExternal package",
        "type-only-packageExternal package",
      ])
      const renderedEdges = await readJsonAttribute<readonly DependencyEdgeDiagnostic[]>(graph, "data-rendered-dependency-edges")
      expect(new Set(renderedEdges.map(({ color }) => color))).toEqual(new Set(["#628bb5", "#9a68c1", "#a3e635"]))
      await page.getByRole("checkbox", { name: "Type-only dependencies" }).uncheck()
      await expect(graph).toHaveAttribute("data-visible-edge-count", "14")
      await expect(page.locator("#external-package-list button")).toHaveText(["external-packageExternal package"])
      await expect(page.locator("#external-package-list")).not.toContainText("type-only-package")
      await page.locator("#file-list").getByRole("button", { name: "src/main.ts", exact: true }).click()
      await expect(page.locator("#selected-dependencies")).toHaveText("8")
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

    const settledGraphState = await test.step("Inspect the structural graph, force weights, and dimmed dependency", async () => {
      await page.goto(pathToFileURL(reportPath).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      const graph = page.locator("#graph")
      await expect(page.getByRole("checkbox", { name: "Structure edges" })).toBeChecked()
      await expect(page.getByRole("checkbox", { name: "Dependency edges" })).toBeChecked()
      await expect(graph).toHaveAttribute("data-visible-node-count", "3")
      await expect(graph).toHaveAttribute("data-visible-edge-count", "1")
      await expect(graph).toHaveAttribute("data-graph-node-count", "11")
      await expect(graph).toHaveAttribute("data-directory-node-count", "8")
      await expect(graph).toHaveAttribute("data-structure-edge-count", "10")
      await expect(graph).toHaveAttribute("data-structure-edge-weight", "6")
      await expect(graph).toHaveAttribute("data-dependency-edge-weight", "0.25")
      await expect(graph).toHaveAttribute("data-structure-edges", "visible")
      await expect(graph).toHaveAttribute("data-dependency-edges", "visible")
      await expect(graph).toHaveAttribute("data-rendered-structure-edge-count", "10")
      await expect(graph).toHaveAttribute("data-rendered-dependency-edge-count", "1")
      expect(await readJsonAttribute<readonly DependencyEdgeDiagnostic[]>(graph, "data-rendered-dependency-edges")).toEqual([
        { id: "project-dependency-0", color: "#628bb5", size: 3 },
      ])
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
      await expect(graph).toHaveAttribute("data-visible-node-positions", /.+/u)
      await expect(graph).toHaveAttribute("data-camera-state", /.+/u)
      const nodePositions = await graph.getAttribute("data-visible-node-positions")
      const cameraState = await graph.getAttribute("data-camera-state")
      Assert.isDefined(nodePositions)
      Assert.isDefined(cameraState)
      return { nodePositions, cameraState }
    })

    await test.step("Toggle each edge layer independently without moving nodes", async () => {
      const graph = page.locator("#graph")
      const structureEdges = page.getByRole("checkbox", { name: "Structure edges" })
      const dependencyEdges = page.getByRole("checkbox", { name: "Dependency edges" })
      const expectStableGraph = async (): Promise<void> => {
        await expect(graph).toHaveAttribute("data-visible-node-positions", settledGraphState.nodePositions)
        await expect(graph).toHaveAttribute("data-camera-state", settledGraphState.cameraState)
        await expect(graph).toHaveAttribute("data-visible-node-count", "3")
        await expect(graph).toHaveAttribute("data-visible-edge-count", "1")
      }

      await structureEdges.uncheck()
      await expect(graph).toHaveAttribute("data-structure-edges", "hidden")
      await expect(graph).toHaveAttribute("data-rendered-structure-edge-count", "0")
      await expect(graph).toHaveAttribute("data-rendered-dependency-edge-count", "1")
      await expectStableGraph()
      const nodePositions = await readJsonAttribute<readonly NodeCircleDiagnostic[]>(graph, "data-visible-node-positions")
      const source = nodePositions.find(({ id }) => id === "project-file:src/features/accounts/create.ts")
      const target = nodePositions.find(({ id }) => id === "project-file:src/platform/database/query.ts")
      Assert.isDefined(source)
      Assert.isDefined(target)
      const visibleDependencyScreenshot = await graph.screenshot()

      await dependencyEdges.uncheck()
      await expect(graph).toHaveAttribute("data-dependency-edges", "hidden")
      await expect(graph).toHaveAttribute("data-rendered-structure-edge-count", "0")
      await expect(graph).toHaveAttribute("data-rendered-dependency-edge-count", "0")
      await expect(graph).toHaveAttribute("data-rendered-dependency-edges", "[]")
      await expectStableGraph()
      const hiddenDependencyScreenshot = await graph.screenshot()

      await dependencyEdges.check()
      await expect(graph).toHaveAttribute("data-dependency-edges", "visible")
      await expect(graph).toHaveAttribute("data-rendered-dependency-edge-count", "1")
      await expectStableGraph()
      const restoredDependencyScreenshot = await graph.screenshot()
      const dependencyPixels = await sampleDependencySegmentPixels(
        graph,
        source,
        target,
        visibleDependencyScreenshot,
        hiddenDependencyScreenshot,
        restoredDependencyScreenshot,
      )
      const graphBackground = { red: 13, green: 17, blue: 23, alpha: 255 }
      const dimmedDependency = { red: 40, green: 56, blue: 74, alpha: 255 }
      const opaqueDependency = { red: 98, green: 139, blue: 181, alpha: 255 }
      expect(dependencyPixels.matchingPixelCount).toBeGreaterThan(0)
      expect(rgbDistance(dependencyPixels.visible, dimmedDependency)).toBeLessThanOrEqual(16)
      expect(rgbDistance(dependencyPixels.hidden, graphBackground)).toBeLessThanOrEqual(4)
      expect(rgbDistance(dependencyPixels.restored, dependencyPixels.visible)).toBeLessThanOrEqual(4)
      expect(rgbDistance(dependencyPixels.visible, graphBackground)).toBeGreaterThan(35)
      expect(rgbDistance(dependencyPixels.visible, graphBackground)).toBeLessThan(rgbDistance(opaqueDependency, graphBackground) * 0.5)

      await dependencyEdges.uncheck()
      await expect(graph).toHaveAttribute("data-dependency-edges", "hidden")
      await expect(graph).toHaveAttribute("data-rendered-dependency-edge-count", "0")
      await structureEdges.check()
      await expect(graph).toHaveAttribute("data-structure-edges", "visible")
      await expect(graph).toHaveAttribute("data-rendered-structure-edge-count", "10")
      await expect(graph).toHaveAttribute("data-rendered-dependency-edge-count", "0")
      await expectStableGraph()

      await dependencyEdges.check()
      await expect(graph).toHaveAttribute("data-dependency-edges", "visible")
      await expect(graph).toHaveAttribute("data-rendered-structure-edge-count", "10")
      await expect(graph).toHaveAttribute("data-rendered-dependency-edge-count", "1")
      await expectStableGraph()
    })

    await test.step("Select directories from the graph and explorer, preview their contents, and focus their structure edges", async () => {
      await page.reload()
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      const graph = page.locator("#graph")
      const graphBounds = await graph.boundingBox()
      Assert.isDefined(graphBounds)
      const circles = await readJsonAttribute<readonly NodeCircleDiagnostic[]>(graph, "data-visible-node-positions")
      const accounts = circles.find(({ id }) => id === "directory:src/features/accounts")
      Assert.isDefined(accounts)

      await page.mouse.click(graphBounds.x + accounts.x, graphBounds.y + accounts.y)
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", accounts.id)
      await expect(page.locator("#selected-node-type")).toHaveText("Directory")
      await expect(page.locator("#selected-path")).toHaveText("src/features/accounts")
      await expect(page.locator("#selected-parent-directory button")).toHaveAttribute("aria-label", "src/features")
      await expect(page.locator("#selected-directory-children button")).toHaveCount(2)
      expect(
        await page
          .locator("#selected-directory-children button")
          .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))),
      ).toEqual(["src/features/accounts/workflows", "src/features/accounts/create.ts"])
      await expect(graph).toHaveAttribute("data-structure-focus", accounts.id)
      await expect(graph).toHaveAttribute("data-focused-structure-edge-count", "3")
      expect(await readJsonAttribute<readonly DependencyEdgeDiagnostic[]>(graph, "data-rendered-dependency-edges")).toEqual([
        { id: "project-dependency-0", color: "#1c2733", size: 3 },
      ])

      const platformDirectory = page.locator('[data-directory-path="src/platform"]')
      await platformDirectory.hover()
      await expect(page.locator("html")).toHaveAttribute("data-hovered-node", "directory:src/platform")
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", accounts.id)
      await expect(page.locator("#selected-path")).toHaveText("src/platform")
      await expect(graph).toHaveAttribute("data-structure-focus", "directory:src/platform")
      await expect(graph).toHaveAttribute("data-focused-structure-edge-count", "2")

      await platformDirectory.click()
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", "directory:src/platform")
      await expect(page.locator("#selected-path")).toHaveText("src/platform")
      await expect(page.locator("#selected-parent-directory button")).toHaveAttribute("aria-label", "src")
      await expect(page.locator("#selected-directory-children button")).toHaveAttribute("aria-label", "src/platform/database")
      await expect(platformDirectory).toHaveAttribute("aria-current", "true")
    })
  })
})

test("shows hovered project-file labels regardless of zoom visibility", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const reportPath = await test.step("Generate a report with one unambiguous project-file label", async () => {
      const projectDirectory = join(temporaryDirectory, "labels")
      await mkdir(projectDirectory, { recursive: true })
      await writeFile(join(projectDirectory, "main.ts"), "export const main = true\n", "utf8")
      const analysis = await analyzeProject({ projectRoot: projectDirectory })
      Assert.isSuccess(analysis)
      const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
      const path = join(temporaryDirectory, "labels.html")
      await writeFile(path, buildHtmlReport(analysis.value, browserBundle), "utf8")
      return path
    })

    await test.step("Override overview hiding while hovered, then preserve zoom visibility after hover", async () => {
      await page.setViewportSize({ width: 1920, height: 1080 })
      await page.goto(pathToFileURL(reportPath).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      const graph = page.locator("#graph")
      await expect(graph).toHaveAttribute("data-file-label-visibility", "hidden")
      await expect(graph).toHaveAttribute("data-rendered-file-labels", "[]")
      const bounds = await graph.boundingBox()
      Assert.isDefined(bounds)
      const nodes = await readJsonAttribute<readonly NodeCircleDiagnostic[]>(graph, "data-visible-node-positions")
      const mainNode = nodes.find(({ id }) => id === "project-file:main.ts")
      Assert.isDefined(mainNode)
      const emptyGraphPoint = graphPointFarthestFromNodes(nodes, bounds.width, bounds.height)
      await page.mouse.move(bounds.x + mainNode.x, bounds.y + mainNode.y)
      await expect(page.locator("html")).toHaveAttribute("data-hovered-node", mainNode.id)
      await expect(graph).toHaveAttribute("data-file-label-visibility", "hidden")
      await expect(graph).toHaveAttribute("data-rendered-file-labels", '["main.ts"]')

      await page.mouse.move(bounds.x + emptyGraphPoint.x, bounds.y + emptyGraphPoint.y)
      await expect(page.locator("html")).not.toHaveAttribute("data-hovered-node")
      await expect(graph).toHaveAttribute("data-rendered-file-labels", "[]")
      await page.mouse.move(bounds.x + mainNode.x, bounds.y + mainNode.y)
      await expect(page.locator("html")).toHaveAttribute("data-hovered-node", mainNode.id)

      for (const maximumRatio of [0.7, 0.4, 0.25, 0.15]) {
        await page.mouse.wheel(0, -120)
        await expect
          .poll(async () => (await readJsonAttribute<{ readonly ratio: number }>(graph, "data-camera-state")).ratio)
          .toBeLessThan(maximumRatio)
      }
      await expect(graph).toHaveAttribute("data-file-label-visibility", "visible")
      await expect(graph).toHaveAttribute("data-rendered-file-labels", '["main.ts"]')
      await page.mouse.move(bounds.x + emptyGraphPoint.x, bounds.y + emptyGraphPoint.y)
      await expect(page.locator("html")).not.toHaveAttribute("data-hovered-node")

      await expect(graph).toHaveAttribute("data-rendered-file-labels", '["main.ts"]')
      const nodeLabels = await readJsonAttribute<readonly NodeLabelDiagnostic[]>(graph, "data-rendered-node-label-rectangles")
      const fileLabel = nodeLabels.find(({ id }) => id === "project-file:main.ts")
      Assert.isDefined(fileLabel)
      expectCenteredAboveNode(fileLabel)
    })
  })
})

test("focuses only the hovered or selected file's direct dependency neighborhood", async ({ page }) => {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    const report = await test.step("Generate a real project with direct, transitive, and unrelated dependencies", async () => {
      const projectDirectory = join(temporaryDirectory, "dependency-neighborhood")
      const sourceDirectory = join(projectDirectory, "src")
      await mkdir(sourceDirectory, { recursive: true })
      await Promise.all([
        writeFile(
          join(sourceDirectory, "consumer.ts"),
          'import { hovered } from "./hovered.js"\nexport const consumer = hovered\n',
          "utf8",
        ),
        writeFile(
          join(sourceDirectory, "hovered.ts"),
          'import { dependency } from "./dependency.js"\nexport const hovered = dependency\n',
          "utf8",
        ),
        writeFile(
          join(sourceDirectory, "dependency.ts"),
          'import { transitive } from "./transitive.js"\nexport const dependency = transitive\n',
          "utf8",
        ),
        writeFile(join(sourceDirectory, "transitive.ts"), 'export const transitive = "transitive"\n', "utf8"),
        writeFile(
          join(sourceDirectory, "unrelated-source.ts"),
          'import { unrelatedTarget } from "./unrelated-target.js"\nexport const unrelatedSource = unrelatedTarget\n',
          "utf8",
        ),
        writeFile(join(sourceDirectory, "unrelated-target.ts"), 'export const unrelatedTarget = "unrelated"\n', "utf8"),
        writeFile(join(sourceDirectory, "isolated.ts"), 'export const isolated = "isolated"\n', "utf8"),
      ])
      const analysis = await analyzeProject({ projectRoot: projectDirectory })
      Assert.isSuccess(analysis)
      const coverageByPath = new Map([
        ["src/hovered.ts", 100],
        ["src/dependency.ts", 50],
        ["src/consumer.ts", 0],
        ["src/transitive.ts", 25],
        ["src/unrelated-source.ts", 75],
        ["src/unrelated-target.ts", 10],
        ["src/isolated.ts", 90],
      ])
      const analysisWithCoverage = {
        ...analysis.value,
        files: analysis.value.files.map((file) => {
          const coverage = coverageByPath.get(file.path)
          Assert.isDefined(coverage)
          return { ...file, coverage: { lines: coverage } }
        }),
      }
      const dependencyEdgeId = (source: string, target: string): string => {
        const index = analysis.value.dependencies.findIndex((dependency) => dependency.source === source && dependency.target === target)
        if (index === -1) {
          throw new Error(`Expected the real analyzer to resolve ${source} -> ${target}.`)
        }
        return `project-dependency-${index}`
      }
      const browserBundle = await readFile(join(process.cwd(), "dist", "report", "browser.js"), "utf8")
      const path = join(temporaryDirectory, "dependency-neighborhood.html")
      await writeFile(path, buildHtmlReport(analysisWithCoverage, browserBundle), "utf8")
      return {
        path,
        edgeIds: {
          consumer: dependencyEdgeId("src/consumer.ts", "src/hovered.ts"),
          dependency: dependencyEdgeId("src/hovered.ts", "src/dependency.ts"),
          transitive: dependencyEdgeId("src/dependency.ts", "src/transitive.ts"),
          unrelated: dependencyEdgeId("src/unrelated-source.ts", "src/unrelated-target.ts"),
        },
      }
    })

    await test.step("Render distinct direct-neighborhood treatments without changing coverage fills", async () => {
      await page.setViewportSize({ width: 1920, height: 1080 })
      await page.goto(pathToFileURL(report.path).href)
      await expect(page.locator("html")).toHaveAttribute("data-show-me-ready", "true")
      const graph = page.locator("#graph")
      const structureEdges = page.getByRole("checkbox", { name: "Structure edges" })
      const dependencyEdges = page.getByRole("checkbox", { name: "Dependency edges" })
      const structureCanvas = graph.locator("canvas.sigma-structure")
      await expect(graph).toHaveAttribute("data-rendered-structure-edge-count", /^[1-9]\d*$/u)
      const normalStructureEdgeAlpha = await maximumCanvasAlpha(structureCanvas)
      await structureEdges.uncheck()
      await expect(graph).toHaveAttribute("data-rendered-structure-edge-count", "0")

      const circles = await readJsonAttribute<readonly NodeCircleDiagnostic[]>(graph, "data-visible-node-positions")
      const circleById = new Map(circles.map((circle) => [circle.id, circle]))
      const hovered = circleById.get("project-file:src/hovered.ts")
      const dependency = circleById.get("project-file:src/dependency.ts")
      const consumer = circleById.get("project-file:src/consumer.ts")
      const transitive = circleById.get("project-file:src/transitive.ts")
      const unrelated = circleById.get("project-file:src/unrelated-source.ts")
      const unrelatedTarget = circleById.get("project-file:src/unrelated-target.ts")
      Assert.isDefined(hovered)
      Assert.isDefined(dependency)
      Assert.isDefined(consumer)
      Assert.isDefined(transitive)
      Assert.isDefined(unrelated)
      Assert.isDefined(unrelatedTarget)
      const colors = await readJsonAttribute<readonly NodeColorDiagnostic[]>(graph, "data-visible-node-colors")
      expect(colors).toEqual(
        expect.arrayContaining([
          { id: hovered.id, color: "#16a34a" },
          { id: dependency.id, color: "#eab308" },
          { id: consumer.id, color: "#dc2626" },
        ]),
      )
      const baselineScreenshot = await graph.screenshot()
      const graphBounds = await graph.boundingBox()
      Assert.isDefined(graphBounds)
      await page.mouse.move(graphBounds.x + hovered.x, graphBounds.y + hovered.y)
      await expect(page.locator("html")).toHaveAttribute("data-hovered-node", hovered.id)
      await expect(graph).toHaveAttribute("data-rendered-dependency-focus-ring-count", "3")

      const focus = await readJsonAttribute<DependencyFocusDiagnostic>(graph, "data-dependency-focus")
      expect(focus).toEqual({
        nodeId: hovered.id,
        dependencyNodeIds: [dependency.id],
        consumerNodeIds: [consumer.id],
      })
      expect(focus.dependencyNodeIds).not.toContain(transitive.id)
      expect(focus.consumerNodeIds).not.toContain(transitive.id)
      expect([...focus.dependencyNodeIds, ...focus.consumerNodeIds]).not.toContain(unrelated.id)

      const renderedEdges = await readJsonAttribute<readonly DependencyEdgeDiagnostic[]>(graph, "data-rendered-dependency-edges")
      const renderedEdgeById = new Map(renderedEdges.map((edge) => [edge.id, edge]))
      expect(renderedEdgeById.get(report.edgeIds.consumer)).toEqual({
        id: report.edgeIds.consumer,
        color: "#ff9b71",
        size: 5.2,
      })
      expect(renderedEdgeById.get(report.edgeIds.dependency)).toEqual({
        id: report.edgeIds.dependency,
        color: "#46d7c6",
        size: 4.4,
      })
      expect(renderedEdgeById.get(report.edgeIds.transitive)).toEqual({
        id: report.edgeIds.transitive,
        color: "#1c2733",
        size: 3,
      })
      expect(renderedEdgeById.get(report.edgeIds.unrelated)).toEqual({
        id: report.edgeIds.unrelated,
        color: "#1c2733",
        size: 3,
      })

      await structureEdges.evaluate((element) => {
        if (!(element instanceof HTMLInputElement)) {
          throw new Error("Structure edge control is not a checkbox.")
        }
        element.click()
      })
      await expect(structureEdges).toBeChecked()
      await expect(page.locator("html")).toHaveAttribute("data-hovered-node", hovered.id)
      await expect(graph).toHaveAttribute("data-rendered-structure-edge-count", /^[1-9]\d*$/u)
      const dimmedStructureEdgeAlpha = await maximumCanvasAlpha(structureCanvas)
      expect(dimmedStructureEdgeAlpha).toBeGreaterThan(0)
      expect(dimmedStructureEdgeAlpha).toBeLessThan(normalStructureEdgeAlpha * 0.7)
      await structureEdges.evaluate((element) => {
        if (!(element instanceof HTMLInputElement)) {
          throw new Error("Structure edge control is not a checkbox.")
        }
        element.click()
      })
      await expect(structureEdges).not.toBeChecked()
      await expect(page.locator("html")).toHaveAttribute("data-hovered-node", hovered.id)
      const focusedScreenshot = await graph.screenshot()

      await dependencyEdges.evaluate((element) => {
        if (!(element instanceof HTMLInputElement)) {
          throw new Error("Dependency edge control is not a checkbox.")
        }
        element.click()
      })
      await expect(dependencyEdges).not.toBeChecked()
      await expect(page.locator("html")).toHaveAttribute("data-hovered-node", hovered.id)
      await expect(graph).toHaveAttribute("data-dependency-edges", "hidden")
      await expect(graph).toHaveAttribute("data-rendered-dependency-edge-count", "0")
      await expect(graph).toHaveAttribute("data-rendered-structure-edge-count", "0")
      await expect(graph).toHaveAttribute("data-rendered-dependency-focus-ring-count", "3")
      const hiddenEdgesScreenshot = await graph.screenshot()

      const pixels = await sampleDependencyFocusPixels(
        graph,
        [hovered, dependency, consumer, transitive, unrelated],
        [
          { id: report.edgeIds.consumer, source: consumer, target: hovered, expected: [255, 155, 113] },
          { id: report.edgeIds.dependency, source: hovered, target: dependency, expected: [70, 215, 198] },
          { id: report.edgeIds.transitive, source: dependency, target: transitive, expected: [28, 39, 51] },
          { id: report.edgeIds.unrelated, source: unrelated, target: unrelatedTarget, expected: [28, 39, 51] },
        ],
        baselineScreenshot,
        focusedScreenshot,
        hiddenEdgesScreenshot,
      )
      const nodePixelsById = new Map(pixels.nodes.map((node) => [node.id, node]))
      const hoveredPixels = nodePixelsById.get(hovered.id)
      const dependencyPixels = nodePixelsById.get(dependency.id)
      const consumerPixels = nodePixelsById.get(consumer.id)
      const transitivePixels = nodePixelsById.get(transitive.id)
      const unrelatedPixels = nodePixelsById.get(unrelated.id)
      Assert.isDefined(hoveredPixels)
      Assert.isDefined(dependencyPixels)
      Assert.isDefined(consumerPixels)
      Assert.isDefined(transitivePixels)
      Assert.isDefined(unrelatedPixels)
      expectRgbNear(hoveredPixels.baselineCenter, "#16a34a")
      expectRgbNear(hoveredPixels.focusedCenter, "#16a34a")
      expectRgbNear(dependencyPixels.baselineCenter, "#eab308")
      expectRgbNear(dependencyPixels.focusedCenter, "#eab308")
      expectRgbNear(consumerPixels.baselineCenter, "#dc2626")
      expectRgbNear(consumerPixels.focusedCenter, "#dc2626")
      expect(hoveredPixels.focusRingPixelCounts.hovered).toBeGreaterThan(0)
      expect(dependencyPixels.focusRingPixelCounts.dependency).toBeGreaterThan(0)
      expect(consumerPixels.focusRingPixelCounts.consumer).toBeGreaterThan(0)
      expect(transitivePixels.focusRingPixelCounts.dependency).toBe(0)
      expect(transitivePixels.focusRingPixelCounts.consumer).toBe(0)
      expect(unrelatedPixels.focusRingPixelCounts.dependency).toBe(0)
      expect(unrelatedPixels.focusRingPixelCounts.consumer).toBe(0)
      for (const edge of pixels.edges) {
        expect(edge.focusedToHiddenPixelCount, JSON.stringify(edge)).toBeGreaterThan(0)
      }
      expect(pixels.edgeNoise.baselineNormalPixelCount).toBeGreaterThan(pixels.edgeNoise.focusedNormalPixelCount)
      expect(pixels.edgeNoise.focusedDimmedPixelCount).toBeGreaterThan(0)

      await dependencyEdges.evaluate((element) => {
        if (!(element instanceof HTMLInputElement)) {
          throw new Error("Dependency edge control is not a checkbox.")
        }
        element.click()
      })
      await expect(dependencyEdges).toBeChecked()
      await expect(graph).toHaveAttribute("data-rendered-dependency-edge-count", "4")
      const restoredEdges = await readJsonAttribute<readonly DependencyEdgeDiagnostic[]>(graph, "data-rendered-dependency-edges")
      expect(restoredEdges).toEqual(renderedEdges)

      await page.mouse.click(graphBounds.x + hovered.x, graphBounds.y + hovered.y)
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", hovered.id)
      await page.locator("header").hover()
      await expect(page.locator("html")).not.toHaveAttribute("data-hovered-node", hovered.id)
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", hovered.id)
      expect(await readJsonAttribute<DependencyFocusDiagnostic>(graph, "data-dependency-focus")).toEqual(focus)
      await expect(graph).toHaveAttribute("data-rendered-dependency-focus-ring-count", "3")
      expect(await readJsonAttribute<readonly DependencyEdgeDiagnostic[]>(graph, "data-rendered-dependency-edges")).toEqual(renderedEdges)

      const cameraState = await graph.getAttribute("data-camera-state")
      Assert.isDefined(cameraState)
      await page.locator('#file-list button[data-node-id="project-file:src/hovered.ts"]').hover()
      await expect(page.locator("html")).toHaveAttribute("data-hovered-node", hovered.id)
      await expect(page.locator("#selected-node-type")).toHaveText("Project file")
      await expect(page.locator("#selected-path")).toHaveText("src/hovered.ts")
      await expect(page.locator("#tooltip")).toHaveCount(0)
      await expect(graph).toHaveAttribute("data-rendered-dependency-focus-ring-count", "3")
      await expect(graph).toHaveAttribute("data-camera-state", cameraState)
      expect(await readJsonAttribute<DependencyFocusDiagnostic>(graph, "data-dependency-focus")).toEqual(focus)
      expect(await readJsonAttribute<readonly DependencyEdgeDiagnostic[]>(graph, "data-rendered-dependency-edges")).toEqual(renderedEdges)

      await page.locator("header").hover()
      await expect(page.locator("html")).not.toHaveAttribute("data-hovered-node", hovered.id)
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", hovered.id)
      expect(await readJsonAttribute<DependencyFocusDiagnostic>(graph, "data-dependency-focus")).toEqual(focus)
      await expect(graph).toHaveAttribute("data-rendered-dependency-focus-ring-count", "3")

      const isolatedNodeId = "project-file:src/isolated.ts"
      await page.locator(`#file-list button[data-node-id="${isolatedNodeId}"]`).hover()
      await expect(page.locator("html")).toHaveAttribute("data-hovered-node", isolatedNodeId)
      await expect(page.locator("html")).toHaveAttribute("data-selected-node", hovered.id)
      expect(await readJsonAttribute<DependencyFocusDiagnostic>(graph, "data-dependency-focus")).toEqual({
        nodeId: isolatedNodeId,
        dependencyNodeIds: [],
        consumerNodeIds: [],
      })
      await expect(graph).toHaveAttribute("data-rendered-dependency-focus-ring-count", "1")
      const isolatedFocusEdges = await readJsonAttribute<readonly DependencyEdgeDiagnostic[]>(graph, "data-rendered-dependency-edges")
      const isolatedFocusEdgeById = new Map(isolatedFocusEdges.map((edge) => [edge.id, edge]))
      for (const edgeId of Object.values(report.edgeIds)) {
        expect(isolatedFocusEdgeById.get(edgeId)).toEqual({
          id: edgeId,
          color: "#1c2733",
          size: 3,
        })
      }
      await structureEdges.evaluate((element) => {
        if (!(element instanceof HTMLInputElement)) {
          throw new Error("Structure edge control is not a checkbox.")
        }
        element.click()
      })
      await expect(structureEdges).toBeChecked()
      await expect(page.locator("html")).toHaveAttribute("data-hovered-node", isolatedNodeId)
      await expect(graph).toHaveAttribute("data-rendered-structure-edge-count", /^[1-9]\d*$/u)
      const isolatedFocusStructureEdgeAlpha = await maximumCanvasAlpha(structureCanvas)
      expect(isolatedFocusStructureEdgeAlpha).toBeGreaterThan(0)
      expect(isolatedFocusStructureEdgeAlpha).toBeLessThan(normalStructureEdgeAlpha * 0.7)
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

test("explains project-file coverage colors and shows exact coverage in node details", async ({ page }) => {
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
    })

    await test.step("Select each project-file coverage state to inspect its exact value", async () => {
      for (const { path, coverage } of [
        { path: "covered.ts", coverage: "100%" },
        { path: "partial.ts", coverage: "50%" },
        { path: "uncovered.ts", coverage: "0%" },
        { path: "missing.ts", coverage: "Not available" },
      ]) {
        await page.locator("#file-list").getByRole("button", { name: path, exact: true }).click()
        await expect(page.locator("html")).toHaveAttribute("data-selected-node", `project-file:${path}`)
        await expect(page.locator("#selected-coverage")).toHaveText(coverage)
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
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-edge-count", "7")
      await expect(page.locator('#file-list button[data-node-id^="project-file:"]')).toHaveCount(8)
      await page.getByRole("button", { name: "apps/frontend/src/main.ts", exact: true }).click()
      await expect(page.locator("#selected-dependencies")).toHaveText("3")
      await expect(page.locator("#selected-dependency-nodes")).toContainText("Type only")
      await page.getByRole("checkbox", { name: "Type-only dependencies" }).uncheck()
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-edge-count", "6")
      await expect(page.locator("#selected-dependencies")).toHaveText("2")
      await page.getByRole("checkbox", { name: "Type-only dependencies" }).check()
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-edge-count", "7")
      await expect(page.locator("#selected-dependencies")).toHaveText("3")
    })

    await test.step("Scope to backend and retain only its external packages", async () => {
      await page.getByRole("checkbox", { name: "@fixture/root", exact: true }).uncheck()
      await page.getByRole("checkbox", { name: "@fixture/frontend", exact: true }).uncheck()
      await page.getByRole("checkbox", { name: "@fixture/shared", exact: true }).uncheck()
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-node-count", "2")
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-edge-count", "1")
      await expect(page.locator("#project-file-count")).toHaveText("2 / 8 project files")
      await expect(page.locator('#file-list button[data-node-id^="project-file:"]')).toHaveCount(2)
      await expect(page.getByRole("button", { name: "apps/frontend/src/main.ts", exact: true })).toHaveCount(0)
      await page.getByRole("checkbox", { name: "External packages" }).check()
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-node-count", "3")
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-edge-count", "2")
      await expect(page.locator("#external-package-list button")).toHaveText(["backend-libraryExternal package"])
      await expect(page.locator("#external-package-list")).not.toContainText("frontend-library")
    })

    await test.step("Fit the current filtered graph after explorer hover and zoom without undoing filters", async () => {
      const graph = page.locator("#graph")
      const file = page.locator('#file-list button[data-node-id^="project-file:"]').first()
      const hoveredNodeId = await file.getAttribute("data-node-id")
      const settledCamera = await graph.getAttribute("data-camera-state")
      Assert.isDefined(hoveredNodeId)
      Assert.isDefined(settledCamera)
      await file.hover()
      await expect(page.locator("html")).toHaveAttribute("data-hovered-node", hoveredNodeId)
      await expect(graph).toHaveAttribute("data-camera-state", settledCamera)
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
      await expect(page.locator("#graph")).toHaveAttribute("data-visible-edge-count", "7")
      await expect(page.locator("#project-file-count")).toHaveText("8 / 8 project files")
      await expect(page.locator('#file-list button[data-node-id^="project-file:"]')).toHaveCount(8)
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
      await expect(page.locator('#file-list button[data-node-id^="project-file:"]')).toHaveCount(0)

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

type NodeLabelDiagnostic = DirectoryLabelDiagnostic & {
  readonly nodeKind: "project-file" | "directory"
  readonly nodeSize: number
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

type NodeColorDiagnostic = {
  readonly id: string
  readonly color: string
}

type DependencyFocusDiagnostic = {
  readonly nodeId: string
  readonly dependencyNodeIds: readonly string[]
  readonly consumerNodeIds: readonly string[]
}

type DependencyFocusPixelDiagnostic = {
  readonly nodes: ReadonlyArray<{
    readonly id: string
    readonly baselineCenter: RgbDiagnostic
    readonly focusedCenter: RgbDiagnostic
    readonly focusRingPixelCounts: {
      readonly hovered: number
      readonly dependency: number
      readonly consumer: number
    }
  }>
  readonly edges: ReadonlyArray<{
    readonly id: string
    readonly focusedToHiddenPixelCount: number
    readonly closestFocused: RgbDiagnostic
    readonly closestHidden: RgbDiagnostic
  }>
  readonly edgeNoise: {
    readonly baselineNormalPixelCount: number
    readonly focusedNormalPixelCount: number
    readonly focusedDimmedPixelCount: number
  }
}

type DependencyEdgeDiagnostic = {
  readonly id: string
  readonly color: string
  readonly size: number
}

type DependencyEdgePixelDiagnostic = {
  readonly matchingPixelCount: number
  readonly sampledPixelCount: number
  readonly x: number
  readonly y: number
  readonly visible: RgbDiagnostic
  readonly hidden: RgbDiagnostic
  readonly restored: RgbDiagnostic
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

async function maximumCanvasAlpha(canvas: Locator): Promise<number> {
  return await canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error("Expected a canvas element.")
    }
    const context = element.getContext("2d", { willReadFrequently: true })
    if (context === null) {
      throw new Error("Canvas pixels are not readable.")
    }
    const pixels = context.getImageData(0, 0, element.width, element.height).data
    let maximumAlpha = 0
    for (let index = 3; index < pixels.length; index += 4) {
      maximumAlpha = Math.max(maximumAlpha, pixels[index] ?? 0)
    }
    return maximumAlpha
  })
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

function expectCenteredAboveNode(label: NodeLabelDiagnostic): void {
  expect((label.bounds.left + label.bounds.right) / 2).toBeCloseTo(label.nodeX, 5)
  expect(label.bounds.bottom).toBeLessThan(label.nodeY - label.nodeSize)
}

function graphPointFarthestFromNodes(
  nodes: readonly NodeCircleDiagnostic[],
  width: number,
  height: number,
): { readonly x: number; readonly y: number } {
  const [point] = [
    { x: 1, y: 1 },
    { x: width - 1, y: 1 },
    { x: 1, y: height - 1 },
    { x: width - 1, y: height - 1 },
  ].toSorted((left, right) => {
    const minimumClearance = (candidate: { readonly x: number; readonly y: number }): number =>
      Math.min(...nodes.map((node) => Math.hypot(candidate.x - node.x, candidate.y - node.y) - node.radius))
    return minimumClearance(right) - minimumClearance(left)
  })
  Assert.isDefined(point)
  return point
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
      // Exclude the plate's left padding so foreground matches inside this region can only be label glyphs.
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

async function sampleDependencyFocusPixels(
  graph: Locator,
  nodes: readonly NodeCircleDiagnostic[],
  edges: ReadonlyArray<{
    readonly id: string
    readonly source: NodeCircleDiagnostic
    readonly target: NodeCircleDiagnostic
    readonly expected: readonly [number, number, number]
  }>,
  baselineScreenshot: Buffer,
  focusedScreenshot: Buffer,
  hiddenEdgesScreenshot: Buffer,
): Promise<DependencyFocusPixelDiagnostic> {
  return await graph.evaluate(
    async (container, diagnostic): Promise<DependencyFocusPixelDiagnostic> => {
      const loadScreenshot = async (screenshotBase64: string): Promise<CanvasRenderingContext2D> => {
        const image = new Image()
        image.src = `data:image/png;base64,${screenshotBase64}`
        await image.decode()
        const canvas = document.createElement("canvas")
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext("2d", { willReadFrequently: true })
        if (context === null) {
          throw new Error("Dependency-focus screenshot is not readable.")
        }
        context.drawImage(image, 0, 0)
        return context
      }
      const [baseline, focused, hidden] = await Promise.all([
        loadScreenshot(diagnostic.baselineScreenshotBase64),
        loadScreenshot(diagnostic.focusedScreenshotBase64),
        loadScreenshot(diagnostic.hiddenEdgesScreenshotBase64),
      ])
      if (
        container.clientWidth === 0 ||
        container.clientHeight === 0 ||
        baseline.canvas.width !== focused.canvas.width ||
        baseline.canvas.height !== focused.canvas.height ||
        baseline.canvas.width !== hidden.canvas.width ||
        baseline.canvas.height !== hidden.canvas.height
      ) {
        throw new Error("Dependency-focus screenshots do not share one stable viewport.")
      }

      const scaleX = focused.canvas.width / container.clientWidth
      const scaleY = focused.canvas.height / container.clientHeight
      const pixelAt = (context: CanvasRenderingContext2D, x: number, y: number): RgbDiagnostic => {
        const pixel = context.getImageData(
          Math.max(0, Math.min(context.canvas.width - 1, Math.round(x * scaleX))),
          Math.max(0, Math.min(context.canvas.height - 1, Math.round(y * scaleY))),
          1,
          1,
        ).data
        return { red: pixel[0] ?? 0, green: pixel[1] ?? 0, blue: pixel[2] ?? 0, alpha: pixel[3] ?? 0 }
      }
      const colorDistance = (color: RgbDiagnostic, target: readonly [number, number, number]): number =>
        Math.hypot(color.red - target[0], color.green - target[1], color.blue - target[2])
      const focusColors = {
        hovered: [245, 249, 255],
        dependency: [70, 215, 198],
        consumer: [255, 155, 113],
      } as const
      const nodeSamples = diagnostic.nodes.map((node) => {
        const focusRingPixelCounts = { hovered: 0, dependency: 0, consumer: 0 }
        const innerRadius = node.radius + 2
        const outerRadius = node.radius + 12
        const left = Math.max(0, Math.floor((node.x - outerRadius) * scaleX))
        const right = Math.min(focused.canvas.width - 1, Math.ceil((node.x + outerRadius) * scaleX))
        const top = Math.max(0, Math.floor((node.y - outerRadius) * scaleY))
        const bottom = Math.min(focused.canvas.height - 1, Math.ceil((node.y + outerRadius) * scaleY))
        for (let pixelY = top; pixelY <= bottom; pixelY += 1) {
          for (let pixelX = left; pixelX <= right; pixelX += 1) {
            const viewportX = pixelX / scaleX
            const viewportY = pixelY / scaleY
            const distanceFromNode = Math.hypot(viewportX - node.x, viewportY - node.y)
            if (distanceFromNode < innerRadius || distanceFromNode > outerRadius) {
              continue
            }
            const pixel = focused.getImageData(pixelX, pixelY, 1, 1).data
            const color = { red: pixel[0] ?? 0, green: pixel[1] ?? 0, blue: pixel[2] ?? 0, alpha: pixel[3] ?? 0 }
            if (color.alpha < 200) {
              continue
            }
            if (colorDistance(color, focusColors.hovered) <= 18) {
              focusRingPixelCounts.hovered += 1
            }
            if (colorDistance(color, focusColors.dependency) <= 18) {
              focusRingPixelCounts.dependency += 1
            }
            if (colorDistance(color, focusColors.consumer) <= 18) {
              focusRingPixelCounts.consumer += 1
            }
          }
        }
        return {
          id: node.id,
          baselineCenter: pixelAt(baseline, node.x, node.y),
          focusedCenter: pixelAt(focused, node.x, node.y),
          focusRingPixelCounts,
        }
      })

      const graphBackground = [13, 17, 23] as const
      const edgeSamples = diagnostic.edges.map((edge) => {
        const deltaX = edge.target.x - edge.source.x
        const deltaY = edge.target.y - edge.source.y
        const segmentLength = Math.hypot(deltaX, deltaY)
        if (segmentLength === 0) {
          throw new Error(`Dependency-focus edge ${edge.id} has coincident endpoints.`)
        }
        const perpendicularX = -deltaY / segmentLength
        const perpendicularY = deltaX / segmentLength
        const sampledCoordinates = new Set<string>()
        let focusedToHiddenPixelCount = 0
        let closestFocused = { red: 0, green: 0, blue: 0, alpha: 0 }
        let closestHidden = { red: 0, green: 0, blue: 0, alpha: 0 }
        let closestScore = Number.POSITIVE_INFINITY
        for (let step = 0; step <= 80; step += 1) {
          const progress = 0.25 + (step / 80) * 0.5
          for (let offset = -4; offset <= 4; offset += 0.5) {
            const x = edge.source.x + deltaX * progress + perpendicularX * offset
            const y = edge.source.y + deltaY * progress + perpendicularY * offset
            const coordinate = `${Math.round(x * scaleX)},${Math.round(y * scaleY)}`
            if (sampledCoordinates.has(coordinate)) {
              continue
            }
            sampledCoordinates.add(coordinate)
            const focusedPixel = pixelAt(focused, x, y)
            const hiddenPixel = pixelAt(hidden, x, y)
            const focusedDistance = colorDistance(focusedPixel, edge.expected)
            const hiddenDistance = colorDistance(hiddenPixel, graphBackground)
            if (focusedDistance <= 18 && hiddenDistance <= 4) {
              focusedToHiddenPixelCount += 1
            }
            const score = focusedDistance + hiddenDistance
            if (score < closestScore) {
              closestScore = score
              closestFocused = focusedPixel
              closestHidden = hiddenPixel
            }
          }
        }
        return { id: edge.id, focusedToHiddenPixelCount, closestFocused, closestHidden }
      })
      const countPixelsNear = (context: CanvasRenderingContext2D, target: readonly [number, number, number]): number => {
        const pixels = context.getImageData(0, 0, context.canvas.width, context.canvas.height).data
        let count = 0
        for (let index = 0; index < pixels.length; index += 4) {
          const color = {
            red: pixels[index] ?? 0,
            green: pixels[index + 1] ?? 0,
            blue: pixels[index + 2] ?? 0,
            alpha: pixels[index + 3] ?? 0,
          }
          if (color.alpha === 255 && colorDistance(color, target) <= 4) {
            count += 1
          }
        }
        return count
      }
      const normalEdgeColor = [40, 56, 74] as const
      const dimmedEdgeColor = [28, 39, 51] as const
      const edgeNoise = {
        baselineNormalPixelCount: countPixelsNear(baseline, normalEdgeColor),
        focusedNormalPixelCount: countPixelsNear(focused, normalEdgeColor),
        focusedDimmedPixelCount: countPixelsNear(focused, dimmedEdgeColor),
      }
      return { nodes: nodeSamples, edges: edgeSamples, edgeNoise }
    },
    {
      nodes,
      edges,
      baselineScreenshotBase64: baselineScreenshot.toString("base64"),
      focusedScreenshotBase64: focusedScreenshot.toString("base64"),
      hiddenEdgesScreenshotBase64: hiddenEdgesScreenshot.toString("base64"),
    },
  )
}

async function sampleDependencySegmentPixels(
  graph: Locator,
  source: NodeCircleDiagnostic,
  target: NodeCircleDiagnostic,
  visibleScreenshot: Buffer,
  hiddenScreenshot: Buffer,
  restoredScreenshot: Buffer,
): Promise<DependencyEdgePixelDiagnostic> {
  return await graph.evaluate(
    async (container, diagnostic): Promise<DependencyEdgePixelDiagnostic> => {
      const loadScreenshot = async (screenshotBase64: string): Promise<CanvasRenderingContext2D> => {
        const image = new Image()
        image.src = `data:image/png;base64,${screenshotBase64}`
        await image.decode()
        const canvas = document.createElement("canvas")
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext("2d", { willReadFrequently: true })
        if (context === null) {
          throw new Error("Dependency-edge screenshot is not readable.")
        }
        context.drawImage(image, 0, 0)
        return context
      }
      const [visible, hidden, restored] = await Promise.all([
        loadScreenshot(diagnostic.visibleScreenshotBase64),
        loadScreenshot(diagnostic.hiddenScreenshotBase64),
        loadScreenshot(diagnostic.restoredScreenshotBase64),
      ])
      if (
        container.clientWidth === 0 ||
        container.clientHeight === 0 ||
        visible.canvas.width !== hidden.canvas.width ||
        visible.canvas.height !== hidden.canvas.height ||
        visible.canvas.width !== restored.canvas.width ||
        visible.canvas.height !== restored.canvas.height
      ) {
        throw new Error("Dependency-edge screenshots do not share one stable viewport.")
      }

      const scaleX = visible.canvas.width / container.clientWidth
      const scaleY = visible.canvas.height / container.clientHeight
      const pixelAt = (context: CanvasRenderingContext2D, x: number, y: number): RgbDiagnostic => {
        const pixel = context.getImageData(
          Math.max(0, Math.min(context.canvas.width - 1, Math.round(x * scaleX))),
          Math.max(0, Math.min(context.canvas.height - 1, Math.round(y * scaleY))),
          1,
          1,
        ).data
        return { red: pixel[0] ?? 0, green: pixel[1] ?? 0, blue: pixel[2] ?? 0, alpha: pixel[3] ?? 0 }
      }
      const colorDistance = (left: RgbDiagnostic, right: readonly [number, number, number]): number =>
        Math.hypot(left.red - right[0], left.green - right[1], left.blue - right[2])
      const expectedDimmed = [40, 56, 74] as const
      const graphBackground = [13, 17, 23] as const
      const deltaX = diagnostic.target.x - diagnostic.source.x
      const deltaY = diagnostic.target.y - diagnostic.source.y
      const segmentLength = Math.hypot(deltaX, deltaY)
      if (segmentLength === 0) {
        throw new Error("Dependency endpoints occupy the same viewport position.")
      }
      const perpendicularX = -deltaY / segmentLength
      const perpendicularY = deltaX / segmentLength
      const sampledCoordinates = new Set<string>()
      let matchingPixelCount = 0
      let best:
        | {
            readonly x: number
            readonly y: number
            readonly visible: RgbDiagnostic
            readonly hidden: RgbDiagnostic
            readonly restored: RgbDiagnostic
            readonly score: number
          }
        | undefined

      // Inspect only the middle of the straight edge body, away from both node discs and the target arrowhead.
      for (let step = 0; step <= 70; step += 1) {
        const progress = 0.3 + (step / 70) * 0.35
        for (let offset = -3; offset <= 3; offset += 0.5) {
          const x = diagnostic.source.x + deltaX * progress + perpendicularX * offset
          const y = diagnostic.source.y + deltaY * progress + perpendicularY * offset
          const pixelX = Math.round(x * scaleX)
          const pixelY = Math.round(y * scaleY)
          const coordinate = `${pixelX},${pixelY}`
          if (sampledCoordinates.has(coordinate)) {
            continue
          }
          sampledCoordinates.add(coordinate)
          const visiblePixel = pixelAt(visible, x, y)
          const hiddenPixel = pixelAt(hidden, x, y)
          const restoredPixel = pixelAt(restored, x, y)
          const visibleDistance = colorDistance(visiblePixel, expectedDimmed)
          const hiddenDistance = colorDistance(hiddenPixel, graphBackground)
          const restoredDistance = Math.hypot(
            restoredPixel.red - visiblePixel.red,
            restoredPixel.green - visiblePixel.green,
            restoredPixel.blue - visiblePixel.blue,
          )
          if (visibleDistance <= 16 && hiddenDistance <= 4 && restoredDistance <= 4) {
            matchingPixelCount += 1
          }
          const score = visibleDistance + hiddenDistance + restoredDistance
          if (best === undefined || score < best.score) {
            best = { x: pixelX, y: pixelY, visible: visiblePixel, hidden: hiddenPixel, restored: restoredPixel, score }
          }
        }
      }
      if (best === undefined) {
        throw new Error("Dependency segment produced no sample coordinates.")
      }
      return {
        matchingPixelCount,
        sampledPixelCount: sampledCoordinates.size,
        x: best.x,
        y: best.y,
        visible: best.visible,
        hidden: best.hidden,
        restored: best.restored,
      }
    },
    {
      source,
      target,
      visibleScreenshotBase64: visibleScreenshot.toString("base64"),
      hiddenScreenshotBase64: hiddenScreenshot.toString("base64"),
      restoredScreenshotBase64: restoredScreenshot.toString("base64"),
    },
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

function rgbDistance(left: RgbDiagnostic, right: RgbDiagnostic): number {
  return Math.hypot(left.red - right.red, left.green - right.green, left.blue - right.blue)
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
