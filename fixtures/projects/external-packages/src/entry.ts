import { aliasValue } from "@alias/value"
// oxlint-disable-next-line import/no-unassigned-import -- The fixture proves scoped package-root normalization.
import "@scope/package"
// oxlint-disable-next-line import/no-unassigned-import -- The fixture proves scoped package-subpath normalization.
import "@scope/package/feature"
import { aliasedValue } from "package-alias"
// oxlint-disable-next-line import/no-unassigned-import -- The fixture proves missing aliases remain diagnostics.
import "missing-package-alias"
// oxlint-disable-next-line import/no-unassigned-import -- The fixture proves Node built-ins are not package facts.
import "node:fs"
// oxlint-disable-next-line import/no-unassigned-import -- The fixture proves bare package normalization.
import "react"
// oxlint-disable-next-line import/no-unassigned-import -- The fixture proves repeated package subpaths deduplicate.
import "react/jsx-runtime"

export const entryValue = aliasValue + aliasedValue
