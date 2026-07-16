# 009 Import Compatibility

## Status

Not started.

## Outcome

JavaScript and TypeScript analysis recognizes additional runtime dependency forms and broader project-resolution configurations without weakening the initial static ESM contract.

## Tasks

- [ ] Add statically analyzable CommonJS `require()` dependencies.
- [ ] Add string-literal dynamic `import()` dependencies.
- [ ] Define diagnostics for non-literal dynamic dependency expressions.
- [ ] Support multiple project configurations and TypeScript project references outside pnpm-specific behavior.
- [ ] Classify dependency kinds so later UI work can filter or style them.
- [ ] Preserve syntax-only runtime analysis unless a separate ADR changes that boundary.

## Required tests

- [ ] Fixtures cover supported and unsupported CommonJS and dynamic forms.
- [ ] Tests cover conditional, nested, repeated, and mixed ESM/CommonJS dependencies.
- [ ] Resolution fixtures cover multiple configs, references, and module modes.
- [ ] Regression fixtures capture every Oxc parser or resolver compatibility gap discovered.
- [ ] Existing static ESM fixture expectations remain unchanged unless the documented contract changes.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

None yet.
