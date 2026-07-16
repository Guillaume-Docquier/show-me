# Architecture Decision Records (ADR) index

This index summarizes all accepted ADRs. When applying the concepts, read the related ADR for more context.

| ADR                                                        | Summary                                                                                          | Use when                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [001](./001-separate-analysis-from-rendering.md)           | Keep language analysis, report building, and rendering behind a language-neutral internal model. | Changing analysis contracts, language support, coverage import, or renderer inputs.           |
| [002](./002-use-oxc-for-javascript-typescript-analysis.md) | Use Oxc to parse and resolve JavaScript and TypeScript runtime ESM dependencies.                 | Changing JS/TS parsing, resolution, or supported import syntax.                               |
| [003](./003-use-sigma-graphology-forceatlas2.md)           | Use Sigma.js, Graphology, and collision-safe ForceAtlas2 for the initial 2D graph.               | Changing graph rendering, graph storage, layout, sizing, or collision behavior.               |
| [004](./004-generate-one-self-contained-html-report.md)    | Publish a scoped npm package whose CLI writes one offline HTML report.                           | Changing package identity, CLI output behavior, report packaging, or browser-launch behavior. |
| [005](./005-publish-dogfood-report-with-github-pages.md)   | Publish the latest validated, coverage-enriched repository report through GitHub Pages.          | Changing public report delivery, deployment gates, Pages artifacts, or workflow permissions.  |

## Deprecated / Superseded ADRs

| ADR | Summary | Use when |
| --- | ------- | -------- |
