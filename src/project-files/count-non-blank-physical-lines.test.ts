import { describe, expect, it } from "vitest"
import { countNonBlankPhysicalLines } from "./count-non-blank-physical-lines.js"

describe("countNonBlankPhysicalLines", () => {
  it("counts empty and whitespace-only files as zero", () => {
    // Arrange
    const emptySource = ""
    const blankSource = " \t\r\n\r\n\t"

    // Act
    const emptyCount = countNonBlankPhysicalLines(emptySource)
    const blankCount = countNonBlankPhysicalLines(blankSource)

    // Assert
    expect(emptyCount).toBe(0)
    expect(blankCount).toBe(0)
  })

  it("includes comments and ignores a final newline", () => {
    // Arrange
    const source = "// comment\n\nexport const value = 1\n"

    // Act
    const count = countNonBlankPhysicalLines(source)

    // Assert
    expect(count).toBe(2)
  })

  it("handles CRLF and standalone CR line endings", () => {
    // Arrange
    const source = "first\r\n\r\nsecond\rthird\r"

    // Act
    const count = countNonBlankPhysicalLines(source)

    // Assert
    expect(count).toBe(3)
  })
})
