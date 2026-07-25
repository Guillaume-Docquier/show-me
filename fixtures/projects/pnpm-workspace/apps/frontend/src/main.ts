import { frontendValue } from "@app/value"
import { sharedValue } from "@fixture/shared"
import type { SharedType } from "@fixture/shared/value"
// oxlint-disable-next-line import/no-unassigned-import -- The fixture distinguishes frontend-only external packages.
import "frontend-library"

export const main = frontendValue + sharedValue
export type FrontendShared = SharedType
