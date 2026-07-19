import { Result } from "@guillaume-docquier/tools-ts"
import { describe, expect, it } from "vitest"
import { ExternalPackageName } from "./external-package-name.js"

describe("ExternalPackageName", () => {
  it.each(["react", "package.with-punctuation_~", "@scope/package"])("parses canonical package root %s", (input) => {
    expect(ExternalPackageName.parse(input)).toEqual(Result.Success(input))
  })

  it.each(["", "react/subpath", "@scope", "@scope/package/subpath", "@/package", "@scope/", "package name"])(
    "rejects non-canonical package name %j",
    (input) => {
      expect(Result.isFailure(ExternalPackageName.parse(input))).toBe(true)
    },
  )

  it("orders canonical names by locale-independent text order", () => {
    const names = ["z-package", "a-package", "B-package"].map((name) => {
      const parsed = ExternalPackageName.parse(name)
      if (Result.isFailure(parsed)) {
        throw new Error("Invalid test package name: " + name)
      }
      return parsed.value
    })

    // oxlint-disable-next-line unicorn/no-array-sort -- We're working on a controlled copy, we don't need another one
    expect(names.sort((left, right) => ExternalPackageName.compare(left, right))).toEqual(["B-package", "a-package", "z-package"])
  })
})
