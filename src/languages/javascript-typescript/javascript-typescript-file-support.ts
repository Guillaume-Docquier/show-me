import { extname } from "node:path"

/**
 * JavaScript and TypeScript language identifiers emitted by the initial language module.
 */
export type JavaScriptTypeScriptLanguageId = "javascript" | "typescript"

/**
 * Supported executable extensions in dependency-resolution priority order.
 */
export const JAVASCRIPT_TYPESCRIPT_EXECUTABLE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"] as const

const EXECUTABLE_EXTENSION_SET = new Set<string>(JAVASCRIPT_TYPESCRIPT_EXECUTABLE_EXTENSIONS)
const JAVASCRIPT_EXTENSION_SET = new Set([".cjs", ".js", ".jsx", ".mjs"])
const TYPESCRIPT_DECLARATION_SUFFIXES = [".d.cts", ".d.mts", ".d.ts"]

/**
 * Classify a project path supported by the JavaScript and TypeScript language module.
 *
 * @param projectPath - Project-relative candidate path.
 * @returns Its language identifier, or `undefined` when unsupported or declarative.
 */
export function javaScriptTypeScriptLanguageForProjectPath(projectPath: string): JavaScriptTypeScriptLanguageId | undefined {
  const lowerPath = projectPath.toLowerCase()
  if (TYPESCRIPT_DECLARATION_SUFFIXES.some((suffix) => lowerPath.endsWith(suffix))) {
    return undefined
  }

  const extension = extname(lowerPath)
  if (!EXECUTABLE_EXTENSION_SET.has(extension)) {
    return undefined
  }
  return JAVASCRIPT_EXTENSION_SET.has(extension) ? "javascript" : "typescript"
}

/**
 * Test whether a path or request ends with a supported executable extension.
 *
 * @param path - Project path or dependency request to inspect.
 * @returns Whether its final extension is executable JavaScript or TypeScript.
 */
export function hasJavaScriptTypeScriptExecutableExtension(path: string): boolean {
  return EXECUTABLE_EXTENSION_SET.has(extname(path).toLowerCase())
}
