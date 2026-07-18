# Use YAML And Tinyglobby For pnpm Workspace Discovery

## Status

Accepted.

## Context

Milestone 008 must interpret `pnpm-workspace.yaml` package patterns, including exclusions and nested globs. YAML syntax and glob matching both contain edge cases that should not be reimplemented inside Show Me.

The repository already uses focused libraries at filesystem and configuration boundaries. Neither the existing project-file discovery rules nor TypeScript configuration parsing represents pnpm workspace semantics.

## Decision

Use `yaml` to parse `pnpm-workspace.yaml` and `tinyglobby` to expand its package patterns to package manifests.

Keep both dependencies inside the workspace-discovery module. Normalize their output into language-neutral workspace package definitions before assigning file ownership or invoking language analysis.

## Consequences

Workspace discovery follows ordinary YAML and glob behavior without a bespoke parser. Package exclusions and nested paths can be proven with deterministic fixtures.

The production package gains two runtime dependencies. Any pnpm-specific behavior beyond package discovery remains isolated from the analysis model and browser presentation.
