import { Result, branded, type Branded } from "@guillaume-docquier/tools-ts"
import { compareText } from "../text/compare-text.js"

const PACKAGE_SEGMENT = /^[a-zA-Z0-9._~-]+$/u

/**
 * A canonical unscoped or scoped external package root.
 */
export type ExternalPackageName = Branded<string, "ExternalPackageName">

/**
 * The reason an external package name could not be constructed.
 */
export type InvalidExternalPackageName = {
  readonly _tag: "InvalidExternalPackageName"
  readonly input: string
  readonly reason: "empty" | "invalid"
}

/**
 * Operations for constructing and ordering canonical external package names.
 */
export const ExternalPackageName = {
  /**
   * Parse one canonical npm package root without accepting package subpaths.
   *
   * @param input - Candidate unscoped or scoped package root.
   * @returns A branded canonical name, or a classified validation failure.
   */
  parse(input: string): Result<ExternalPackageName, InvalidExternalPackageName> {
    if (input.length === 0) {
      return Result.Failure({ _tag: "InvalidExternalPackageName", input, reason: "empty" })
    }

    const segments = input.split("/")
    const valid = input.startsWith("@")
      ? segments.length === 2 && validSegment(segments[0]?.slice(1) ?? "") && validSegment(segments[1] ?? "")
      : segments.length === 1 && validSegment(segments[0] ?? "")
    return valid
      ? Result.Success(branded<ExternalPackageName>(input))
      : Result.Failure({ _tag: "InvalidExternalPackageName", input, reason: "invalid" })
  },

  /**
   * Compare canonical package names without consulting the host locale.
   *
   * @param left - Package name on the left side of the comparison.
   * @param right - Package name on the right side of the comparison.
   * @returns A negative number, zero, or a positive number for ascending order.
   */
  compare(left: ExternalPackageName, right: ExternalPackageName): number {
    return compareText(left, right)
  },
}

function validSegment(segment: string): boolean {
  return segment !== "." && segment !== ".." && PACKAGE_SEGMENT.test(segment)
}
