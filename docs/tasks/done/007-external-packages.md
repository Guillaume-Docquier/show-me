# 007 External Packages

## Status

Complete.

## Outcome

The report can optionally reveal which project files consume each canonical npm package root without discovering, reading, parsing, or measuring installed dependency code.

## Tasks

- [x] Represent external package dependencies distinctly from project-file dependencies.
- [x] Collapse unscoped and scoped package subpaths to their package roots.
- [x] Create one fixed-size synthetic graph node per external package dependency.
- [x] Never read or analyze files beneath `node_modules` for package-node creation.
- [x] Hide package nodes and their edges by default.
- [x] Add a report control to enable or disable external packages.
- [x] Give package nodes a visually distinct, accessible appearance.

## Required tests

- [x] Fixtures cover bare packages, package subpaths, scoped packages, and scoped subpaths.
- [x] Tests prove repeated package imports create one package node and the expected file edges.
- [x] A filesystem integration test proves package analysis does not traverse `node_modules`.
- [x] Renderer tests cover the default-hidden state and toggle behavior.
- [x] Tests cover package names that resemble project path aliases.

## Verification evidence

- `pnpm format:fix`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`: passed; Vitest ran 15 files and 177 tests.
- `pnpm build`: passed both Node and browser targets; the self-contained browser bundle was 433.6 kB.
- `pnpm test:browser`: all 5 Playwright tests passed.
- The external-package browser test proved the default file-only layout exactly matches an equivalent presentation with no package facts, then covered toggle-on relationships, explicit package type cues, package selection, combined line-metric relayout, toggle-off selection clearing, and exact default-geometry restoration.
- The temporary-filesystem integration test created malformed installed package contents but produced only the consumer project file, one uninstalled package fact, one file-to-package edge, and no parser diagnostic from `node_modules`.

## Discovered gaps

- Milestone 008 must classify workspace-owned packages before the external-package fallback so local workspace edges remain project-owned.
- Milestone 009 owns broader project-resolution compatibility for unaliased bare requests such as additional project configurations.
- Milestone 011 owns measured optimization of repeated exact layout as optional node categories increase visible graph size.
