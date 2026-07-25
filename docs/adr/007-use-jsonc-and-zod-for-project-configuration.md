# Use JSONC and Zod for Project Configuration

## Status

Accepted.

## Context

Projects need to persist Show Me settings without turning the command line into the long-term storage format. The persistable CLI settings are the report output path, one explicit coverage path, and the complete file-exclusion pattern set. Configuration must remain readable by people, reject misspelled or incorrectly typed values, and enter the command through the same typed boundaries as command-line overrides.

Automatically searching parent directories or accepting several filenames would make the active configuration harder to identify. Passing raw parsed objects or configuration-library values into discovery would also duplicate precedence and file-matching rules outside their current owners.

## Decision

Show Me automatically reads only `show-me.config.json` from the analyzed project root. The file uses JSONC, including comments and trailing commas, parsed with `jsonc-parser`. The resulting unknown value is parsed with a strict Zod schema before it is translated into application inputs.

The schema contains optional `output` and `coverage` strings plus one optional `exclude` array. Configured paths are resolved from the directory containing the configuration file, which is always the project root. CLI paths remain relative to the invocation directory. A defined exclusion array is parsed into the same complete `ProjectFileSelection` accepted from repeatable CLI `--exclude` options. Patterns remain case-insensitive, gitignore-style, and project-relative.

Precedence is applied independently for each persistable value:

1. CLI options;
2. project configuration;
3. built-in defaults.

An absent value falls through to the next layer. Any defined value replaces the lower-precedence value; configuration and CLI arrays are never combined, and an explicitly empty array is meaningful.

Configuration loading belongs to the Node CLI boundary. The CLI selects one effective output path, coverage path, and file-selection value independently. Discovery receives only the effective typed file-selection input and retains ownership of permanent exclusions and pattern matching. Coverage import receives at most one effective explicit path, and the report writer receives one effective output path. The browser and embedded analysis do not receive raw configuration.

There is no configuration schema version yet because no migration or compatibility boundary exists.

## Consequences

Projects gain one discoverable, comment-friendly configuration file with deterministic precedence and useful read, JSONC, schema, and domain-parse failures. Zod rejects unknown keys and incorrect value shapes before analysis begins. Existing CLI-only workflows, automatic coverage discovery, output defaults, and file-selection defaults remain unchanged when the file or corresponding value is absent.

Adding persistable settings later requires extending the strict schema, translating the value at the same boundary, and defining its per-value precedence. A future incompatible configuration contract may require schema versioning, but versioning is not introduced speculatively.
