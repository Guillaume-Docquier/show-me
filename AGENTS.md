# Show Me

Show me is a codebase visualization tool.

## Current status

We have the concept, but everything has yet to be built.

## Project Structure

This is a TypeScript repository managed via pnpm.

### Key Directories

| Directory | Description                                                                                |
| --------- | ------------------------------------------------------------------------------------------ |
| docs/     | All the documentation for the project. There is no documentation in the other directories. |
| src/      | The source code.                                                                           |

### CI/CD

As we're super early, we merge straight to the main branch.

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

## Testing

We use the Arrange/Act/Assert style.

We test the production code. We do not use `vitest.mock()`.

We prefer end-to-end and integration tests. We use unit tests sparingly for complex scenarios (algorithm verification, validating race conditions, regression tests, etc.)

Optimize assertions for useful failure output: compare semantic values instead of opaque IDs, sort unordered collections before comparison, keep test setup control flow straightforward, etc.

Do not reimplement the logic in the test to create the expected result. Be explicit and create the expected state by hand instead of computing it. This is often more code, but it avoids encoding bugs in the test.

## Commits And PRs

- Never commit, push, or open a pull request unless the human explicitly asks for it. A request to change code or tests does not imply permission to commit, push, or open a PR.
- Pre-commit runs `pnpm lint-staged`, for linting and formatting

## `@guillaume-docquier/tools-ts` Gotchas

- When importing a value and a type of the same name from the same package (e.g `Range` or `Result`), just import the value. Do not import the type to rename it.
