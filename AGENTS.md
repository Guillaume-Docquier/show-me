# Show Me

Show me is a codebase visualization tool.

## Current status

The initial JavaScript and TypeScript analysis pipeline and self-contained interactive report are operational. The CLI discovers project files, analyzes static runtime ESM dependencies, optionally imports Istanbul coverage, and publishes the latest validated report through GitHub Pages. See `docs/tasks/README.md` for implemented and planned milestones.

## Project Structure

This is a TypeScript repository managed via pnpm.

### Key Directories

| Directory | Description                                                                       |
| --------- | --------------------------------------------------------------------------------- |
| docs/     | Architecture, ADRs, vocabulary, testing guidance, and the implementation roadmap. |
| fixtures/ | Deterministic example projects used for analysis and regression tests.            |
| src/      | Production source code and colocated Node tests.                                  |
| tests/    | Real-browser report tests.                                                        |

### CI/CD

Changes land directly on `main`. Pushes to `main` run formatting, linting, type checking, coverage tests, package builds, and browser tests before the built CLI generates and deploys the public GitHub Pages report.

## Tech Stack

We use:

- pnpm to manage the pnpm (11) and node (26) versions
- oxfmt for formatting
- oxlint for linting
- typescript 7

### @guillaume-docquier/tools-ts

Leverage the `@guillaume-docquier/tools-ts` npm package as much as possible. This is a TypeScript library of utilities made by us. Their README.md contains a high-level view of the available utilities, read it.

## Coding standards

Read `docs/typescript-coding-standards.md` to properly follow coding standards.

## Glossary

Read `docs/glossary.md` for common terms with specific meaning in this project. When introducing new vocabulary, update the glossary.

## Architecture Decision Records (ADRs)

This repo uses ADRs in `docs/adr/` to capture important architecture decisions. Before making changes that touch architecture (new dependencies, new patterns, API design, infrastructure), check existing ADRs:

1. Read `docs/adr/README.md` for the index of decisions.
2. Read any accepted ADRs relevant to your area of work. Follow the decisions and implementation patterns they specify.
3. If you encounter a pattern in the code and wonder "why is it done this way?", check whether an ADR explains it.
4. If your work would contradict an existing accepted ADR, stop and discuss with the human before proceeding.

To propose or create a new ADR, follow `docs/adr/how-to.md`

## Commands

Always use pnpm, never use npm.

When formatting the code, always run oxfmt with write. oxfmt is deterministic, there's no point in checking before applying formatting.

Use these project commands:

- `pnpm format:fix` formats with write.
- `pnpm lint` runs oxlint without fixing.
- `pnpm typecheck` checks TypeScript without emitting.
- `pnpm test` runs the Node Vitest suite.
- `pnpm build` removes stale `dist` output, then builds the Node CLI and browser bundle.
- `pnpm test:browser` runs the real-browser Playwright suite against built report assets.
- `pnpm checks` runs the complete local gate. It is mutating because it starts with `format:fix`.

## Windows gotchas

On Windows, Codex's session `apply_patch` helper can create new files, but it currently fails before reading or modifying existing files with sandbox-helper refresh errors. Do not retry it for existing-file edits; normal `apply_patch` remains appropriate when creating a file.

For existing files, keep apply-patch semantics by running the pnpm-installed Codex PowerShell shim outside the sandbox with the required escalation. Do not use the WindowsApps execution alias or the session `apply_patch.bat`. Locate and validate the active pnpm shim without hardcoding installation details:

```powershell
$codexShim = (Get-Command codex.ps1 -CommandType ExternalScript -ErrorAction Stop).Source
if ($codexShim -notmatch '\\pnpm\\bin\\codex\.ps1$') { throw "Expected pnpm Codex shim, got: $codexShim" }
```

Pass the complete patch as one command-line argument, not through stdin:

```powershell
$patch = @'
*** Begin Patch
*** Update File: path/to/existing-file
@@
-old text
+new text
*** End Patch
'@
& $codexShim --codex-run-as-apply-patch $patch
if ($LASTEXITCODE -ne 0) { throw "Codex shim apply-patch failed" }
```

Existing-file edits must still use apply-patch mode. Never substitute `Set-Content`, `Out-File`, Python, `git apply`, or another shell writer.

## Testing

Use Arrange/Act/Assert for focused unit tests with one straightforward setup, operation, and result.

For Playwright browser tests, use awaited `test.step(...)` calls to describe meaningful phases of the user workflow. Keep an action and the expectations for its resulting state in the same step. Do not force an interaction-heavy browser test into one global Arrange/Act/Assert sequence, and do not create a separate step for every assertion.

We test the production code. We do not use `vitest.mock()`.

We prefer end-to-end and integration tests. We use unit tests sparingly for complex scenarios (algorithm verification, validating race conditions, regression tests, etc.)

Optimize assertions for useful failure output: compare semantic values instead of opaque IDs, sort unordered collections before comparison, keep test setup control flow straightforward, etc.

Do not reimplement the logic in the test to create the expected result. Be explicit and create the expected state by hand instead of computing it. This is often more code, but it avoids encoding bugs in the test.

## Commits And PRs

- Never commit, push, or open a pull request unless the human explicitly asks for it. A request to change code or tests does not imply permission to commit, push, or open a PR.
- Pre-commit runs `pnpm lint-staged`, for linting and formatting

## `@guillaume-docquier/tools-ts` Gotchas

- When importing a value and a type of the same name from the same package (e.g `Range` or `Result`), just import the value. Do not import the type to rename it.
