# 011 Large-Codebase Performance

## Status

Not started.

## Outcome

Show Me can analyze, generate, load, lay out, and interact with a project containing at least 1,000 executable files of at least 5,000 lines each without crashing or exhausting reasonable machine memory. Measured performance budgets protect the result from regression.

## Tasks

- [ ] Create a deterministic generated benchmark corpus with at least 1,000 files and at least 5,000 lines per file.
- [ ] Make the corpus contain representative static imports, cycles, disconnected regions, file sizes, and coverage data rather than only isolated repeated files.
- [ ] Instrument discovery, reading, line analysis, parsing, resolution, coverage, HTML packaging, browser presentation derivation, layout, and browser loading separately.
- [ ] Record cold and warm CLI duration, peak memory, report size, browser load and layout time, and basic interaction responsiveness.
- [ ] Profile the initial implementation and document the dominant bottlenecks before changing it.
- [ ] Profile the collision-safe exact ForceAtlas2 path and evaluate size-aware optimized alternatives without reintroducing node intersections.
- [ ] Optimize measured bottlenecks using bounded concurrency, reduced allocations, batching, workers, lazy work, or data-structure changes only where evidence supports them.
- [ ] Verify that concurrency or reordering preserves deterministic analysis and report data.
- [ ] Establish documented performance budgets from the optimized baseline on named hardware.
- [ ] Add a smaller automated sentinel benchmark and document how to run the full-scale benchmark.
- [ ] Update architecture documentation with any durable optimization constraints or tradeoffs discovered.

## Required tests

- [ ] The complete semantic and CLI regression suites pass before and after optimization.
- [ ] The full target workload completes successfully and produces a usable report.
- [ ] Repeated benchmark runs produce semantically identical embedded analysis and browser-derived presentation data.
- [ ] The automated sentinel fails on a meaningful regression without being dominated by normal timing noise.
- [ ] Browser verification proves pan, zoom, hover, and selection remain responsive on the full target graph.
- [ ] Geometry verification proves large nodes do not overlap smaller nodes before or after viewport fitting.
- [ ] Benchmark evidence records workload, environment, commands, results, and accepted budgets.

## Verification evidence

Record commands, environment, baselines, profiles, optimizations, and final results here before completion.

## Discovered gaps

- The collision-safe milestone-003 layout uses 500 synchronous exact-repulsion iterations and is quadratic per iteration. Graphology ForceAtlas2's Barnes-Hut path cannot be enabled directly because it ignores individual node radii.
- A 1,000-node synthetic layout took approximately 1.96 seconds on the development machine. This is an early diagnostic, not a complete target-workload baseline or accepted budget.
- The application shell currently retains every discovered source text until project-level language analysis completes. Measure its memory impact on the target corpus before introducing streaming or bounded concurrency.
