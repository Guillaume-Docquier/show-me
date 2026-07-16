# Glossary

These are terms and their meaning in the context of this app.

| Term               | Description                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analysis           | The language-neutral, internal description of project files, metrics, dependencies, coverage, and diagnostics.                                                                           |
| Consumer           | A project file with a runtime dependency on another project file.                                                                                                                        |
| Dependency         | A directed relationship from a source project file to another project file or external package that the source uses at runtime. An ESM import is one language-specific example.          |
| Discovery          | Filesystem traversal that identifies candidate project files using language support, ignore rules, and standard exclusions without parsing source syntax.                                |
| External package   | A third-party package referenced by a project file, such as an npm package in a JavaScript project. It may be one synthetic graph node, but its installed files are never analyzed.      |
| Language module    | An internal project-level analyzer that understands the source files and dependency rules of one language family.                                                                        |
| Presentation model | Renderer-neutral graph data derived from analysis, including visual sizes, initial positions, display paths, and interaction metrics.                                                    |
| Project file       | A source file owned by the analyzed project, supported by a language module, and not excluded by discovery rules. Executable JavaScript and TypeScript files are the initial examples.   |
| Project root       | The directory selected for analysis. It defaults to the directory where `show-me` is invoked.                                                                                            |
| Report             | The self-contained HTML file produced from an analysis and opened independently in a browser.                                                                                            |
| Runtime dependency | A dependency represented by language syntax that can affect runtime behavior. For JavaScript and TypeScript, static ESM imports are included while explicitly type-only imports are not. |
| Workspace package  | A package declared by a pnpm workspace. A later milestone assigns project files to packages so the visualization can filter by workspace package.                                        |
