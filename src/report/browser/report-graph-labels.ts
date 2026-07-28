import { drawDiscNodeHover, type NodeHoverDrawingFunction, type NodeLabelDrawingFunction } from "sigma/rendering"
import type { BrowserEdgeAttributes, BrowserNodeAttributes } from "./report-graph-types.js"

export const LABEL_FONT = "ui-monospace, SFMono-Regular, Consolas, monospace"
export const LABEL_COLOR = "#aebdca"
export const LABEL_SIZE = 11
export const LABEL_WEIGHT = "500"
export const DIRECTORY_LABEL_COLLISION_PADDING = 4
export const HOVER_LABEL_FOREGROUND = "#f5f9ff"
export const HOVER_LABEL_BACKGROUND = "#111821"

const LABEL_OFFSET = 3

type BrowserNodeHoverDrawingFunction = NodeHoverDrawingFunction<BrowserNodeAttributes, BrowserEdgeAttributes>
type BrowserNodeLabelDrawingFunction = NodeLabelDrawingFunction<BrowserNodeAttributes, BrowserEdgeAttributes>

/** Draw a hover disc without obscuring the node fill. */
export function drawNodeHover(
  context: Parameters<BrowserNodeHoverDrawingFunction>[0],
  data: Parameters<BrowserNodeHoverDrawingFunction>[1],
  settings: Parameters<BrowserNodeHoverDrawingFunction>[2],
): void {
  context.save()
  const isDirectory = typeof data.key === "string" && data.key.startsWith("directory:")
  if (isDirectory) {
    context.strokeStyle = HOVER_LABEL_FOREGROUND
    context.lineWidth = 2
    context.beginPath()
    context.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2)
    context.stroke()
  } else {
    drawDiscNodeHover(context, { ...data, label: null }, settings)
  }
  context.restore()
}

/** Draw one hovered node label plate above every graph rendering layer. */
export function drawHoveredNodeLabel(
  context: CanvasRenderingContext2D,
  data: {
    readonly label: string
    readonly x: number
    readonly y: number
    readonly size: number
  },
): void {
  context.save()
  context.font = `${LABEL_WEIGHT} ${LABEL_SIZE}px ${LABEL_FONT}`
  context.textAlign = "center"
  const geometry = centeredNodeLabelGeometry(context, data.label, data.x, data.y, data.size, LABEL_SIZE, DIRECTORY_LABEL_COLLISION_PADDING)
  context.fillStyle = HOVER_LABEL_BACKGROUND
  context.fillRect(
    geometry.bounds.left,
    geometry.bounds.top,
    geometry.bounds.right - geometry.bounds.left,
    geometry.bounds.bottom - geometry.bounds.top,
  )
  context.fillStyle = HOVER_LABEL_FOREGROUND
  context.fillText(data.label, geometry.textX, geometry.baseline)
  context.restore()
}

/** Draw a node label centered above its disc. */
export function drawNodeLabel(
  context: Parameters<BrowserNodeLabelDrawingFunction>[0],
  data: Parameters<BrowserNodeLabelDrawingFunction>[1],
  settings: Parameters<BrowserNodeLabelDrawingFunction>[2],
): void {
  if (data.label === null || data.label.length === 0) {
    return
  }

  context.save()
  context.fillStyle = LABEL_COLOR
  context.font = `${settings.labelWeight} ${settings.labelSize}px ${settings.labelFont}`
  context.textAlign = "center"
  const geometry = centeredNodeLabelGeometry(context, data.label, data.x, data.y, data.size, settings.labelSize, 0)
  context.fillText(data.label, geometry.textX, geometry.baseline)
  context.restore()
}

/** Measure the label rectangle used by drawing and collision selection. */
export function centeredNodeLabelGeometry(
  context: CanvasRenderingContext2D,
  label: string,
  nodeX: number,
  nodeY: number,
  nodeSize: number,
  labelSize: number,
  padding: number,
): {
  readonly textX: number
  readonly baseline: number
  readonly bounds: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
} {
  const text = context.measureText(label)
  const ascent = Math.max(text.actualBoundingBoxAscent, labelSize)
  const descent = Math.max(text.actualBoundingBoxDescent, 0)
  const baseline = nodeY - nodeSize - LABEL_OFFSET - descent
  return {
    textX: nodeX,
    baseline,
    bounds: {
      left: nodeX - text.width / 2 - padding,
      top: baseline - ascent - padding,
      right: nodeX + text.width / 2 + padding,
      bottom: baseline + descent + padding,
    },
  }
}
