/** One label rectangle measured in current viewport pixels. */
export type ViewportLabelBounds = {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/** One directory label eligible for collision-aware viewport rendering. */
export type DirectoryLabelCandidate = {
  readonly id: string
  readonly label: string
  readonly depth: number
  readonly descendantProjectFileCount: number
  readonly hovered: boolean
  readonly nodeX: number
  readonly nodeY: number
  readonly bounds: ViewportLabelBounds
}

/** Current graph viewport dimensions in CSS pixels. */
export type LabelViewport = {
  readonly width: number
  readonly height: number
}

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

/**
 * Decide whether project-file labels may participate in Sigma label rendering.
 *
 * The threshold is below Sigma's default ratio so file names stay out of the
 * overview and appear after one deliberate zoom-in gesture.
 *
 * @param cameraRatio - The positive Sigma camera ratio.
 * @returns Whether file labels may be rendered at this zoom.
 */
export function fileLabelsAreVisible(cameraRatio: number): boolean {
  if (cameraRatio >= 0.3) {
    // Zooming in twice goes to 0.34
    return false
  }

  return true
}

/**
 * Select deterministic, non-overlapping directory labels for the current viewport.
 *
 * A hovered directory wins first. Ordinary orientation labels then favor
 * shallower directories, directories representing more visible project files,
 * and finally their stable graph identity. Candidates outside the current
 * viewport do not participate.
 *
 * @param candidates - Directory labels with measured viewport rectangles.
 * @param viewport - Current graph viewport dimensions.
 * @returns Priority-ordered labels whose rectangles do not overlap.
 */
export function selectVisibleDirectoryLabels(
  candidates: readonly DirectoryLabelCandidate[],
  viewport: LabelViewport,
): readonly DirectoryLabelCandidate[] {
  const selected: DirectoryLabelCandidate[] = []
  const candidatesByPriority = candidates.filter((candidate) => intersectsViewport(candidate.bounds, viewport)).toSorted(comparePriority)

  for (const candidate of candidatesByPriority) {
    if (selected.every((visible) => !boundsOverlap(candidate.bounds, visible.bounds))) {
      selected.push(candidate)
    }
  }

  return selected
}

function comparePriority(left: DirectoryLabelCandidate, right: DirectoryLabelCandidate): number {
  if (left.hovered !== right.hovered) {
    return left.hovered ? -1 : 1
  }
  const depthDifference = left.depth - right.depth
  if (depthDifference !== 0) {
    return depthDifference
  }
  const descendantDifference = right.descendantProjectFileCount - left.descendantProjectFileCount
  if (descendantDifference !== 0) {
    return descendantDifference
  }
  return left.id < right.id ? -1 : left.id === right.id ? 0 : 1
}

function intersectsViewport(bounds: ViewportLabelBounds, viewport: LabelViewport): boolean {
  return bounds.right > 0 && bounds.bottom > 0 && bounds.left < viewport.width && bounds.top < viewport.height
}

function boundsOverlap(left: ViewportLabelBounds, right: ViewportLabelBounds): boolean {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top
}
