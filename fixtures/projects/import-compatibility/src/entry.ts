import { esmValue } from "./esm.js"
import { mixedValue } from "./mixed.js"

declare const condition: boolean
declare const request: string

const conditionalValue = condition ? require("./conditional.js") : require("./conditional-alternate.js")
const repeatedConditionalValue = require("./conditional.js")

function loadNestedDependency(): unknown {
  return require("./nested")
}

const baseUrlValue = require("base-url-target")
const commonJsPackage = require("commonjs-package/subpath")
const mixedCommonJsValue = require("./mixed.js")
const dynamicValue = import("./dynamic.js")
const repeatedDynamicValue = import("./dynamic.js")
const dynamicPackage = import("dynamic-package/subpath")

require(request)
require(`./template.js`)
void import(request)
void import(`./template.js`)

export const value = {
  baseUrlValue,
  commonJsPackage,
  conditionalValue,
  dynamicPackage,
  dynamicValue,
  esmValue,
  loadNestedDependency,
  mixedCommonJsValue,
  mixedValue,
  repeatedConditionalValue,
  repeatedDynamicValue,
}
