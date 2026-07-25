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
- Keep discovery, reading, parsing, resolution, coverage, report packaging, browser presentation derivation, layout, and browser rendering measurable as separate phases.
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

## Measured layout strategy

The pre-milestone browser ran 5,000 synchronous exact-repulsion ForceAtlas2 iterations for every view. On the full target report, Chromium did not reach ready state within 240 seconds. The CLI itself completed in 6.75 seconds with approximately 718 MiB peak working set, making browser layout the dominant unusable path.

Small graphs of up to 200 graph nodes now retain 500 exact size-aware ForceAtlas2 iterations. Larger graphs run 250 bounded Barnes-Hut iterations to establish topology. Because Barnes-Hut ignores individual radii, the renderer then calculates the required pairwise collision scale and uniformly expands every position around the graph center. Uniform expansion preserves the ForceAtlas2 topology and deterministically guarantees one layout unit of clearance between every graph-coordinate circle.

The final pairwise collision check is quadratic but runs once, rather than on every force iteration. At the measured 1,112 graph nodes, the complete browser layout takes approximately 0.45 seconds and fitted viewport circles retain positive clearance. Any replacement must keep the deterministic browser-presentation signature and collision assertions.

## Reproducible benchmarks and budgets

Run `pnpm test:performance` for the automated 300-file, 163,950-line sentinel. It is part of `pnpm checks`. Run `pnpm benchmark:full` for the 1,000-file, 5,046,995-line workload; CI runs this full benchmark after the browser suite on every push to `main`. The CI step is informational because hosted-runner timing varies. Budget overruns appear in the GitHub job summary but do not block the validated repository report or Pages deployment. Generated projects, reports, and JSON evidence are written under ignored `.benchmark/<kind>/` directories.

The full command runs isolated cold-process and warm-filesystem-cache CLI scenarios plus two fresh Chromium sessions. It records phase timings, peak RSS, report size, complete embedded-analysis and browser-presentation signatures, graph geometry, and pan, zoom, hover, and selection durations.

Budgets were established on Windows 10.0.26200 with an Intel Core i7-13700K, 24 logical CPUs, 32 GiB RAM, and Node v26.5.0:

| Measurement               | Full budget | Measured baseline  |
| ------------------------- | ----------- | ------------------ |
| CLI duration              | 15,000 ms   | 7,144.7–7,187.0 ms |
| CLI peak RSS              | 1,250 MiB   | 745.3–747.0 MiB    |
| Report size               | 2 MiB       | 0.818 MiB          |
| Browser ready             | 15,000 ms   | 608.9–611.6 ms     |
| Browser layout            | 10,000 ms   | 450.1–451.5 ms     |
| Each measured interaction | 1,000 ms    | 26.1–114.0 ms      |

The timing ceilings deliberately leave room for ordinary machine noise. Deterministic analysis hashes, complete presentation signatures, bounded layout work, and collision assertions catch meaningful semantic and algorithmic regressions independently of timing.

Parsing is the largest remaining CLI phase at approximately 6.08 seconds. Peak RSS remains within budget while source texts are retained through language analysis. Streaming, concurrency, and workers remain unjustified until a future workload exceeds these measured budgets.

## Optimization rule

Profile before optimizing, change one meaningful bottleneck at a time, and rerun the semantic regression suite after every optimization. An optimization is not accepted if it makes analysis nondeterministic, weakens expected-error handling, or changes the language contract without an explicit product decision.
