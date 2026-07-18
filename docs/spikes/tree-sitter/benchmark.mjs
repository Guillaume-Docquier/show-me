import { spawn } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import { availableParallelism, version as operatingSystemVersion } from "node:os"
import { extname, join, relative, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import process from "node:process"
import { fileURLToPath } from "node:url"

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)))
const SUPPORTED_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"])
const SKIPPED_DIRECTORIES = new Set([".git", "coverage", "dist", "node_modules"])
const SYNTHETIC_FILE_COUNT = Number.parseInt(process.env.SPIKE_FILE_COUNT ?? "1000", 10)
const SYNTHETIC_LINES_PER_FILE = Number.parseInt(process.env.SPIKE_LINES_PER_FILE ?? "200", 10)
const MEASURED_ITERATIONS = Number.parseInt(process.env.SPIKE_ITERATIONS ?? "5", 10)
const WARMUP_ITERATIONS = Number.parseInt(process.env.SPIKE_WARMUPS ?? "2", 10)

if (process.argv[2] === "--worker") {
  const engine = requiredArgument(3)
  const mode = requiredArgument(4)
  const corpusName = requiredArgument(5)
  await runWorker(engine, mode, corpusName)
} else {
  await runController()
}

async function runController() {
  const matrix = []
  for (const corpus of ["repository", "synthetic"]) {
    for (const mode of ["parse", "show-me"]) {
      for (const engine of ["oxc", "tree-sitter-wasm"]) {
        matrix.push(await runChild(engine, mode, corpus))
      }
    }
  }

  const correctness = {
    staticEsmFixture: await compareFixtureRequests(),
    unicodeOffsets: await inspectUnicodeOffsets(),
  }
  const output = {
    environment: environmentDescription(),
    workload: {
      repository: "tracked-style JS/TS files beneath src, tests, and fixtures",
      synthetic: {
        files: SYNTHETIC_FILE_COUNT,
        linesPerFile: SYNTHETIC_LINES_PER_FILE,
      },
      measuredIterations: MEASURED_ITERATIONS,
      warmupIterations: WARMUP_ITERATIONS,
    },
    correctness,
    measurements: matrix,
  }

  console.log(JSON.stringify(output, undefined, 2))
}

async function runWorker(engineName, mode, corpusName) {
  const corpus = corpusName === "repository" ? await readRepositoryCorpus() : generateSyntheticCorpus()
  const initializationStart = performance.now()
  const engine =
    engineName === "oxc"
      ? await createOxcEngine()
      : engineName === "tree-sitter-native"
        ? await createNativeTreeSitterEngine()
        : await createTreeSitterEngine()
  const initializationMs = performance.now() - initializationStart

  for (let iteration = 0; iteration < WARMUP_ITERATIONS; iteration += 1) {
    engine.run(corpus, mode)
  }
  globalThis.gc?.()

  const rssBeforeBytes = process.memoryUsage.rss()
  const durationsMs = []
  let checksum = 0
  for (let iteration = 0; iteration < MEASURED_ITERATIONS; iteration += 1) {
    const start = performance.now()
    checksum ^= engine.run(corpus, mode)
    durationsMs.push(performance.now() - start)
  }
  globalThis.gc?.()

  const sourceBytes = corpus.reduce((sum, file) => sum + Buffer.byteLength(file.sourceText), 0)
  const sourceLines = corpus.reduce((sum, file) => sum + physicalLineCount(file.sourceText), 0)
  const medianMs = percentile(durationsMs, 0.5)
  const result = {
    engine: engineName,
    mode,
    corpus: corpusName,
    files: corpus.length,
    sourceLines,
    sourceBytes,
    initializationMs: round(initializationMs),
    durationsMs: durationsMs.map(round),
    medianMs: round(medianMs),
    p95Ms: round(percentile(durationsMs, 0.95)),
    throughputMiBPerSecond: round(sourceBytes / 1024 / 1024 / (medianMs / 1000)),
    rssBeforeMiB: round(rssBeforeBytes / 1024 / 1024),
    rssAfterMiB: round(process.memoryUsage.rss() / 1024 / 1024),
    checksum,
  }
  engine.dispose()
  console.log(JSON.stringify(result))
}

async function createOxcEngine() {
  const { parseSync, Visitor } = await import("oxc-parser")

  return {
    run(corpus, mode) {
      let checksum = 0
      for (const file of corpus) {
        const parsed = parseSync(file.path, file.sourceText, { sourceType: "unambiguous" })
        checksum += parsed.program.end + parsed.errors.length
        if (mode === "show-me") {
          checksum += extractOxcShowMeFacts(parsed, Visitor)
        }
      }
      return checksum
    },
    dispose() {},
  }
}

async function createTreeSitterEngine() {
  const { Language, Parser } = await import("web-tree-sitter")
  await Parser.init()
  const grammarDirectoryByKind = {
    javascript: "node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm",
    typescript: "node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm",
    tsx: "node_modules/tree-sitter-typescript/tree-sitter-tsx.wasm",
  }
  const parsers = new Map()
  for (const [kind, grammarPath] of Object.entries(grammarDirectoryByKind)) {
    const parser = new Parser()
    parser.setLanguage(await Language.load(resolve(REPOSITORY_ROOT, grammarPath)))
    parsers.set(kind, parser)
  }

  return {
    run(corpus, mode) {
      let checksum = 0
      for (const file of corpus) {
        const parser = parsers.get(treeSitterGrammarKind(file.path))
        if (parser === undefined) {
          throw new Error(`No tree-sitter parser for ${file.path}`)
        }
        const tree = parser.parse(file.sourceText)
        if (tree === null) {
          throw new Error(`Tree-sitter returned no tree for ${file.path}`)
        }
        checksum += tree.rootNode.endIndex + Number(tree.rootNode.hasError)
        if (mode === "show-me") {
          checksum += extractTreeSitterShowMeFacts(tree.rootNode, file.sourceText)
        }
        tree.delete()
      }
      return checksum
    },
    dispose() {
      for (const parser of parsers.values()) {
        parser.delete()
      }
    },
  }
}

async function createNativeTreeSitterEngine() {
  const [{ default: Parser }, { default: JavaScript }, { default: TypeScript }] = await Promise.all([
    import("tree-sitter"),
    import("tree-sitter-javascript"),
    import("tree-sitter-typescript"),
  ])
  const parsers = new Map()
  for (const [kind, language] of Object.entries({
    javascript: JavaScript,
    typescript: TypeScript.typescript,
    tsx: TypeScript.tsx,
  })) {
    const parser = new Parser()
    parser.setLanguage(language)
    parsers.set(kind, parser)
  }

  return {
    run(corpus, mode) {
      let checksum = 0
      for (const file of corpus) {
        const parser = parsers.get(treeSitterGrammarKind(file.path))
        if (parser === undefined) {
          throw new Error(`No tree-sitter parser for ${file.path}`)
        }
        const tree = parser.parse(file.sourceText)
        checksum += tree.rootNode.endIndex + Number(tree.rootNode.hasError)
        if (mode === "show-me") {
          checksum += extractTreeSitterShowMeFacts(tree.rootNode, file.sourceText)
        }
      }
      return checksum
    },
    dispose() {},
  }
}

function extractOxcShowMeFacts(parsed, Visitor) {
  let checksum = parsed.comments.length + parsed.errors.length
  for (const declaration of parsed.module.staticImports) {
    if (declaration.entries.length === 0 || declaration.entries.some((entry) => !entry.isType)) {
      checksum += declaration.moduleRequest.value.length
    }
  }
  for (const declaration of parsed.module.staticExports) {
    for (const entry of declaration.entries) {
      if (!entry.isType && entry.moduleRequest !== null) {
        checksum += entry.moduleRequest.value.length
      }
    }
  }

  new Visitor({
    JSXExpressionContainer(container) {
      if (container.expression.type === "JSXEmptyExpression") {
        checksum += 1
      }
    },
  }).visit(parsed.program)
  return checksum
}

function extractTreeSitterShowMeFacts(rootNode, sourceText) {
  const comments = rootNode.descendantsOfType(["comment", "hash_bang_line"])
  const statements = rootNode.descendantsOfType(["import_statement", "export_statement"])
  const jsxExpressions = rootNode.descendantsOfType("jsx_expression")
  let checksum = comments.length + Number(rootNode.hasError)

  for (const statement of statements) {
    if (!isTreeSitterRuntimeStatement(statement)) {
      continue
    }
    const request = statement.childForFieldName("source")
    if (request !== null) {
      checksum += unquoteRequest(request.text).length
    }
  }
  for (const expression of jsxExpressions) {
    const comment = expression.namedChildren[0]
    if (
      expression.namedChildCount === 1 &&
      comment?.type === "comment" &&
      sourceText.slice(expression.startIndex + 1, comment.startIndex).trim().length === 0 &&
      sourceText.slice(comment.endIndex, expression.endIndex - 1).trim().length === 0
    ) {
      checksum += 1
    }
  }
  return checksum
}

function isTreeSitterRuntimeStatement(statement) {
  if (statement.children.some((child) => child.type === "type")) {
    return false
  }
  const clause = statement.namedChildren.find((child) => child.type === "import_clause" || child.type === "export_clause")
  if (clause === undefined) {
    return true
  }

  const specifiers = clause.descendantsOfType(["import_specifier", "export_specifier"])
  if (specifiers.length === 0) {
    return clause.namedChildren.some((child) => child.type === "identifier" || child.type === "namespace_import")
  }
  const hasNonSpecifierRuntimeBinding = clause.namedChildren.some(
    (child) => child.type === "identifier" || child.type === "namespace_import",
  )
  return hasNonSpecifierRuntimeBinding || specifiers.some((specifier) => !specifier.children.some((child) => child.type === "type"))
}

async function compareFixtureRequests() {
  const fixtureRoot = resolve(REPOSITORY_ROOT, "fixtures/projects/static-esm")
  const corpus = await readCorpusRoots([fixtureRoot])
  const [{ parseSync }, treeSitter] = await Promise.all([import("oxc-parser"), createTreeSitterRequestCollector()])
  const mismatches = []
  const parseErrorFiles = []

  for (const file of corpus) {
    const oxcRequests = collectOxcRequests(parseSync(file.path, file.sourceText, { sourceType: "unambiguous" }))
    const treeSitterResult = treeSitter.collect(file)
    if (JSON.stringify(oxcRequests) !== JSON.stringify(treeSitterResult.requests)) {
      mismatches.push({ file: file.path, oxcRequests, treeSitterRequests: treeSitterResult.requests })
    }
    if (treeSitterResult.hasParseError) {
      parseErrorFiles.push(file.path)
    }
  }
  treeSitter.dispose()

  return {
    files: corpus.length,
    matchingFiles: corpus.length - mismatches.length,
    parseErrorFiles,
    mismatches,
  }
}

async function createTreeSitterRequestCollector() {
  const { Language, Parser } = await import("web-tree-sitter")
  await Parser.init()
  const parsers = new Map()
  for (const [kind, grammarPath] of Object.entries({
    javascript: "node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm",
    typescript: "node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm",
    tsx: "node_modules/tree-sitter-typescript/tree-sitter-tsx.wasm",
  })) {
    const parser = new Parser()
    parser.setLanguage(await Language.load(resolve(REPOSITORY_ROOT, grammarPath)))
    parsers.set(kind, parser)
  }

  return {
    collect(file) {
      const parser = parsers.get(treeSitterGrammarKind(file.path))
      const tree = parser.parse(file.sourceText)
      const requests = tree.rootNode
        .descendantsOfType(["import_statement", "export_statement"])
        .filter(isTreeSitterRuntimeStatement)
        .map((statement) => statement.childForFieldName("source"))
        .filter((request) => request !== null)
        .map((request) => unquoteRequest(request.text))
        .sort()
      const result = {
        requests: [...new Set(requests)],
        hasParseError: tree.rootNode.hasError,
      }
      tree.delete()
      return result
    },
    dispose() {
      for (const parser of parsers.values()) {
        parser.delete()
      }
    },
  }
}

function collectOxcRequests(parsed) {
  const requests = new Set()
  for (const declaration of parsed.module.staticImports) {
    if (declaration.entries.length === 0 || declaration.entries.some((entry) => !entry.isType)) {
      requests.add(declaration.moduleRequest.value)
    }
  }
  for (const declaration of parsed.module.staticExports) {
    for (const entry of declaration.entries) {
      if (!entry.isType && entry.moduleRequest !== null) {
        requests.add(entry.moduleRequest.value)
      }
    }
  }
  return [...requests].sort()
}

async function inspectUnicodeOffsets() {
  const { Language, Parser } = await import("web-tree-sitter")
  const sourceText = `const café = "😀"\n// comment\n`
  const parser = new Parser()
  parser.setLanguage(await Language.load(resolve(REPOSITORY_ROOT, "node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm")))
  const tree = parser.parse(sourceText)
  const comment = tree.rootNode.descendantsOfType("comment")[0]
  const result = {
    sourceUtf16Length: sourceText.length,
    sourceUtf8Bytes: Buffer.byteLength(sourceText),
    rootEndIndex: tree.rootNode.endIndex,
    commentStartIndex: comment?.startIndex,
    expectedUtf16CommentStart: sourceText.indexOf("//"),
    expectedUtf8CommentStart: Buffer.byteLength(sourceText.slice(0, sourceText.indexOf("//"))),
  }
  tree.delete()
  parser.delete()
  return result
}

async function readRepositoryCorpus() {
  return await readCorpusRoots([resolve(REPOSITORY_ROOT, "src"), resolve(REPOSITORY_ROOT, "tests"), resolve(REPOSITORY_ROOT, "fixtures")])
}

async function readCorpusRoots(roots) {
  const files = []
  for (const root of roots) {
    await visitDirectory(root, files)
  }
  return files.sort((left, right) => left.path.localeCompare(right.path, "en"))
}

async function visitDirectory(directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        await visitDirectory(join(directory, entry.name), files)
      }
      continue
    }
    const absolutePath = join(directory, entry.name)
    if (isSupportedSourceFile(absolutePath)) {
      files.push({
        path: relative(REPOSITORY_ROOT, absolutePath).replaceAll("\\", "/"),
        sourceText: await readFile(absolutePath, "utf8"),
      })
    }
  }
}

function generateSyntheticCorpus() {
  const extensions = [".js", ".jsx", ".ts", ".tsx", ".mts", ".cts"]
  return Array.from({ length: SYNTHETIC_FILE_COUNT }, (_, fileIndex) => {
    const extension = extensions[fileIndex % extensions.length]
    return {
      path: `synthetic/file-${fileIndex}${extension}`,
      sourceText: syntheticSource(fileIndex, extension),
    }
  })
}

function syntheticSource(fileIndex, extension) {
  const isTypeScript = [".cts", ".mts", ".ts", ".tsx"].includes(extension)
  const isJsx = [".jsx", ".tsx"].includes(extension)
  const lines = [
    `import { value as previous } from "./file-${Math.max(fileIndex - 1, 0)}.js"`,
    ...(isTypeScript ? [`import type { Shape } from "./shape.js"`] : []),
    `// file ${fileIndex}`,
  ]
  let declaration = 0
  while (lines.length < SYNTHETIC_LINES_PER_FILE - (isJsx ? 1 : 0)) {
    lines.push(
      isTypeScript
        ? `export const value${declaration}: number = previous + ${declaration}`
        : `export const value${declaration} = previous + ${declaration}`,
    )
    declaration += 1
  }
  if (isJsx) {
    lines.push(`export const View = () => <section>{/* label */}{value0}</section>`)
  }
  return lines.join("\n")
}

function isSupportedSourceFile(path) {
  const lowerPath = path.toLowerCase()
  if (lowerPath.endsWith(".d.ts") || lowerPath.endsWith(".d.mts") || lowerPath.endsWith(".d.cts")) {
    return false
  }
  return SUPPORTED_EXTENSIONS.has(extname(lowerPath))
}

function treeSitterGrammarKind(path) {
  const extension = extname(path).toLowerCase()
  if (extension === ".tsx") {
    return "tsx"
  }
  return [".cts", ".mts", ".ts"].includes(extension) ? "typescript" : "javascript"
}

function unquoteRequest(text) {
  return text.length >= 2 ? text.slice(1, -1) : text
}

function physicalLineCount(sourceText) {
  if (sourceText.length === 0) {
    return 0
  }
  return sourceText.split(/\r\n|\n|\r/gu).length
}

function percentile(values, quantile) {
  const sorted = values.toSorted((left, right) => left - right)
  const index = Math.min(Math.ceil(quantile * sorted.length) - 1, sorted.length - 1)
  return sorted[index]
}

function round(value) {
  return Math.round(value * 100) / 100
}

function requiredArgument(index) {
  const argument = process.argv[index]
  if (argument === undefined) {
    throw new Error(`Missing argument ${index}`)
  }
  return argument
}

function environmentDescription() {
  return {
    platform: `${process.platform} ${process.arch}`,
    operatingSystem: operatingSystemVersion(),
    cpu: process.env.PROCESSOR_IDENTIFIER ?? "unknown",
    logicalCpuCount: availableParallelism(),
    node: process.version,
    oxcParser: "0.140.0",
    treeSitterBinding: "web-tree-sitter 0.26.11",
    treeSitterJavaScriptGrammar: "0.25.0",
    treeSitterTypeScriptGrammar: "0.23.2",
  }
}

function runChild(engine, mode, corpus) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--expose-gc", SCRIPT_PATH, "--worker", engine, mode, corpus], {
      cwd: REPOSITORY_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", reject)
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(`${engine}/${mode}/${corpus} exited ${exitCode}: ${stderr}`))
        return
      }
      resolvePromise(JSON.parse(stdout))
    })
  })
}
