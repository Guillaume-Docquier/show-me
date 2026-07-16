# Publish The Dogfood Report With GitHub Pages

## Status

Accepted.

## Context

Show Me already generates the self-contained report defined by ADR 004, but that report is only available on the machine that runs the CLI. We want the latest `main` report to be inspectable remotely and to serve as a public demonstration of the tool.

The report must represent code that passed the repository quality gates, include current line coverage, and come from the built CLI. Committing generated HTML or publishing from a dedicated branch would add generated-file churn and a second source of truth. Uploading the generated file as a GitHub Pages artifact keeps the deployed site tied to one workflow run.

## Decision

A workflow triggered by pushes to `main` checks formatting, linting, and types before running tests with coverage. It then builds the package, runs the browser suite, and invokes the built CLI against this repository with an explicit `coverage/coverage-final.json` input.

The workflow uploads only `_site`. The CLI generates the report directly as `_site/index.html`, making the Pages root the report URL without a workflow copy step. A separate deployment job publishes the artifact to the `github-pages` environment.

The build job receives read-only repository access. The deployment job receives only `pages: write` and `id-token: write`. The workflow runs only from `main`, uses the repository's pinned Node and pnpm versions, installs from the frozen lockfile, and does not use deployment secrets. Actions are pinned to immutable release commit hashes to limit supply-chain drift.

This decision applies ADR 004's one-file report contract. It does not change the report format or add hosted runtime behavior.

## Consequences

The public report always describes a revision that passed the complete workflow and is available at the repository Pages root. A failed quality gate, test, build, analysis, upload, or deployment prevents that revision from replacing the latest successful result.

Publishing makes project-relative file paths, runtime dependencies, file metrics, and coverage percentages public. The report does not contain source file contents.

The site shows only the latest successful deployment. Historical reports remain workflow artifacts rather than versioned source files. Publishing now depends on GitHub Actions and GitHub Pages availability. Action upgrades and the first deployment remain operational checks for maintainers.
