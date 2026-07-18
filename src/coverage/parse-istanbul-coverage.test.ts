import { Result } from "@guillaume-docquier/tools-ts"
import { expect, it } from "vitest"
import { parseIstanbulCoverage } from "./parse-istanbul-coverage.js"

it("rejects a non-object Istanbul root after its parser is selected", () => {
  // Act
  const result = parseIstanbulCoverage("[]")

  // Assert
  expect(Result.isFailure(result)).toBe(true)
  if (Result.isFailure(result)) {
    expect(result.error._tag).toBe("InvalidIstanbulCoverage")
    expect(result.error.cause.message).toContain("object keyed by covered file paths")
  }
})
