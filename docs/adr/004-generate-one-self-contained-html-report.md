# Generate One Self-Contained HTML Report

## Status

Accepted.

## Context

Show Me is distributed as an npm CLI and should produce a visualization that can be opened, moved, and shared without running a server. A directory of HTML, JavaScript, CSS, and data assets would complicate the initial workflow. Automatically opening a browser would also add platform behavior and surprise in scripts or CI.

The unscoped `show-me` npm package name is already occupied. The package name and installed executable can differ, allowing a scoped package to retain a short everyday command.

## Decision

Publish the package as `@guillaume-docquier/show-me` and expose the `show-me` executable through the package `bin` entry.

The package exposes no programmatic JavaScript API. Analysis, presentation, and report-building modules remain internal package implementation details until a later decision establishes a supported API.

The CLI accepts an optional project path that defaults to the invocation directory. It writes one self-contained HTML file, defaulting to `show-me.html` in the invocation directory. `--output` overrides that location, and an existing output file is overwritten without a force flag.

The command embeds browser code, styles, and presentation data in the report. It does not embed project source contents. It never opens a browser and does not plan an `--open` option. On success it prints the resolved output path and total execution time.

A multi-file or hosted report mode is not planned until a concrete limitation requires it.

## Consequences

Installed use remains the short `show-me` command, while npm publication avoids the occupied unscoped name. Reports work offline and are easy to move or share.

Package export restrictions prevent consumers from depending on internal modules that are expected to evolve while the CLI contract stabilizes.

Browser assets and analysis data increase the size of every generated file. Bundling workers or other browser features into one file may require special build handling. If report size or browser restrictions become a measured problem, changing the packaging mode will require a new decision and migration path.

### 2026-07-15 build amendment

Node-facing TypeScript is compiled with `tsc`. The browser renderer is bundled with esbuild into an IIFE during package build, and report generation embeds that prebuilt asset. The CLI never compiles browser code while analyzing a project.

This keeps runtime report generation deterministic and avoids shipping a development server or runtime compiler. It introduces two explicit build targets and requires their outputs to be tested together through the packaged CLI workflow.

The choice belongs to this ADR because it implements the accepted self-contained report boundary; it does not change the report format or add another deployment mode.
