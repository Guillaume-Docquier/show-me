import { aliasedValue } from "@lib/aliased"
import { missingValue } from "@lib/missing"
import defaultValue from "./default-export.js"
// oxlint-disable-next-line import/no-unassigned-import -- The fixture proves that side-effect imports create runtime dependencies.
import "./side-effect.js"
import { indexedValue } from "./directory"
import { type MixedType, mixedRuntimeValue } from "./mixed.js"
// oxlint-disable-next-line typescript/consistent-type-imports -- The fixture proves that ordinary imports used only as types remain runtime dependencies.
import { OrdinaryType } from "./ordinary-type.js"
import { runtimeValue } from "./runtime"
import { runtimeValue as duplicateRuntimeValue } from "./runtime.js"
import type { OnlyType } from "./types-only.js"
// oxlint-disable-next-line import/no-unassigned-import -- The fixture proves that resolved non-code assets are ignored.
import "./data.json"
import "./styles.css"
// oxlint-disable-next-line import/no-unassigned-import -- The fixture proves that external packages are ignored in this milestone.
import "external-package"
// oxlint-disable-next-line import/no-unassigned-import -- The fixture proves that unresolved executable targets produce diagnostics.
import "./missing.js"

export type MainType = OnlyType & MixedType & OrdinaryType
export const mainValue =
  defaultValue + runtimeValue + duplicateRuntimeValue + mixedRuntimeValue + indexedValue + aliasedValue + missingValue
