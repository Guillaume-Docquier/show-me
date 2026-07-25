import { createHash } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { pathToFileURL } from "node:url"
import { TypeGuard } from "@guillaume-docquier/tools-ts"
import { chromium, type Locator, type Page } from "@playwright/test"

type PhaseMeasurement = {
  readonly phase: string
  readonly durationMilliseconds: number
}

type GraphCircle = {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly radius: number
}

type BrowserDiagnostics = {
  readonly browserLoadMilliseconds: number
  readonly presentationSignature: string
  readonly measurements: readonly PhaseMeasurement[]
  readonly graphNodeCount: number
  readonly visibleEdgeCount: number
  readonly layoutStrategy: string
  readonly layoutIterations: number
  readonly layoutCollisionScale: number
  readonly layoutMinimumClearance: number
  readonly circles: readonly GraphCircle[]
}

const [reportPathArgument, resultPathArgument, runKind = "measured"] = process.argv.slice(2)
if (reportPathArgument === undefined || resultPathArgument === undefined) {
  throw new Error("Usage: node benchmarks/run-browser-scenario.ts <report-path> <result-path> [run-kind]")
}

const reportPath = resolve(reportPathArgument)
const resultPath = resolve(resultPathArgument)
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1_920, height: 1_080 } })
  const navigationStartedAt = performance.now()
  await page.goto(pathToFileURL(reportPath).href, { waitUntil: "load", timeout: 120_000 })
  await page.locator("html").waitFor({ state: "attached", timeout: 120_000 })
  await page.locator("html").getAttribute("data-show-me-ready", { timeout: 120_000 })
  const readyMilliseconds = performance.now() - navigationStartedAt
  const graph = page.locator("#graph")
  await graph.getAttribute("data-visible-node-positions", { timeout: 120_000 })

  const rawDiagnostics: unknown = await page.evaluate(() => {
    const root = document.documentElement
    const graphElement = document.querySelector("#graph")
    if (!(graphElement instanceof HTMLElement)) {
      throw new Error("The benchmark report did not render its graph container.")
    }
    return {
      browserLoadMilliseconds: root.dataset.browserLoadMilliseconds,
      presentationSignature: root.dataset.presentationSignature,
      measurements: root.dataset.performanceMeasurements,
      graphNodeCount: graphElement.dataset.graphNodeCount,
      visibleEdgeCount: graphElement.dataset.visibleEdgeCount,
      layoutStrategy: graphElement.dataset.layoutStrategy,
      layoutIterations: graphElement.dataset.layoutIterations,
      layoutCollisionScale: graphElement.dataset.layoutCollisionScale,
      layoutMinimumClearance: graphElement.dataset.layoutMinimumClearance,
      circles: graphElement.dataset.visibleNodePositions,
    }
  })
  const diagnostics = parseBrowserDiagnostics(rawDiagnostics)
  const minimumViewportClearance = minimumCircleClearance(diagnostics.circles)
  if (minimumViewportClearance < -0.05) {
    throw new Error(`Rendered graph contains overlapping node circles; minimum clearance was ${minimumViewportClearance}.`)
  }

  const interactions = {
    zoomMilliseconds: await measureCameraInteraction(page, async () => {
      const bounds = await graph.boundingBox()
      if (bounds === null) {
        throw new Error("The graph has no viewport bounds.")
      }
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.wheel(0, -600)
    }),
    panMilliseconds: await measureCameraInteraction(page, async () => {
      const bounds = await graph.boundingBox()
      if (bounds === null) {
        throw new Error("The graph has no viewport bounds.")
      }
      const x = bounds.x + bounds.width / 2
      const y = bounds.y + bounds.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 80, y + 40, { steps: 4 })
      await page.mouse.up()
    }),
    hoverMilliseconds: await measureNodeInteraction(page, graph, "hover"),
    selectionMilliseconds: await measureNodeInteraction(page, graph, "selection"),
  }

  const result = {
    kind: runKind,
    readyMilliseconds,
    browserLoadMilliseconds: diagnostics.browserLoadMilliseconds,
    phases: diagnostics.measurements,
    graphNodeCount: diagnostics.graphNodeCount,
    visibleEdgeCount: diagnostics.visibleEdgeCount,
    layout: {
      strategy: diagnostics.layoutStrategy,
      iterations: diagnostics.layoutIterations,
      collisionScale: diagnostics.layoutCollisionScale,
      minimumGraphClearance: diagnostics.layoutMinimumClearance,
      minimumViewportClearance,
    },
    interactions,
    presentationSha256: createHash("sha256").update(diagnostics.presentationSignature).digest("hex"),
  }
  await writeFile(resultPath, `${JSON.stringify(result, undefined, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify(result)}\n`)
} finally {
  await browser.close()
}

async function measureCameraInteraction(page: Page, action: () => Promise<void>): Promise<number> {
  const before = await page.locator("#graph").getAttribute("data-camera-state")
  const startedAt = performance.now()
  await action()
  await page.waitForFunction(
    (previous: string | null) => document.querySelector("#graph")?.getAttribute("data-camera-state") !== previous,
    before,
    { timeout: 5_000 },
  )
  return performance.now() - startedAt
}

async function measureNodeInteraction(page: Page, graph: Locator, kind: "hover" | "selection"): Promise<number> {
  const serializedCircles = await graph.getAttribute("data-visible-node-positions")
  if (serializedCircles === null) {
    throw new Error("The benchmark graph did not expose node positions.")
  }
  const circles = parseGraphCircles(parseJson(serializedCircles))
  const target = circles.find(({ id }) => id.startsWith("project-file:"))
  if (target === undefined) {
    throw new Error("The benchmark graph did not contain a project-file circle.")
  }
  const bounds = await graph.boundingBox()
  if (bounds === null) {
    throw new Error("The graph has no viewport bounds.")
  }
  await page.mouse.move(bounds.x + 1, bounds.y + 1)
  const startedAt = performance.now()
  await page.mouse.move(bounds.x + target.x, bounds.y + target.y)
  if (kind === "selection") {
    await page.mouse.click(bounds.x + target.x, bounds.y + target.y)
    await page.locator("html").getAttribute("data-selected-node", { timeout: 5_000 })
  } else {
    await page.locator("html").getAttribute("data-hovered-node", { timeout: 5_000 })
  }
  return performance.now() - startedAt
}

function minimumCircleClearance(circles: readonly GraphCircle[]): number {
  let minimumClearance = Number.POSITIVE_INFINITY
  for (const [index, left] of circles.entries()) {
    for (const right of circles.slice(index + 1)) {
      minimumClearance = Math.min(minimumClearance, Math.hypot(left.x - right.x, left.y - right.y) - left.radius - right.radius)
    }
  }
  return minimumClearance
}

function parseBrowserDiagnostics(value: unknown): BrowserDiagnostics {
  if (!TypeGuard.isRecord(value)) {
    throw new Error("Browser benchmark diagnostics were not an object.")
  }
  return {
    browserLoadMilliseconds: parseNumberField(value, "browserLoadMilliseconds"),
    presentationSignature: parseStringField(value, "presentationSignature"),
    measurements: parsePhaseMeasurements(parseJson(parseStringField(value, "measurements"))),
    graphNodeCount: parseNumberField(value, "graphNodeCount"),
    visibleEdgeCount: parseNumberField(value, "visibleEdgeCount"),
    layoutStrategy: parseStringField(value, "layoutStrategy"),
    layoutIterations: parseNumberField(value, "layoutIterations"),
    layoutCollisionScale: parseNumberField(value, "layoutCollisionScale"),
    layoutMinimumClearance: parseNumberField(value, "layoutMinimumClearance"),
    circles: parseGraphCircles(parseJson(parseStringField(value, "circles"))),
  }
}

function parsePhaseMeasurements(value: unknown): readonly PhaseMeasurement[] {
  if (!TypeGuard.isArray(value)) {
    throw new Error("Browser benchmark phase measurements were not an array.")
  }
  return value.map((measurement) => {
    if (!TypeGuard.isRecord(measurement)) {
      throw new Error("Browser benchmark phase measurement was not an object.")
    }
    return {
      phase: parseStringField(measurement, "phase"),
      durationMilliseconds: parseNumericValue(measurement.durationMilliseconds, "durationMilliseconds"),
    }
  })
}

function parseGraphCircles(value: unknown): readonly GraphCircle[] {
  if (!TypeGuard.isArray(value)) {
    throw new Error("Browser benchmark node circles were not an array.")
  }
  return value.map((circle) => {
    if (!TypeGuard.isRecord(circle)) {
      throw new Error("Browser benchmark node circle was not an object.")
    }
    return {
      id: parseStringField(circle, "id"),
      x: parseNumericValue(circle.x, "x"),
      y: parseNumericValue(circle.y, "y"),
      radius: parseNumericValue(circle.radius, "radius"),
    }
  })
}

function parseStringField(record: Readonly<Record<string, unknown>>, field: string): string {
  const value = record[field]
  if (!TypeGuard.isString(value)) {
    throw new Error(`Browser benchmark diagnostic ${field} was not a string.`)
  }
  return value
}

function parseNumberField(record: Readonly<Record<string, unknown>>, field: string): number {
  return parseNumericValue(Number(parseStringField(record, field)), field)
}

function parseNumericValue(value: unknown, field: string): number {
  if (!TypeGuard.isNumber(value) || !Number.isFinite(value)) {
    throw new Error(`Browser benchmark diagnostic ${field} was not finite.`)
  }
  return value
}

function parseJson(serialized: string): unknown {
  return JSON.parse(serialized)
}
