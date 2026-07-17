# 006 CLOC-Style Line Breakdown

## Status

Complete.

## Outcome

Analysis separates code, comment, and blank physical lines. Code lines size nodes by default, and accessible report controls combine any non-empty set of line categories with deterministic collision-safe relayout.

## Tasks

- [x] Define language-neutral code, comment, and blank line metrics.
- [x] Classify JavaScript and TypeScript lines without mistaking comment-like text inside syntax for comments.
- [x] Change default node sizing from non-blank lines to code lines.
- [x] Add report controls for any non-empty combination of code, comment, and blank lines.
- [x] Recompute node area and layout safely when the active metric changes.
- [x] Show the complete breakdown in tooltips and the selected-node side panel.

## Required tests

- [x] Focused fixtures cover line comments, block comments, multiline comments, JSX, templates, regular expressions, and comment markers inside strings.
- [x] Tests cover files containing only one category and files with mixed categories.
- [x] Focused algorithm tests prove category totals equal physical lines under the documented newline rules.
- [x] Renderer tests cover each metric toggle and all seven non-empty combinations.
- [x] Regression fixtures cover Unicode offsets, hashbang comments, JSX comment containers, and ordinary object-literal comments in TSX.

## Verification evidence

- `pnpm format:fix`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`: passed; Vitest ran 13 files and 140 tests.
- `pnpm build`: passed both Node and browser targets; the self-contained browser bundle was 430.4 kB.
- `pnpm test:browser`: all 4 Playwright tests passed, including all line-category combinations, selection persistence, an intermediate layout change, and exact code-only toggle-back geometry.

## Discovered gaps

- External-package visibility will reuse the browser report-view state and deterministic relayout seam in milestone 007.
- Layout performance with repeated interactive relayout remains part of milestone 011's measured large-codebase work.
