import { createHash } from "node:crypto"
import { readFile, stat, writeFile } from "node:fs/promises"
import { cpus, freemem, platform, release, totalmem } from "node:os"
import { resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { TypeGuard } from "@guillaume-docquier/tools-ts"
import type { runCli as sourceRunCli } from "../src/cli/run-cli.ts"
import type { PerformanceProfiler as SourcePerformanceProfiler } from "../src/performance/performance-profiler.ts"

type RunCli = typeof sourceRunCli
type PerformanceProfilerConstructor = typeof SourcePerformanceProfiler

const cliModulePath = "../dist/cli/run-cli.js"
const performanceModulePath = "../dist/performance/performance-profiler.js"
const cliModule: unknown = await import(cliModulePath)
const performanceModule: unknown = await import(performanceModulePath)
if (!TypeGuard.isRecord(cliModule) || typeof cliModule.runCli !== "function") {
  throw new Error("The built CLI runtime does not export runCli.")
}
if (!TypeGuard.isRecord(performanceModule) || typeof performanceModule.PerformanceProfiler !== "function") {
  throw new Error("The built performance runtime does not export PerformanceProfiler.")
}
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: The runtime guard proves the built export is a function. Its detailed contract is checked against the source declaration without requiring dist during the root typecheck.
const runCli = cliModule.runCli as RunCli
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: The runtime guard proves the built export is a constructor function; the source declaration supplies its checked contract.
const PerformanceProfiler = performanceModule.PerformanceProfiler as PerformanceProfilerConstructor

const [projectDirectoryArgument, reportPathArgument, resultPathArgument, runKind = "measured"] = process.argv.slice(2)
if (projectDirectoryArgument === undefined || reportPathArgument === undefined || resultPathArgument === undefined) {
  throw new Error("Usage: node benchmarks/run-cli-scenario.ts <project-directory> <report-path> <result-path> [run-kind]")
}

const projectDirectory = resolve(projectDirectoryArgument)
const reportPath = resolve(reportPathArgument)
const resultPath = resolve(resultPathArgument)
const profiler = new PerformanceProfiler()
const standardOutput: string[] = []
const standardError: string[] = []
let peakRssBytes = process.memoryUsage.rss()
const memorySampler = setInterval(() => {
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss())
}, 5)
const startedAt = performance.now()
const exitCode = await runCli(
  [projectDirectory, "--output", reportPath],
  {
    writeStandardOutput(text) {
      standardOutput.push(text)
    },
    writeStandardError(text) {
      standardError.push(text)
    },
  },
  { performanceProfiler: profiler },
)
const durationMilliseconds = performance.now() - startedAt
clearInterval(memorySampler)
peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss(), process.resourceUsage().maxRSS * 1_024)

if (exitCode !== 0) {
  throw new Error(`CLI benchmark failed with exit code ${exitCode}: ${standardError.join("")}`)
}

const html = await readFile(reportPath, "utf8")
const serializedAnalysis = html.match(/<script>window\.showMeAnalysis=(.+);<\/script>/u)?.[1]
if (serializedAnalysis === undefined) {
  throw new Error("The benchmark report did not contain embedded analysis.")
}
const reportStats = await stat(reportPath)
const cpu = cpus()[0]
const result = {
  kind: runKind,
  environment: {
    platform: `${platform()} ${release()}`,
    cpu: cpu?.model ?? "unknown",
    logicalCpuCount: cpus().length,
    totalMemoryMiB: bytesToMiB(totalmem()),
    freeMemoryMiBAtCompletion: bytesToMiB(freemem()),
    nodeVersion: process.version,
  },
  durationMilliseconds,
  peakRssMiB: bytesToMiB(peakRssBytes),
  reportSizeMiB: bytesToMiB(reportStats.size),
  analysisSha256: createHash("sha256").update(serializedAnalysis).digest("hex"),
  phases: profiler.measurements(),
  standardOutput,
}
await writeFile(resultPath, `${JSON.stringify(result, undefined, 2)}\n`, "utf8")
process.stdout.write(`${JSON.stringify(result)}\n`)

function bytesToMiB(bytes: number): number {
  return bytes / (1024 * 1024)
}
