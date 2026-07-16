# show-me

Show Me turns a JavaScript or TypeScript project into a self-contained HTML visualization of its file dependency graph.

The CLI discovers executable project files, measures non-blank lines, analyzes static runtime ESM dependencies, optionally imports Istanbul line coverage, and generates an interactive static graph report. By default, supported JavaScript and TypeScript files are omitted when their basename contains `.test.` or `.spec.`, case-insensitively; directory names and bare `test.ts` or `spec.ts` basenames do not trigger the exclusion. CLOC-style line classification is the next implementation milestone. Start with the [documentation map](./docs/README.md) and the [implementation roadmap](./docs/tasks/README.md).

Explore the latest validated `main` revision in the [live Show Me report](https://guillaume-docquier.github.io/show-me/).
