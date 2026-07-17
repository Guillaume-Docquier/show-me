import { isBuiltin } from "node:module"
import { Result } from "@guillaume-docquier/tools-ts"
import { ExternalPackageName } from "../../analysis/external-package-name.js"

/**
 * Collapse a static runtime request to its canonical npm package root.
 *
 * Relative, absolute, package-import, protocol, malformed, and Node built-in
 * requests are not external npm packages.
 *
 * @param request - Static runtime module request from JavaScript or TypeScript.
 * @returns The unscoped first segment or scoped first two segments.
 */
export function externalPackageNameFromRequest(request: string): ExternalPackageName | undefined {
  if (isBuiltin(request) || request.length === 0 || request.includes("\\")) {
    return undefined
  }
  if (request.startsWith(".") || request.startsWith("/") || request.startsWith("#")) {
    return undefined
  }

  const segments = request.split("/")
  const firstSegment = segments[0]
  if (firstSegment === undefined || firstSegment.includes(":")) {
    return undefined
  }

  const candidate = firstSegment.startsWith("@") ? `${firstSegment}/${segments[1] ?? ""}` : firstSegment
  const parsed = ExternalPackageName.parse(candidate)
  return Result.isSuccess(parsed) ? parsed.value : undefined
}
