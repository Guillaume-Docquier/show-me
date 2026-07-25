import { readFile, mkdir, rm, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join, parse, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { isNodeJSError, TypeGuard } from "@guillaume-docquier/tools-ts"

const GENERATOR_VERSION = 1
const DEFAULT_FILE_COUNT = 1_000
const DEFAULT_LINE_COUNT = 5_000

/** Dimensions and destination for one generated benchmark corpus. */
export type GenerateCorpusInput = {
  readonly outputDirectory: string
  readonly fileCount?: number
  readonly minimumLineCount?: number
}

/** Stable description of a generated benchmark workload. */
export type GeneratedCorpus = {
  readonly generatorVersion: number
  readonly outputDirectory: string
  readonly fileCount: number
  readonly minimumLineCount: number
  readonly totalLineCount: number
}

type FileLocation = {
  readonly region: number
  readonly path: string
}

/**
 * Generate a deterministic TypeScript performance corpus without retaining its
 * source files in repository history.
 *
 * @param input - Corpus location and dimensions.
 * @returns The generated workload description.
 */
export async function generateCorpus({
  outputDirectory,
  fileCount = DEFAULT_FILE_COUNT,
  minimumLineCount = DEFAULT_LINE_COUNT,
}: GenerateCorpusInput): Promise<GeneratedCorpus> {
  assertPositiveInteger(fileCount, "fileCount")
  assertPositiveInteger(minimumLineCount, "minimumLineCount")
  if (fileCount < 10) {
    throw new Error("The generated corpus needs at least 10 files to contain representative graph regions.")
  }
  if (minimumLineCount < 20) {
    throw new Error("The generated corpus needs at least 20 lines per file to contain representative line categories.")
  }

  const absoluteOutputDirectory = resolve(outputDirectory)
  await assertSafeOutputDirectory(absoluteOutputDirectory)
  await rm(absoluteOutputDirectory, { recursive: true, force: true })
  await mkdir(join(absoluteOutputDirectory, "src"), { recursive: true })
  await mkdir(join(absoluteOutputDirectory, "coverage"), { recursive: true })
  await writeFile(
    join(absoluteOutputDirectory, "benchmark-corpus.json"),
    `${JSON.stringify({ generatorVersion: GENERATOR_VERSION, generationComplete: false }, undefined, 2)}\n`,
    "utf8",
  )
  await writeFile(
    join(absoluteOutputDirectory, "package.json"),
    `${JSON.stringify({ name: "show-me-performance-corpus", private: true, type: "module" }, undefined, 2)}\n`,
    "utf8",
  )

  const regionCount = Math.min(10, Math.max(2, Math.floor(fileCount / 10)))
  const fileLocations = Array.from({ length: fileCount }, (_, index) => fileLocation(index, fileCount, regionCount))
  const coverageRecords: string[] = []
  let totalLineCount = 0

  for (let index = 0; index < fileCount; index += 1) {
    const location = fileLocations[index]
    if (location === undefined) {
      throw new Error(`Missing generated file location ${index}.`)
    }
    const lineCount = minimumLineCount + (index % 97)
    const source = sourceFile(index, lineCount, fileLocations, regionCount)
    const absoluteFile = join(absoluteOutputDirectory, ...location.path.split("/"))
    await mkdir(resolve(absoluteFile, ".."), { recursive: true })
    await writeFile(absoluteFile, source, "utf8")
    totalLineCount += lineCount

    if (index % 4 !== 3) {
      const hits = index % 4 === 0 ? 0 : index % 4 === 1 ? 1 : 2
      coverageRecords.push(`TN:\nSF:${location.path}\nDA:3,${hits === 0 ? 0 : 1}\nDA:${lineCount},${hits === 2 ? 1 : 0}\nend_of_record\n`)
    }
  }

  await writeFile(join(absoluteOutputDirectory, "coverage", "lcov.info"), coverageRecords.join(""), "utf8")
  const metadata = {
    generatorVersion: GENERATOR_VERSION,
    fileCount,
    minimumLineCount,
    totalLineCount,
    regionCount,
  }
  await writeFile(join(absoluteOutputDirectory, "benchmark-corpus.json"), `${JSON.stringify(metadata, undefined, 2)}\n`, "utf8")
  return {
    generatorVersion: GENERATOR_VERSION,
    outputDirectory: absoluteOutputDirectory,
    fileCount,
    minimumLineCount,
    totalLineCount,
  }
}

function sourceFile(index: number, lineCount: number, fileLocations: readonly FileLocation[], regionCount: number): string {
  const location = fileLocations[index]
  if (location === undefined) {
    throw new Error(`Missing generated file location ${index}.`)
  }
  const regionIndexes = fileLocations.flatMap((candidate, candidateIndex) => (candidate.region === location.region ? [candidateIndex] : []))
  const positionInRegion = regionIndexes.indexOf(index)
  const nextIndex = regionIndexes[(positionInRegion + 1) % regionIndexes.length]
  const previousIndex = regionIndexes[(positionInRegion - 1 + regionIndexes.length) % regionIndexes.length]
  if (nextIndex === undefined || previousIndex === undefined) {
    throw new Error(`Could not build region ${location.region} in a ${regionCount}-region corpus.`)
  }

  const lines = [
    `import { value as nextValue } from ${JSON.stringify(relativeModuleRequest(location.path, fileLocations[nextIndex]?.path))}`,
    `import type { GeneratedType as PreviousType } from ${JSON.stringify(relativeModuleRequest(location.path, fileLocations[previousIndex]?.path))}`,
    `export const value = ${index} + nextValue`,
    `export type GeneratedType = PreviousType | { readonly file: ${index} }`,
  ]
  while (lines.length < lineCount) {
    const lineNumber = lines.length + 1
    if (lineNumber % 20 === 0) {
      lines.push("")
    } else if (lineNumber % 5 === 0) {
      lines.push(`// deterministic comment ${index}:${lineNumber}`)
    } else {
      lines.push(`const local_${lineNumber} = ${index + lineNumber}`)
    }
  }
  return lines.join("\n")
}

function fileLocation(index: number, fileCount: number, regionCount: number): FileLocation {
  const region = Math.min(regionCount - 1, Math.floor((index * regionCount) / fileCount))
  const indexWithinRegion = index - Math.floor((region * fileCount) / regionCount)
  const unit = Math.floor(indexWithinRegion / 10)
  return {
    region,
    path: `src/region-${padded(region)}/unit-${padded(unit)}/file-${String(index).padStart(4, "0")}.ts`,
  }
}

function relativeModuleRequest(sourcePath: string, targetPath: string | undefined): string {
  if (targetPath === undefined) {
    throw new Error(`Missing target for ${sourcePath}.`)
  }
  const sourceParts = sourcePath.split("/")
  const targetParts = targetPath.split("/")
  sourceParts.pop()
  let sharedParts = 0
  while (sourceParts[sharedParts] === targetParts[sharedParts]) {
    sharedParts += 1
  }
  const upwards = Array.from({ length: sourceParts.length - sharedParts }, () => "..")
  const downwards = targetParts.slice(sharedParts)
  const request = [...upwards, ...downwards].join("/").replace(/\.ts$/u, ".js")
  return request.startsWith(".") ? request : `./${request}`
}

function padded(value: number): string {
  return String(value).padStart(3, "0")
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`)
  }
}

async function assertSafeOutputDirectory(outputDirectory: string): Promise<void> {
  if ([parse(outputDirectory).root, resolve("."), resolve(homedir())].includes(outputDirectory)) {
    throw new Error(`Refusing to replace unsafe benchmark output directory ${outputDirectory}.`)
  }

  let outputStats: Awaited<ReturnType<typeof stat>>
  try {
    outputStats = await stat(outputDirectory)
  } catch (error) {
    if (isNodeJSError(error) && error.code === "ENOENT") {
      return
    }
    throw error
  }
  if (!outputStats.isDirectory()) {
    throw new Error(`Benchmark output exists and is not a directory: ${outputDirectory}.`)
  }

  try {
    const metadata: unknown = JSON.parse(await readFile(join(outputDirectory, "benchmark-corpus.json"), "utf8"))
    if (!TypeGuard.isRecord(metadata) || metadata.generatorVersion !== GENERATOR_VERSION) {
      throw new Error("generator version does not match")
    }
  } catch (error) {
    throw new Error(`Refusing to replace unrecognized benchmark directory ${outputDirectory}.`, { cause: error })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const outputDirectory = process.argv[2] ?? ".benchmark/full-corpus"
  const fileCount = process.argv[3] === undefined ? DEFAULT_FILE_COUNT : Number(process.argv[3])
  const minimumLineCount = process.argv[4] === undefined ? DEFAULT_LINE_COUNT : Number(process.argv[4])
  const result = await generateCorpus({ outputDirectory, fileCount, minimumLineCount })
  process.stdout.write(`${JSON.stringify(result, undefined, 2)}\n`)
}
