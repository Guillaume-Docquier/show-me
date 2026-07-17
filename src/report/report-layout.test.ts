import { expect, it } from "vitest"
import { layoutReportGraph } from "./report-layout.js"
import { activeLineCount, nodeSizeForLines, type ReportLineCategory } from "./report-presentation.js"

const CATEGORY_COMBINATIONS: ReadonlyArray<[readonly ReportLineCategory[]]> = [
  [["code"]],
  [["comment"]],
  [["blank"]],
  [["code", "comment"]],
  [["code", "blank"]],
  [["comment", "blank"]],
  [["code", "comment", "blank"]],
]

it.each(CATEGORY_COMBINATIONS)(
  "lays out the %j line combination deterministically without node collisions",
  (categories: readonly ReportLineCategory[]) => {
    // Arrange
    const nodes = Array.from({ length: 101 }, (_, index) => {
      const lineMetrics = {
        code: index === 0 ? 500 : index + 1,
        comment: index === 1 ? 500 : index % 7,
        blank: index === 2 ? 500 : index % 5,
      }
      return { id: `node-${String(index).padStart(3, "0")}`, size: nodeSizeForLines(activeLineCount(lineMetrics, categories)) }
    })

    // Act
    const firstLayout = layoutReportGraph(nodes, [])
    const secondLayout = layoutReportGraph(nodes, [])

    // Assert
    expect(firstLayout).toEqual(secondLayout)
    const overlaps: string[] = []
    for (let leftIndex = 0; leftIndex < firstLayout.length; leftIndex += 1) {
      const left = firstLayout[leftIndex]
      if (left === undefined) {
        continue
      }
      for (let rightIndex = leftIndex + 1; rightIndex < firstLayout.length; rightIndex += 1) {
        const right = firstLayout[rightIndex]
        if (right === undefined) {
          continue
        }
        if (Math.hypot(left.x - right.x, left.y - right.y) < left.size + right.size) {
          overlaps.push(`${left.id} overlaps ${right.id}`)
        }
      }
    }
    expect(overlaps).toEqual([])
  },
)
