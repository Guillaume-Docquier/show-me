# Use Oxc For JavaScript And TypeScript Analysis

## Status

Accepted.

## Context

The initial analyzer needs syntax-level runtime dependencies from JavaScript, JSX, TypeScript, and TSX. It does not need type checking or source-code editing. Resolution must account for project configuration, and the parser must remain contained behind the language-module boundary.

ts-morph was considered because it provides an ergonomic TypeScript compiler wrapper and project dependency resolution. Its navigation and mutation surface is broader than this read-only analysis requires and would align the implementation more closely with the TypeScript compiler object model. Direct TypeScript compiler APIs and hand-written import scanning were also considered; the former carries similar coupling, while the latter would reimplement syntax parsing incorrectly.

Oxc provides native JavaScript and TypeScript parsing and a separate configurable resolver. Its Rust implementation also aligns with a possible future Rust analyzer, although that future rewrite is not required by this decision.

## Decision

Use `oxc-parser` and `oxc-resolver` inside the internal JavaScript/TypeScript language module.

The first supported dependency syntax is limited to static runtime ESM imports, side-effect imports, and static runtime re-exports. Explicitly type-only dependencies are excluded. Runtime classification is syntactic and does not invoke type checking.

Prove parser and resolver behavior with deterministic fixture projects before expanding support. CommonJS, dynamic imports, multiple project configurations, and monorepo resolution are follow-up milestones.

No Oxc AST or resolver type may cross into the language-neutral analysis model.

## Consequences

The first analyzer gets a fast standards-oriented parser without paying for editing or type-checking features it does not use. Oxc remains replaceable because it is isolated behind the language module.

Native bindings add packaging and cross-platform verification work. Resolution differences or unsupported edge cases must be discovered through real fixtures rather than assumed from parser success. Supporting type-semantic dependency questions would require a separate decision because the chosen initial analysis is intentionally syntax-based.

### 2026-07-25 type-only dependency amendment

The JavaScript and TypeScript language module now retains explicitly type-only static ESM imports and re-exports alongside runtime relationships. Classification remains syntax-only: ordinary imports are runtime dependencies even when their bindings are used only in type positions, and any runtime declaration or specifier takes precedence when a source-target pair also has a type-only declaration.

Type-only requests use the same Oxc resolver, project-file discovery boundary, configured-alias precedence, workspace-package fallback, and external-package classification as runtime requests. The versioned language-neutral analysis distinguishes `runtime` from `type-only`; no Oxc AST value crosses that boundary. This amendment supersedes the original decision only where it excluded explicitly type-only dependencies.
