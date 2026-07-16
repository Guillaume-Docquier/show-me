# 006 CLOC-Style Line Breakdown

## Status

Not started.

## Outcome

Analysis separates code, comment, and blank lines. Code lines size nodes by default, and report controls can combine any line categories.

## Tasks

- [ ] Define language-neutral code, comment, and blank line metrics.
- [ ] Classify JavaScript and TypeScript lines without mistaking comment-like text inside syntax for comments.
- [ ] Change default node sizing from non-blank lines to code lines.
- [ ] Add report controls for any combination of code, comment, and blank lines.
- [ ] Recompute node area and layout safely when the active metric changes.
- [ ] Show the complete breakdown in tooltips and the selected-node side panel.

## Required tests

- [ ] Focused fixtures cover line comments, block comments, multiline comments, JSX, templates, regular expressions, and comment markers inside strings.
- [ ] Tests cover files containing only one category and files with mixed categories.
- [ ] Property or focused algorithm tests prove category totals equal physical lines under the documented newline rules.
- [ ] Renderer tests cover each metric toggle and combinations.
- [ ] A regression fixture is added for every classification ambiguity discovered.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

None yet.
