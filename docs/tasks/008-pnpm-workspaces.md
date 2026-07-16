# 008 pnpm Workspaces

## Status

Not started.

## Outcome

One analysis and report contain every package in a pnpm workspace, including cross-package dependencies, with controls for filtering workspace packages.

## Tasks

- [ ] Discover workspace packages from `pnpm-workspace.yaml`.
- [ ] Assign every project file to its nearest owning workspace package.
- [ ] Support package-specific project configuration and cross-package resolution.
- [ ] Preserve all workspace packages and cross-package edges in one internal analysis.
- [ ] Show all workspace packages by default.
- [ ] Add report controls to enable or disable individual workspace packages.
- [ ] Define how filtering affects cross-package edges without mutating the underlying analysis.

## Required tests

- [ ] A deterministic pnpm workspace fixture contains frontend, backend, and shared packages.
- [ ] Tests cover workspace globs, excluded packages, nested package paths, and files owned by the root.
- [ ] Resolution tests cover cross-package imports and package-specific path aliases.
- [ ] Renderer tests cover initial all-package visibility and individual package filters.
- [ ] An end-to-end report test proves one visualization contains the complete workspace.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

None yet.
