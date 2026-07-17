import { describe, expect, it } from "vitest"
import { externalPackageNameFromRequest } from "./external-package-name.js"

describe("externalPackageNameFromRequest", () => {
  it.each([
    ["react", "react"],
    ["react/jsx-runtime", "react"],
    ["package.with-punctuation_~", "package.with-punctuation_~"],
    ["@scope/package", "@scope/package"],
    ["@scope/package/subpath", "@scope/package"],
  ] as const)("normalizes %s to %s", (request, expected) => {
    expect(externalPackageNameFromRequest(request)).toBe(expected)
  })

  it.each([
    "",
    ".",
    "..",
    "./local.js",
    "../local.js",
    "/absolute.js",
    "#internal",
    "node:fs",
    "fs",
    "fs/promises",
    "data:text/javascript,export default true",
    "https://example.com/module.js",
    "@scope",
    "@/package",
    "@scope/",
    "@scope//subpath",
    "package\\subpath",
    "package name",
  ])("rejects non-package request %j", (request) => {
    expect(externalPackageNameFromRequest(request)).toBeUndefined()
  })
})
