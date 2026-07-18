# Tree-sitter Parser Spike

## Status

Completed on 2026-07-18 in the isolated `codex/tree-sitter-spike` worktree.

This spike changes no production analyzer or accepted architecture decision. It adds a reproducible benchmark, a small Python proof, and development-only parser packages.

## Recommendation

Keep Oxc for JavaScript and TypeScript. Do not replace the existing JavaScript/TypeScript parser or resolver with tree-sitter.

Use tree-sitter as the leading parser candidate when Show Me adds a language that Oxc does not support. Make that choice per language after checking its grammar quality, dependency semantics, resolution strategy, packaging, and measured performance.

This hybrid approach gets tree-sitter's broad language reach without making the currently faster and more semantically complete JavaScript/TypeScript path pay for it.

ADR 002 remains valid.

## Why

### Flexibility

[Tree-sitter](https://tree-sitter.github.io/tree-sitter/) is a general parser generator with official bindings and grammars for many languages. Its upstream parser list includes Bash, C, C++, C#, CSS, Go, HTML, Java, JavaScript, JSON, PHP, Python, Ruby, Rust, TypeScript, and others. Its community [parser list](https://github.com/tree-sitter/tree-sitter/wiki/List-of-parsers) is broader.

The spike loaded official JavaScript, TypeScript, TSX, and Python WASM grammars through one `web-tree-sitter` runtime. The Python proof parsed:

- `import os`;
- aliased dotted imports;
- `from package.feature import value`; and
- relative imports.

Tree-sitter therefore provides a real common parsing mechanism across language families.

It does not provide a common dependency analyzer. Every new language still needs:

- discovery extensions and language identification;
- grammar selection and version management;
- language-specific queries or tree traversal;
- rules that distinguish runtime and type-only dependencies;
- module or package resolution;
- parser-error diagnostics; and
- semantic fixtures.

For example, parsing Python identifies `from .local import helper`, but Python-specific code must decide what `.local` resolves to. Replacing Oxc would also not replace `oxc-resolver`, because tree-sitter has no JavaScript/TypeScript project resolver.

### JavaScript and TypeScript fit

Oxc already exposes exactly the facts Show Me needs: static import/export metadata, type-only flags, comments, detailed parser errors, a current JavaScript/TypeScript AST, and a companion resolver.

The current official tree-sitter package set is less cohesive:

- `tree-sitter-javascript` 0.25.0 expects the 0.25 native runtime;
- `tree-sitter-typescript` 0.23.2 expects the 0.21 native runtime and depends on `tree-sitter-javascript` 0.23.x; and
- the portable spike used `web-tree-sitter` 0.26.11 to load both grammar ABIs.

On Show Me's checked-in static ESM fixture, the prototype matched Oxc in 13 of 14 files. The TypeScript grammar produced an `ERROR` node for:

```ts
export type * from "./types-only.js"
```

The naive tree-sitter extractor consequently reported a false runtime dependency. Oxc parsed and classified the same current TypeScript syntax correctly.

Tree-sitter also exposes error and missing nodes rather than Oxc-style parser messages. Show Me could translate those nodes into diagnostics, but the result would require more adapter code and would initially be less informative.

### Performance

The benchmark measures two modes:

- `parse`: produce a syntax tree or AST and inspect its root/error state;
- `show-me`: parse, then collect the static import/export requests, type-only classification, comments, JSX comment containers, and parser-error state needed at Show Me's parser seam.

It excludes file discovery, file I/O, dependency resolution, line classification, coverage, report building, and rendering. Both parsers process the same in-memory source strings sequentially.

Environment:

| Item        | Value                                           |
| ----------- | ----------------------------------------------- |
| OS          | Windows 11 x64, `10.0.26200`                    |
| CPU         | Intel family 6 model 183, 24 logical processors |
| Node        | 26.5.0                                          |
| Oxc         | `oxc-parser` 0.140.0 native binding             |
| Tree-sitter | `web-tree-sitter` 0.26.11                       |
| Grammars    | JavaScript 0.25.0; TypeScript/TSX 0.23.2        |

Warm median results use two warmups followed by five measured whole-corpus iterations:

| Corpus                                |    Mode |       Oxc | Tree-sitter WASM | Oxc advantage |
| ------------------------------------- | ------: | --------: | ---------------: | ------------: |
| Repository: 130 files, 5,082 lines    |   Parse |  10.36 ms |         21.12 ms |         2.04x |
| Repository: 130 files, 5,082 lines    | Show Me |  13.22 ms |         32.86 ms |         2.49x |
| Synthetic: 1,000 files, 200,000 lines |   Parse | 667.97 ms |        892.96 ms |         1.34x |
| Synthetic: 1,000 files, 200,000 lines | Show Me | 900.98 ms |      1,870.83 ms |         2.08x |

A fresh process better represents the one-shot CLI:

| Synthetic corpus             | Oxc Show Me | Tree-sitter WASM Show Me | Oxc advantage |
| ---------------------------- | ----------: | -----------------------: | ------------: |
| 1,000 files, 200,000 lines   |   983.83 ms |              1,724.11 ms |         1.75x |
| 1,000 files, 1,000,000 lines | 5,289.17 ms |              8,103.01 ms |         1.53x |

The portable tree-sitter path is materially slower, but not orders of magnitude slower. The extraction gap is larger than bare parsing because Oxc directly returns module metadata while tree-sitter requires CST traversal and many WASM boundary calls.

Initialization was about 7 ms for Oxc and 15 ms for the tree-sitter WASM runtime plus three grammars.

### Memory

After an explicit garbage collection, the fresh 200,000-line Show Me pass ended at:

| Parser           | RSS before |  RSS after | Endpoint increase |
| ---------------- | ---------: | ---------: | ----------------: |
| Oxc              |  91.20 MiB | 242.14 MiB |        150.94 MiB |
| Tree-sitter WASM |  99.59 MiB | 117.56 MiB |         17.97 MiB |

For 1,000,000 lines, Oxc ended at 294.48 MiB and tree-sitter at 197.99 MiB. The corpus itself accounts for much of both starting values.

These are endpoint RSS snapshots, not peak-memory measurements. They show a likely tree-sitter advantage because each WASM tree has an explicit `delete()`. Repeated whole-corpus Oxc parsing retained substantially more process RSS than the one-shot case, which deserves a dedicated profiler before a watch mode or long-lived analyzer is designed.

### Packaging

The official native `tree-sitter` 0.25.0 Node binding had no usable Windows prebuild in the installed package. On the documented Node 26 environment it fell back to `node-gyp` and failed because no usable MSBuild installation was present.

The official [Web Tree-sitter README](https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web) explicitly warns that WASM execution in Node is considerably slower than the native Node binding. Native tree-sitter could therefore narrow the timing gap, but this spike did not produce a valid native comparison. It should not be assumed either faster or slower than Oxc from the WASM numbers.

The WASM runtime and the three JavaScript/TypeScript grammar artifacts total about 3.3 MiB. Adding Python adds about 0.44 MiB. The unpacked grammar npm packages are much larger because they include generated sources, queries, native prebuilds for several platforms, and WASM artifacts. A production WASM design should package only the selected runtime and grammar artifacts rather than ship every development file.

## Decision Guide For A New Language

Use this sequence when adding the next language:

1. Prefer the language's official parser when it exposes dependency facts and resolution with strong performance and packaging.
2. Otherwise evaluate its tree-sitter grammar.
3. Build semantic fixtures for that language's runtime dependency forms and parser-error behavior.
4. Design a language-specific resolver; do not treat syntax extraction as resolution.
5. Benchmark the complete language-module seam on representative code.
6. Choose native or WASM delivery only after cross-platform installation is proven.

The existing language-neutral `ProjectAnalysis` and internal language-module boundary already support this hybrid strategy. No shared renderer or analysis-model redesign is required.

## Reproduction

Run the full comparison:

```powershell
pnpm spike:tree-sitter
```

Run the Python flexibility proof:

```powershell
pnpm spike:tree-sitter:python
```

Override the generated workload when needed:

```powershell
$env:SPIKE_FILE_COUNT = "1000"
$env:SPIKE_LINES_PER_FILE = "1000"
$env:SPIKE_ITERATIONS = "1"
$env:SPIKE_WARMUPS = "0"
pnpm spike:tree-sitter
```

The benchmark is diagnostic rather than a stable CI budget. Hardware load, parser versions, workload shape, and benchmark mode must accompany any quoted result.
