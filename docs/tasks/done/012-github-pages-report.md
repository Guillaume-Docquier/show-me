# 012 GitHub Pages Report

## Status

Complete.

## Outcome

Each push to `main` validates the repository and publishes a coverage-enriched Show Me report through GitHub Pages for remote inspection and public demonstration.

## Tasks

- [x] Trigger publication from pushes to `main`.
- [x] Install the pinned Node and pnpm versions from a frozen lockfile.
- [x] Run non-mutating formatting, linting, and type checking before tests and builds.
- [x] Generate Istanbul-format coverage through the Vitest coverage mode.
- [x] Build the package and run the Chromium browser suite.
- [x] Invoke the built CLI against this repository with an explicit coverage file.
- [x] Upload only the generated Pages site and deploy it with least-privilege permissions.
- [x] Publish `show-me.html` and an identical `index.html` root entry.
- [x] Link the public report from the project README.

## Required tests

- [x] The full Vitest suite passes in coverage mode and creates `coverage/coverage-final.json`.
- [x] The Node and browser builds pass.
- [x] The complete Playwright browser suite passes in Chromium.
- [x] The built CLI generates a report containing imported coverage.
- [x] The local `show-me.html` and `index.html` artifact files are byte-identical.

## Verification evidence

- `pnpm format`: all 119 files use the correct format.
- `pnpm lint`: passed with zero warnings.
- `pnpm typecheck`: passed.
- `pnpm test:coverage`: all 12 Vitest files and 66 tests passed, generated `coverage/coverage-final.json`, and reported 85.61% aggregate line coverage.
- `pnpm build`: the Node and browser builds passed; the browser bundle is 357.3 kB.
- `pnpm test:browser`: all 3 Playwright tests passed in Chromium.
- `node dist/cli/entry.cli.js . --coverage coverage/coverage-final.json --output _site/show-me.html`: generated a report with 69 nodes, including 13 nodes with imported coverage.
- Local artifact inspection found only `show-me.html` and `index.html` in `_site`; their SHA-256 hashes were identical.

## Discovered gaps

- The live deployment can only be verified after this commit reaches `main` and its first workflow run completes.
