# 010 Visualization And UX

## Status

Not started.

## Outcome

The visualization remains understandable and accessible as graphs grow, with improved focus, grouping, and navigation.

## Candidate tasks

This milestone is intentionally broad. Select and refine work from observed usage rather than implementing every idea speculatively.

- [ ] Highlight incoming and outgoing dependency neighborhoods with clear direction semantics.
- [ ] Explore directory clustering or other optional grouping without changing the analysis model.
- [ ] Improve keyboard navigation, focus management, tooltip accessibility, and non-color cues.
- [ ] Add search or focus modes when real navigation needs justify them.
- [ ] Add additional layout strategies only when measured graph shapes require them.
- [ ] Revisit report packaging only if single-file size or browser constraints become concrete problems.

## Required tests

- [ ] Every selected UX change has interaction coverage at the browser seam.
- [ ] Accessibility behavior is asserted with keyboard and semantic expectations, not screenshots alone.
- [ ] Visual regression coverage is added only where semantic DOM or graph assertions cannot identify the failure.
- [ ] Existing selection, filtering, sizing, and coverage behavior remains covered during UX changes.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

- Analysis retains recoverable parser and unresolved-dependency diagnostics, but the current CLI and report do not surface them. Choose warning/report presentation and accessibility behavior before implementation.
