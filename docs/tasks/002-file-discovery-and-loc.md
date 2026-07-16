# 002 File Discovery And LOC

## Status

Not started.

## Outcome

Analysis discovers executable JavaScript and TypeScript project files from the filesystem and reports deterministic non-blank physical line counts that include comments.

## Tasks

- [ ] Discover supported JavaScript and TypeScript extensions beneath the project root.
- [ ] Exclude `.d.ts`, `.d.mts`, and `.d.cts` files.
- [ ] Honor `.gitignore` and the documented standard exclusions.
- [ ] Ignore CSS, JSON, SVG, images, and other non-code assets.
- [ ] Normalize project-relative paths and sort analysis output deterministically.
- [ ] Count non-blank physical lines consistently across supported line endings.
- [ ] Return typed discovery and file-reading failures.

## Required tests

- [ ] Fixture coverage includes every supported extension and every declaration-file exclusion.
- [ ] Fixture coverage proves nested `.gitignore` behavior and standard exclusions.
- [ ] Tests cover empty files, blank-only files, comments, final newlines, and LF and CRLF input.
- [ ] An integration test compares explicit expected project paths and line counts without recomputing them.
- [ ] A regression fixture is added for every discovery or counting gap found during implementation.

## Verification evidence

Record commands and results here before completion.

## Discovered gaps

None yet.
