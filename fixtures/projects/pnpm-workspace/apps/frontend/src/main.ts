import { frontendValue } from "@app/value"
import { sharedValue } from "@fixture/shared"
// oxlint-disable-next-line import/no-unassigned-import -- The fixture distinguishes frontend-only external packages.
import "frontend-library"

export const main = frontendValue + sharedValue
