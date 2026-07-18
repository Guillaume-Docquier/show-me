# 009 Import Compatibility

## Status

In progress.

## Outcome

JavaScript and TypeScript analysis recognizes additional runtime dependency forms and broader project-resolution configurations without weakening the initial static ESM contract.

## Tasks

- [ ] Add statically analyzable CommonJS `require()` dependencies.
- [ ] Add string-literal dynamic `import()` dependencies.
- [ ] Define diagnostics for non-literal dynamic dependency expressions.
- [x] Support multiple project configurations and TypeScript project references outside pnpm-specific behavior.
- [ ] Resolve `baseUrl` and other unaliased project-owned bare requests before the external-package fallback.
- [ ] Classify dependency kinds so later UI work can filter or style them.
- [ ] Preserve syntax-only runtime analysis unless a separate ADR changes that boundary.

## Required tests

- [ ] Fixtures cover supported and unsupported CommonJS and dynamic forms.
- [ ] Tests cover conditional, nested, repeated, and mixed ESM/CommonJS dependencies.
- [ ] Resolution fixtures cover multiple configs, references, and module modes.
- [ ] Regression fixtures capture every Oxc parser or resolver compatibility gap discovered.
- [ ] Existing static ESM fixture expectations remain unchanged unless the documented contract changes.

## Verification evidence

- `pnpm exec vitest run --silent=true src/languages/javascript-typescript/analyze-javascript-typescript.test.ts` — passed 1 file and 4 tests.
- `pnpm test` — passed 16 files and 188 tests.
- `pnpm typecheck` — passed.
- `pnpm build` — passed the Node CLI and browser bundle builds.
- `pnpm checks` — passed formatting, linting, type checking, 16 Vitest files with 188 tests, both builds, and 6 Playwright tests.
- The built CLI analyzed `text-based-browser-game-1` in 171.3 ms and emitted the expected `frontend/src/main.tsx` alias dependency edges.

## Discovered gaps

- Automatically discovered parent `tsconfig.json` and `jsconfig.json` files, relative base configurations, and referenced project configurations participate in path-alias resolution. Explicitly named configurations without a discoverable parent configuration remain outside this slice.
