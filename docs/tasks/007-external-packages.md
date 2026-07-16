# 007 External Packages

## Status

Not started.

## Outcome

The report can optionally reveal which project files import each npm package without parsing or traversing installed dependency code.

## Tasks

- [ ] Represent external package dependencies distinctly from project-file dependencies.
- [ ] Collapse unscoped and scoped package subpaths to their package roots.
- [ ] Create one fixed-size synthetic graph node per imported package.
- [ ] Never read or analyze files beneath `node_modules` for package-node creation.
- [ ] Hide package nodes and their edges by default.
- [ ] Add a report control to enable or disable external packages.
- [ ] Give package nodes a visually distinct, accessible appearance.

## Required tests

- [ ] Fixtures cover bare packages, package subpaths, scoped packages, and scoped subpaths.
- [ ] Tests prove repeated package imports create one package node and the expected file edges.
- [ ] A filesystem integration test proves package analysis does not traverse `node_modules`.
- [ ] Renderer tests cover the default-hidden state and toggle behavior.
- [ ] Tests cover package names that resemble project path aliases.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

None yet.
