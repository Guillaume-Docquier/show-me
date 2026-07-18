import { missingValue } from "features/missing"
import { featureValue } from "features/value"
import { sharedValue } from "@/shared"
// oxlint-disable-next-line import/no-unassigned-import -- The fixture keeps package classification alongside project aliases.
import "uninstalled-package/subpath"

export const value = sharedValue + featureValue + missingValue
