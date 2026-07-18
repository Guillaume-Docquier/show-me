/**
 * Calculate the deepest directory label visible at one Sigma camera ratio.
 *
 * Sigma uses ratio `1` for its default view, larger ratios when zoomed out, and smaller ratios when zoomed in. (+inf, 0)
 * Zooming in follows an accelerating curve so that high zoom reveals a few labels, but zooming in quickly reveals a lot more.
 *
 * @param cameraRatio - The positive Sigma camera ratio.
 * @returns The deepest directory depth whose label should be rendered.
 */
export function visibleDirectoryDepth(cameraRatio: number): number {
  if (cameraRatio >= 2) {
    // Zooming out twice goes to 2.88
    return 0
  }
  if (cameraRatio >= 1) {
    // Starting zoom
    return 1
  }
  if (cameraRatio >= 0.9) {
    return 2
  }
  if (cameraRatio >= 0.75) {
    return 3
  }
  if (cameraRatio >= 0.5) {
    // Zooming in once goes to 0.58
    return 5
  }
  if (cameraRatio >= 0.3) {
    // Zooming in twice goes to 0.34
    return 10
  }

  return Infinity
}
