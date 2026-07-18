# Performance Guidance

Show Me must eventually analyze and render large codebases quickly. Correctness and useful regression coverage come first, but early implementation choices must preserve a practical path to optimization.

## Target workload

The final performance milestone targets a project with at least 1,000 executable project files whose files are at least 5,000 lines each. This represents at least five million physical lines before dependency resolution, coverage enrichment, layout, and report generation.

The target is a benchmark workload, not permission to make smaller projects slow. The CLI and generated report should remain responsive for ordinary projects throughout development.

## Development guidance

- Implement the clearest correct behavior first and protect it with fixtures and regression tests.
- Do not add caches, concurrency, workers, streaming, or specialized data structures without measurements showing that they address a real bottleneck.
- Keep per-file analysis isolated enough to permit bounded concurrency later.
- Do not retain parser ASTs after their language-neutral analysis data has been produced unless profiling proves that retention is useful.
- Keep discovery, reading, parsing, resolution, coverage, report building, layout, and browser rendering measurable as separate phases.
- Keep analysis ordering deterministic even if work is later parallelized.
- Avoid contracts that require the entire implementation to remain single-threaded or that force the renderer to receive parser-specific data.
- Treat memory consumption, generated report size, browser load time, layout time, and interaction responsiveness as part of performance, not only CLI duration.

## Benchmarking

Semantic fixture projects remain small and hand-written. Large performance corpora may be generated deterministically from reviewed templates so the repository does not store millions of repetitive lines.

Every benchmark result records:

- workload parameters and generator version;
- operating system, CPU, memory, Node version, and package version;
- cold and warm execution time where relevant;
- peak process memory;
- phase-level timings;
- generated report size;
- browser load and layout time; and
- interaction responsiveness for the rendered graph.

Absolute regression budgets should be chosen from measured baselines on documented hardware rather than invented during architecture planning. The final optimization milestone establishes those budgets and a smaller automated sentinel benchmark where full-scale execution is unsuitable for every test run.

## Current layout baseline

The browser currently runs 5,000 synchronous exact-repulsion ForceAtlas2 iterations on initial load and after each view transition. Its Barnes-Hut path remains disabled because it ignores individual node radii, so the current layout is quadratic per iteration and blocks the browser while it runs.

Earlier layout implementations recorded a 182-file `text-based-browser-game-1` report in 114.5 ms with no node intersections and a separate 1,000-node synthetic layout in approximately 1.96 seconds. Those historical measurements are diagnostic observations, not a baseline for the current browser-only 5,000-iteration layout: they did not include the final import graph, large source contents, coverage data, or browser-load profiling.

Milestone 011 must include collision correctness in every optimized-layout comparison. A faster layout is not an improvement if viewport fitting or approximate repulsion lets large nodes hide other nodes.

## Optimization rule

Profile before optimizing, change one meaningful bottleneck at a time, and rerun the semantic regression suite after every optimization. An optimization is not accepted if it makes analysis nondeterministic, weakens expected-error handling, or changes the language contract without an explicit product decision.
