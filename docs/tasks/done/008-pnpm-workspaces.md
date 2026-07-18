# 008 pnpm Workspaces

## Status

Complete.

## Outcome

One analysis and report contain every package in a pnpm workspace, including cross-package dependencies, with controls for filtering workspace packages.

## Tasks

- [x] Discover workspace packages from `pnpm-workspace.yaml`.
- [x] Assign every project file to its nearest owning workspace package.
- [x] Support package-specific project configuration and cross-package resolution.
- [x] Classify workspace-owned package requests before the external-package fallback introduced in milestone 007.
- [x] Preserve all workspace packages and cross-package edges in one internal analysis.
- [x] Show all workspace packages by default.
- [x] Add report controls to enable or disable individual workspace packages.
- [x] Define how filtering affects cross-package edges without mutating the underlying analysis.
- [x] Filter external packages to those consumed by currently visible workspace files.

## Required tests

- [x] A deterministic pnpm workspace fixture contains frontend, backend, and shared packages.
- [x] Tests cover workspace globs, excluded packages, nested package paths, and files owned by the root.
- [x] Resolution tests cover cross-package imports and package-specific path aliases.
- [x] Renderer tests cover initial all-package visibility and individual package filters.
- [x] Renderer tests prove a backend-only view excludes frontend-only external packages.
- [x] An end-to-end report test proves one visualization contains the complete workspace.

## Verification evidence

- `pnpm test` — passed 17 Vitest files and 197 tests.
- `pnpm build` — rebuilt the Node CLI and browser bundle.
- `pnpm test:browser` — passed all 7 Playwright scenarios, including complete-workspace filtering.
- `pnpm checks` — formatting and lint fixes completed, type checking passed, all 197 Node tests and 7 browser tests passed, builds succeeded, and the CLI generated the dogfood report from this repository's root-only pnpm workspace.

## Discovered gaps

None.
