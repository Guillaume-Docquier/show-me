import { appendFile, readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { TypeGuard } from "@guillaume-docquier/tools-ts"

type BenchmarkOutcome = "success" | "failure" | "cancelled" | "skipped" | "unknown"

/**
 * Render structured benchmark evidence as a GitHub-flavored Markdown report.
 *
 * @param value - Parsed benchmark summary JSON.
 * @param outcome - GitHub's outcome for the benchmark step.
 * @returns A Markdown benchmark report suitable for `GITHUB_STEP_SUMMARY`.
 */
export function renderBenchmarkSummary(value: unknown, outcome: BenchmarkOutcome): string {
  const summary = parseRecord(value, "benchmark summary")
  const workload = parseRecord(summary.workload, "workload")
  const budgets = parseRecord(summary.budgets, "budgets")
  const coldCli = parseRecord(summary.coldCli, "cold CLI result")
  const warmCli = parseRecord(summary.warmCli, "warm CLI result")
  const firstBrowser = parseRecord(summary.firstBrowser, "first browser result")
  const repeatedBrowser = parseRecord(summary.repeatedBrowser, "repeated browser result")
  const environment = parseRecord(coldCli.environment, "benchmark environment")
  const cliMilliseconds = parseNumberField(budgets, "cliMilliseconds")
  const peakRssMiB = parseNumberField(budgets, "peakRssMiB")
  const reportSizeMiB = parseNumberField(budgets, "reportSizeMiB")
  const browserReadyMilliseconds = parseNumberField(budgets, "browserReadyMilliseconds")
  const browserLayoutMilliseconds = parseNumberField(budgets, "browserLayoutMilliseconds")
  const interactionMilliseconds = parseNumberField(budgets, "interactionMilliseconds")

  return [
    "## Full performance benchmark",
    "",
    benchmarkStatus(outcome),
    "",
    "This benchmark is informational. Budget overruns remain visible but do not block CI or GitHub Pages deployment.",
    "",
    `Workload: **${formatInteger(parseNumberField(workload, "fileCount"))} files**, **${formatInteger(parseNumberField(workload, "totalLineCount"))} lines**, generator version ${formatInteger(parseNumberField(workload, "generatorVersion"))}.`,
    "",
    `Runner: ${escapeTableCell(parseStringField(environment, "platform"))}, ${escapeTableCell(parseStringField(environment, "cpu"))}, ${formatInteger(parseNumberField(environment, "logicalCpuCount"))} logical CPUs, ${formatNumber(parseNumberField(environment, "totalMemoryMiB"))} MiB RAM, Node ${escapeTableCell(parseStringField(environment, "nodeVersion"))}.`,
    "",
    "### Budgeted measurements",
    "",
    "| Scenario | Duration | Peak RSS | Report size |",
    "| --- | ---: | ---: | ---: |",
    cliBudgetRow("Cold process", coldCli, cliMilliseconds, peakRssMiB, reportSizeMiB),
    cliBudgetRow("Warm filesystem cache", warmCli, cliMilliseconds, peakRssMiB, reportSizeMiB),
    "",
    "| Browser scenario | Ready | Layout | Zoom | Pan | Hover | Selection |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    browserBudgetRow("First browser", firstBrowser, browserReadyMilliseconds, browserLayoutMilliseconds, interactionMilliseconds),
    browserBudgetRow("Repeated browser", repeatedBrowser, browserReadyMilliseconds, browserLayoutMilliseconds, interactionMilliseconds),
    "",
    "### CLI phases",
    "",
    "| Phase | Cold process | Warm filesystem cache |",
    "| --- | ---: | ---: |",
    ...phaseRows(coldCli, warmCli),
    "",
    "### Correctness signals",
    "",
    `- Analysis deterministic: ${statusMark(parseStringField(coldCli, "analysisSha256") === parseStringField(warmCli, "analysisSha256"))}`,
    `- Browser presentation deterministic: ${statusMark(parseStringField(firstBrowser, "presentationSha256") === parseStringField(repeatedBrowser, "presentationSha256"))}`,
    `- First browser graph clearance: ${formatNumber(parseLayoutNumber(firstBrowser, "minimumGraphClearance"))}`,
    `- Repeated browser graph clearance: ${formatNumber(parseLayoutNumber(repeatedBrowser, "minimumGraphClearance"))}`,
    "",
  ].join("\n")
}

/**
 * Render a fallback report when the benchmark stopped before producing
 * structured evidence.
 *
 * @param outcome - GitHub's outcome for the benchmark step.
 * @param error - The summary loading or parsing failure.
 * @returns A Markdown report explaining that measurements are unavailable.
 */
export function renderUnavailableBenchmarkSummary(outcome: BenchmarkOutcome, error: unknown): string {
  return [
    "## Full performance benchmark",
    "",
    benchmarkStatus(outcome),
    "",
    "This benchmark is informational and does not block CI or GitHub Pages deployment.",
    "",
    `Structured benchmark evidence was unavailable: ${errorMessage(error)}`,
    "",
  ].join("\n")
}

function cliBudgetRow(
  label: string,
  result: Readonly<Record<string, unknown>>,
  durationBudget: number,
  rssBudget: number,
  sizeBudget: number,
): string {
  return `| ${label} | ${measurement(parseNumberField(result, "durationMilliseconds"), durationBudget, "ms")} | ${measurement(parseNumberField(result, "peakRssMiB"), rssBudget, "MiB")} | ${measurement(parseNumberField(result, "reportSizeMiB"), sizeBudget, "MiB", 3)} |`
}

function browserBudgetRow(
  label: string,
  result: Readonly<Record<string, unknown>>,
  readyBudget: number,
  layoutBudget: number,
  interactionBudget: number,
): string {
  const interactions = parseRecord(result.interactions, `${label} interactions`)
  return `| ${label} | ${measurement(parseNumberField(result, "readyMilliseconds"), readyBudget, "ms")} | ${measurement(parsePhaseDuration(result, "browser-layout"), layoutBudget, "ms")} | ${measurement(parseNumberField(interactions, "zoomMilliseconds"), interactionBudget, "ms")} | ${measurement(parseNumberField(interactions, "panMilliseconds"), interactionBudget, "ms")} | ${measurement(parseNumberField(interactions, "hoverMilliseconds"), interactionBudget, "ms")} | ${measurement(parseNumberField(interactions, "selectionMilliseconds"), interactionBudget, "ms")} |`
}

function phaseRows(coldCli: Readonly<Record<string, unknown>>, warmCli: Readonly<Record<string, unknown>>): readonly string[] {
  const coldPhases = parsePhases(coldCli)
  const warmPhases = parsePhases(warmCli)
  return [...coldPhases.entries()].map(([phase, duration]) => {
    const warmDuration = warmPhases.get(phase)
    if (warmDuration === undefined) {
      throw new Error(`Warm CLI result did not contain the ${phase} phase.`)
    }
    return `| ${escapeTableCell(phase)} | ${formatNumber(duration)} ms | ${formatNumber(warmDuration)} ms |`
  })
}

function parsePhases(result: Readonly<Record<string, unknown>>): ReadonlyMap<string, number> {
  if (!TypeGuard.isArray(result.phases)) {
    throw new Error("Benchmark phases were not an array.")
  }
  return new Map(
    result.phases.map((value) => {
      const phase = parseRecord(value, "benchmark phase")
      return [parseStringField(phase, "phase"), parseNumberField(phase, "durationMilliseconds")]
    }),
  )
}

function parsePhaseDuration(result: Readonly<Record<string, unknown>>, phaseName: string): number {
  const duration = parsePhases(result).get(phaseName)
  if (duration === undefined) {
    throw new Error(`Benchmark result did not contain the ${phaseName} phase.`)
  }
  return duration
}

function parseLayoutNumber(result: Readonly<Record<string, unknown>>, field: string): number {
  return parseNumberField(parseRecord(result.layout, "browser layout"), field)
}

function parseRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!TypeGuard.isRecord(value)) {
    throw new Error(`${label} was not an object.`)
  }
  return value
}

function parseStringField(record: Readonly<Record<string, unknown>>, field: string): string {
  const value = record[field]
  if (!TypeGuard.isString(value)) {
    throw new Error(`Benchmark result ${field} was not a string.`)
  }
  return value
}

function parseNumberField(record: Readonly<Record<string, unknown>>, field: string): number {
  const value = record[field]
  if (!TypeGuard.isNumber(value) || !Number.isFinite(value)) {
    throw new Error(`Benchmark result ${field} was not finite.`)
  }
  return value
}

function measurement(actual: number, budget: number, unit: string, fractionDigits = 1): string {
  const mark = actual <= budget ? "✅" : "⚠️"
  return `${mark} ${formatNumber(actual, fractionDigits)} / ${formatNumber(budget, fractionDigits)} ${unit}`
}

function benchmarkStatus(outcome: BenchmarkOutcome): string {
  if (outcome === "success") {
    return "> ✅ All benchmark budgets passed."
  }
  if (outcome === "failure") {
    return "> ⚠️ At least one benchmark budget or scenario failed."
  }
  return `> ⚠️ Benchmark step outcome: ${outcome}.`
}

function statusMark(success: boolean): string {
  return success ? "✅ matched" : "⚠️ differed"
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)
}

function formatNumber(value: number, fractionDigits = 1): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ")
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseOutcome(value: string | undefined): BenchmarkOutcome {
  return value === "success" || value === "failure" || value === "cancelled" || value === "skipped" ? value : "unknown"
}

async function writeGithubSummary(): Promise<void> {
  const summaryPath = process.argv[2] ?? ".benchmark/full/summary.json"
  const githubSummaryPath = process.env.GITHUB_STEP_SUMMARY
  if (githubSummaryPath === undefined) {
    throw new Error("GITHUB_STEP_SUMMARY is required.")
  }

  const outcome = parseOutcome(process.env.BENCHMARK_OUTCOME)
  let markdown: string
  try {
    const value: unknown = JSON.parse(await readFile(summaryPath, "utf8"))
    markdown = renderBenchmarkSummary(value, outcome)
  } catch (error) {
    markdown = renderUnavailableBenchmarkSummary(outcome, error)
  }
  await appendFile(githubSummaryPath, markdown, "utf8")
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await writeGithubSummary()
}
