# Glossary

These are terms and their meaning in the context of this app.

| Term               | Description                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analysis           | The language-neutral, internal description of project files, metrics, dependencies, coverage, and diagnostics.                                                                         |
| Consumer           | A project file with a runtime dependency on another project file.                                                                                                                      |
| Dependency         | A directed relationship from a source project file to another project file or external package that the source uses at runtime. An ESM import is one language-specific example.        |
| Discovery          | Filesystem traversal that identifies candidate project files using language support, ignore rules, and standard exclusions without parsing source syntax.                              |
| External package   | A third-party package referenced by a project file, such as an npm package in a JavaScript project. It may be one synthetic graph node, but its installed files are never analyzed.    |
| Graph node         | A visual entity in the report. Project files are the initial graph nodes; later milestones may add other analyzed entities such as external packages.                                  |
| Language module    | An internal project-level analyzer that understands the source files and dependency rules of one language family.                                                                      |
| Layout             | The deterministic placement of graph nodes in two dimensions, including collision spacing derived from their visual sizes.                                                             |
| Line metric        | A line count attached to a project file and available for display or node sizing. Non-blank physical lines are the initial metric; code, comment, and blank counts are planned.        |
| Node size          | A renderer-neutral radius-like value whose squared value determines node area. Node area is proportional to the active line metric.                                                    |
| Presentation model | Renderer-neutral graph data derived from analysis, including visual sizes, layout coordinates, display paths, and interaction metrics.                                                 |
| Project file       | A source file owned by the analyzed project, supported by a language module, and not excluded by discovery rules. Executable JavaScript and TypeScript files are the initial examples. |
| Project root       | The directory selected for analysis. It defaults to the directory where `show-me` is invoked.                                                                                          |
| Report             | The self-contained HTML file produced from an analysis and opened independently in a browser.                                                                                          |
| Runtime dependency | A dependency that can affect runtime behavior. A static non-type-only ESM import is one language-specific example.                                                                     |
| Workspace package  | A package declared by a pnpm workspace. A later milestone assigns project files to packages so the visualization can filter by workspace package.                                      |
