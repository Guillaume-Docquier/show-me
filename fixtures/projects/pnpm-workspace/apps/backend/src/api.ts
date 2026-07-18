import { backendValue } from "@app/value"
import { sharedValue } from "@fixture/shared/value"
// oxlint-disable-next-line import/no-unassigned-import -- The fixture distinguishes backend-only external packages.
import "backend-library"

export const api = backendValue + sharedValue
