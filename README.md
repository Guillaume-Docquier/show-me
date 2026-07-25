# show-me

Show Me turns a JavaScript or TypeScript project into a self-contained HTML visualization of its file dependency graph.

The CLI discovers executable project files, separates code, comment, and blank physical lines, analyzes static runtime ESM dependencies, identifies external npm package roots, automatically combines conventional Istanbul or LCOV line coverage from the project and package roots, and generates an interactive static graph report. Code lines size nodes by default, while report controls can combine any line categories and reveal fixed-size external-package nodes. By default, supported JavaScript and TypeScript files are omitted when their basename contains `.test.` or `.spec.`, case-insensitively; directory names and bare `test.ts` or `spec.ts` basenames do not trigger the exclusion. Start with the [documentation map](./docs/README.md) and the [implementation roadmap](./docs/tasks/README.md).

Repeat `--exclude <pattern>` to replace those built-in test and spec patterns for one invocation. Patterns use case-insensitive gitignore syntax against forward-slash project-relative file paths. A pattern without a slash matches a basename anywhere, while a leading slash anchors it at the project root. For example, this keeps the defaults and adds generated files:

```shell
show-me --exclude "*.test.*" --exclude "*.spec.*" --exclude "*.generated.*"
```

Supplying only `--exclude "*.generated.*"` includes conventional test and spec files because CLI patterns replace, rather than extend, the built-in set. Project `.gitignore` files, standard generated and dependency directories, declaration files, and unsupported languages remain excluded independently.

Explore the latest validated `main` revision in the [live Show Me report](https://guillaume-docquier.github.io/show-me/).

## AI Disclosure

This project has been vibe coded. If this turns out to be a useful tool, I'll refactor the project.
