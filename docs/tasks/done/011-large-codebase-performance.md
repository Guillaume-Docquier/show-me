# 011 Large-Codebase Performance

## Status

Complete.

## Outcome

Show Me can analyze, generate, load, lay out, and interact with a project containing at least 1,000 executable files of at least 5,000 lines each without crashing or exhausting reasonable machine memory. Measured performance budgets protect the result from regression.

## Result

Completed on 2026-07-25. A deterministic generated corpus exercises 1,000 TypeScript files and 5,046,995 physical lines across ten disconnected regions with static runtime and type-only dependencies, cycles, varied file sizes and line categories, and partial coverage. The full benchmark measures two isolated CLI processes and two fresh Chromium sessions, verifies identical analysis and browser-presentation signatures, checks rendered collision geometry, exercises pan, zoom, hover, and selection, and enforces budgets recorded in the performance architecture.

Large graphs now use bounded Barnes-Hut ForceAtlas2 followed by deterministic uniform size-aware expansion. Small graphs retain exact size-aware ForceAtlas2. This reduced the full report from failing to become ready within four minutes to a 0.74–0.77 second ready time without node intersections.

## Tasks

- [x] Create a deterministic generated benchmark corpus with at least 1,000 files and at least 5,000 lines per file.
- [x] Make the corpus contain representative static imports, cycles, disconnected regions, file sizes, and coverage data rather than only isolated repeated files.
- [x] Instrument discovery, reading, line analysis, parsing, resolution, coverage, HTML packaging, browser presentation derivation, layout, and browser loading separately.
- [x] Record cold and warm CLI duration, peak memory, report size, browser load and layout time, and basic interaction responsiveness.
- [x] Profile the initial implementation and document the dominant bottlenecks before changing it.
- [x] Profile the collision-safe exact ForceAtlas2 path and evaluate size-aware optimized alternatives without reintroducing node intersections.
- [x] Optimize measured bottlenecks using bounded concurrency, reduced allocations, batching, workers, lazy work, or data-structure changes only where evidence supports them.
- [x] Verify that concurrency or reordering preserves deterministic analysis and report data.
- [x] Establish documented performance budgets from the optimized baseline on named hardware.
- [x] Add a smaller automated sentinel benchmark and document how to run the full-scale benchmark.
- [x] Update architecture documentation with any durable optimization constraints or tradeoffs discovered.

## Required tests

- [x] The complete semantic and CLI regression suites pass before and after optimization.
- [x] The full target workload completes successfully and produces a usable report.
- [x] Repeated benchmark runs produce semantically identical embedded analysis and browser-derived presentation data.
- [x] The automated sentinel fails on a meaningful regression without being dominated by normal timing noise.
- [x] Browser verification proves pan, zoom, hover, and selection remain responsive on the full target graph.
- [x] Geometry verification proves large nodes do not overlap smaller nodes before or after viewport fitting.
- [x] Benchmark evidence records workload, environment, commands, results, and accepted budgets.

## Verification evidence

- Baseline workload generation: `node benchmarks/generated-corpus.ts C:\tmp\show-me-task-011-baseline 1000 5000` produced 1,000 files and 5,046,995 lines.
- Pre-optimization CLI: 6,754.7 ms, 718.2 MiB peak working set, and a 0.81 MiB report.
- Pre-optimization Chromium: the report did not reach ready state within 240,000 ms while running 5,000 synchronous exact-repulsion iterations.
- `pnpm exec vitest run --silent=true src/performance/performance-profiler.test.ts src/report/browser/report-layout.test.ts src/analysis/analyze-project.test.ts src/cli/run-cli.test.ts` — passed 4 files and 34 tests during implementation.
- `pnpm test:performance` — passed twice through the CLI and Chromium for 300 files and 163,950 lines; CLI duration was 332.3–388.4 ms, layout was 112.5–133.5 ms, analysis and presentation signatures matched, and rendered clearance remained positive.
- `pnpm benchmark:full` — passed twice through the CLI and Chromium for 1,000 files and 5,046,995 lines. CLI duration was 7,144.7–7,187.0 ms, peak RSS was 745.3–747.0 MiB, and report size was 0.818 MiB. Chromium ready time was 608.9–611.6 ms and layout was 450.1–451.5 ms. Zoom, pan, hover, and selection each completed within 114 ms. Analysis and presentation signatures matched. Minimum graph-coordinate clearance was 1.0 and minimum fitted viewport clearance remained positive.
- Environment: Windows 10.0.26200, Intel Core i7-13700K, 24 logical CPUs, 32 GiB RAM, Node v26.5.0.
- `pnpm checks` — passed the complete semantic, CLI, build, browser, automated performance-sentinel, and dogfood-report gates.

## Discovered gaps

- Barnes-Hut still ignores individual node radii. The accepted large-graph path therefore separates topology from collision correctness: Barnes-Hut establishes positions, then uniform deterministic expansion enforces every radius pair without changing topology.
- Parsing accounts for approximately 6.08 seconds of the 7.19-second full CLI run. The application still retains source texts through language analysis and peaks below the accepted 1,250 MiB budget, so streaming or workers were not introduced without a demonstrated need.
- The full benchmark runs in CI on every push to `main` but remains outside the ordinary local `pnpm checks` gate. The 300-file sentinel uses broad timing ceilings plus deterministic hashes and collision assertions, making semantic or algorithmic regressions fail without relying on narrow wall-clock variance.
