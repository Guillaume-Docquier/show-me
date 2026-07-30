import { spawn } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { TypeGuard } from "@guillaume-docquier/tools-ts"
import { generateCorpus } from "./generated-corpus.ts"

type PhaseMeasurement = {
  readonly phase: string
  readonly durationMilliseconds: number
}

type CliBenchmarkResult = Readonly<Record<string, unknown>> & {
  readonly durationMilliseconds: number
  readonly peakRssMiB: number
  readonly reportSizeMiB: number
  readonly analysisSha256: string
}

type BrowserBenchmarkResult = Readonly<Record<string, unknown>> & {
  readonly kind: string
  readonly readyMilliseconds: number
  readonly presentationSha256: string
  readonly phases: readonly PhaseMeasurement[]
  readonly interactions: Readonly<Record<string, number>>
}

const benchmarkKind = process.argv[2] ?? "full"
if (benchmarkKind !== "full" && benchmarkKind !== "sentinel") {
  throw new Error("Benchmark kind must be full or sentinel.")
}

const dimensions = benchmarkKind === "full" ? { fileCount: 1_000, minimumLineCount: 5_000 } : { fileCount: 300, minimumLineCount: 500 }
const budgets =
  benchmarkKind === "full"
    ? {
        cliMilliseconds: 7_500,
        peakRssMiB: 775,
        reportSizeMiB: 0.85,
        browserReadyMilliseconds: 900,
        browserFindingsMilliseconds: 50,
        browserLayoutMilliseconds: 500,
        interactionMilliseconds: 800,
      }
    : {
        cliMilliseconds: 8_000,
        peakRssMiB: 750,
        reportSizeMiB: 1,
        browserReadyMilliseconds: 8_000,
        browserFindingsMilliseconds: 500,
        browserLayoutMilliseconds: 5_000,
        interactionMilliseconds: 1_000,
      }
const benchmarkDirectory = resolve(".benchmark", benchmarkKind)
const projectDirectory = resolve(benchmarkDirectory, "project")
const reportPath = resolve(benchmarkDirectory, "show-me.html")
const summaryPath = resolve(benchmarkDirectory, "summary.json")
await mkdir(benchmarkDirectory, { recursive: true })
await rm(summaryPath, { force: true })
const workload = await generateCorpus({
  outputDirectory: projectDirectory,
  fileCount: dimensions.fileCount,
  minimumLineCount: dimensions.minimumLineCount,
})

const coldCliPath = resolve(benchmarkDirectory, "cli-cold.json")
const warmCliPath = resolve(benchmarkDirectory, "cli-warm.json")
await runScenario("benchmarks/run-cli-scenario.ts", [projectDirectory, reportPath, coldCliPath, "cold-process"])
await runScenario("benchmarks/run-cli-scenario.ts", [projectDirectory, reportPath, warmCliPath, "warm-filesystem-cache"])
const firstBrowserPath = resolve(benchmarkDirectory, "browser-first.json")
const repeatedBrowserPath = resolve(benchmarkDirectory, "browser-repeated.json")
await runScenario("benchmarks/run-browser-scenario.ts", [reportPath, firstBrowserPath, "first-browser"])
await runScenario("benchmarks/run-browser-scenario.ts", [reportPath, repeatedBrowserPath, "repeated-browser"])

const coldCli = parseCliBenchmarkResult(await readJson(coldCliPath))
const warmCli = parseCliBenchmarkResult(await readJson(warmCliPath))
const firstBrowser = parseBrowserBenchmarkResult(await readJson(firstBrowserPath))
const repeatedBrowser = parseBrowserBenchmarkResult(await readJson(repeatedBrowserPath))
const summary = {
  benchmarkKind,
  workload,
  budgets,
  coldCli,
  warmCli,
  firstBrowser,
  repeatedBrowser,
}
await writeFile(summaryPath, `${JSON.stringify(summary, undefined, 2)}\n`, "utf8")
if (coldCli.analysisSha256 !== warmCli.analysisSha256) {
  throw new Error("Cold and warm CLI runs produced different embedded analysis.")
}
if (firstBrowser.presentationSha256 !== repeatedBrowser.presentationSha256) {
  throw new Error("Repeated browser runs produced different presentation facts.")
}
assertAtMost("cold CLI duration", coldCli.durationMilliseconds, budgets.cliMilliseconds)
assertAtMost("warm CLI duration", warmCli.durationMilliseconds, budgets.cliMilliseconds)
assertAtMost("cold CLI peak RSS", coldCli.peakRssMiB, budgets.peakRssMiB)
assertAtMost("warm CLI peak RSS", warmCli.peakRssMiB, budgets.peakRssMiB)
assertAtMost("report size", warmCli.reportSizeMiB, budgets.reportSizeMiB)
for (const browser of [firstBrowser, repeatedBrowser]) {
  assertAtMost(`${browser.kind} ready duration`, browser.readyMilliseconds, budgets.browserReadyMilliseconds)
  const findings = browser.phases.find(({ phase }) => phase === "browser-findings")
  if (findings === undefined) {
    throw new Error(`${browser.kind} did not record browser findings duration.`)
  }
  assertAtMost(`${browser.kind} findings duration`, findings.durationMilliseconds, budgets.browserFindingsMilliseconds)
  const layout = browser.phases.find(({ phase }) => phase === "browser-layout")
  if (layout === undefined) {
    throw new Error(`${browser.kind} did not record browser layout duration.`)
  }
  assertAtMost(`${browser.kind} layout duration`, layout.durationMilliseconds, budgets.browserLayoutMilliseconds)
  for (const [interaction, durationMilliseconds] of Object.entries(browser.interactions)) {
    assertAtMost(`${browser.kind} ${interaction}`, durationMilliseconds, budgets.interactionMilliseconds)
  }
}

process.stdout.write(`Performance benchmark passed. Evidence: ${summaryPath}\n`)

async function runScenario(script: string, arguments_: readonly string[]): Promise<void> {
  await new Promise<void>((_resolve, reject) => {
    const child = spawn(process.execPath, [script, ...arguments_], {
      cwd: process.cwd(),
      stdio: "inherit",
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        _resolve()
      } else {
        reject(new Error(`${script} exited with code ${code ?? "unknown"}.`))
      }
    })
  })
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"))
}

function parseCliBenchmarkResult(value: unknown): CliBenchmarkResult {
  if (!TypeGuard.isRecord(value)) {
    throw new Error("CLI benchmark result was not an object.")
  }
  return {
    ...value,
    durationMilliseconds: parseNumberField(value, "durationMilliseconds"),
    peakRssMiB: parseNumberField(value, "peakRssMiB"),
    reportSizeMiB: parseNumberField(value, "reportSizeMiB"),
    analysisSha256: parseStringField(value, "analysisSha256"),
  }
}

function parseBrowserBenchmarkResult(value: unknown): BrowserBenchmarkResult {
  if (!TypeGuard.isRecord(value)) {
    throw new Error("Browser benchmark result was not an object.")
  }
  return {
    ...value,
    kind: parseStringField(value, "kind"),
    readyMilliseconds: parseNumberField(value, "readyMilliseconds"),
    presentationSha256: parseStringField(value, "presentationSha256"),
    phases: parsePhaseMeasurements(value.phases),
    interactions: parseInteractions(value.interactions),
  }
}

function parsePhaseMeasurements(value: unknown): readonly PhaseMeasurement[] {
  if (!TypeGuard.isArray(value)) {
    throw new Error("Browser benchmark phases were not an array.")
  }
  return value.map((measurement) => {
    if (!TypeGuard.isRecord(measurement)) {
      throw new Error("Browser benchmark phase was not an object.")
    }
    return {
      phase: parseStringField(measurement, "phase"),
      durationMilliseconds: parseNumberField(measurement, "durationMilliseconds"),
    }
  })
}

function parseInteractions(value: unknown): Readonly<Record<string, number>> {
  if (!TypeGuard.isRecord(value)) {
    throw new Error("Browser benchmark interactions were not an object.")
  }
  return Object.fromEntries(Object.entries(value).map(([name, duration]) => [name, parseNumericValue(duration, name)]))
}

function parseStringField(record: Readonly<Record<string, unknown>>, field: string): string {
  const value = record[field]
  if (!TypeGuard.isString(value)) {
    throw new Error(`Benchmark result ${field} was not a string.`)
  }
  return value
}

function parseNumberField(record: Readonly<Record<string, unknown>>, field: string): number {
  return parseNumericValue(record[field], field)
}

function parseNumericValue(value: unknown, field: string): number {
  if (!TypeGuard.isNumber(value) || !Number.isFinite(value)) {
    throw new Error(`Benchmark result ${field} was not finite.`)
  }
  return value
}

function assertAtMost(label: string, actual: number, budget: number): void {
  if (actual > budget) {
    throw new Error(`${label} exceeded its budget: ${actual.toFixed(1)} > ${budget.toFixed(1)}.`)
  }
}
