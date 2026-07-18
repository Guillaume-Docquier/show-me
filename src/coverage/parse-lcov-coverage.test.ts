import { Result } from "@guillaume-docquier/tools-ts"
import { describe, expect, it } from "vitest"
import { parseLcovCoverage } from "./parse-lcov-coverage.js"

describe("parseLcovCoverage", () => {
  it("parses multiple, repeated, empty, checksummed, function, and branch records", () => {
    // Arrange
    const contents = `TN:unit
SF:src/app.ts
FN:1,run
FNDA:2,run
FNF:1
FNH:1
BRDA:1,0,0,2
BRF:1
BRH:1
DA:1,0,checksum
DA:1,3
LF:1
LH:1
end_of_record
SF:src/app.ts
DA:2,0
end_of_record
SF:src/empty.ts
end_of_record
`

    // Act
    const result = parseLcovCoverage(contents)

    // Assert
    expect(result).toEqual(
      Result.Success([
        { path: "src/app.ts", lineHits: new Map([[1, 3]]) },
        { path: "src/app.ts", lineHits: new Map([[2, 0]]) },
        { path: "src/empty.ts", lineHits: new Map() },
      ]),
    )
  })

  it("accepts LF, CRLF, and lone CR line separators", () => {
    // Arrange
    const contents = "SF:src/lf.ts\nDA:1,1\nend_of_record\r\nSF:src/crlf.ts\r\nDA:1,1\r\nend_of_record\rSF:src/cr.ts\rDA:1,1\rend_of_record"

    // Act
    const result = parseLcovCoverage(contents)

    // Assert
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.value.map((record) => record.path)).toEqual(["src/lf.ts", "src/crlf.ts", "src/cr.ts"])
    }
  })

  it.each([
    ["an empty source path", "SF:\nend_of_record"],
    ["a line record outside a source", "DA:1,1"],
    ["a zero line number", "SF:src/app.ts\nDA:0,1\nend_of_record"],
    ["a negative hit count", "SF:src/app.ts\nDA:1,-1\nend_of_record"],
    ["a fractional hit count", "SF:src/app.ts\nDA:1,1.5\nend_of_record"],
    ["an empty checksum", "SF:src/app.ts\nDA:1,1,\nend_of_record"],
    ["too many DA fields", "SF:src/app.ts\nDA:1,1,checksum,extra\nend_of_record"],
    ["a nested source record", "SF:src/app.ts\nSF:src/other.ts\nend_of_record"],
    ["an orphan record boundary", "end_of_record"],
    ["a missing record boundary", "SF:src/app.ts\nDA:1,1"],
    ["function data outside a source", "FN:1,run"],
    ["an unknown record", "SF:src/app.ts\nXX:value\nend_of_record"],
  ])("returns an invalid LCOV failure for %s", (_name, contents) => {
    // Act
    const result = parseLcovCoverage(contents)

    // Assert
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.error._tag).toBe("InvalidLcovCoverage")
      expect(result.error.cause.message).toContain("LCOV")
    }
  })
})
