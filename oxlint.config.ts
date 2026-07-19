import { typescript } from "@guillaume-docquier/oxlint"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [typescript],
  options: {
    reportUnusedDisableDirectives: "error",
    denyWarnings: true,
  },
  ignorePatterns: ["**/*.{mjs,js,cjs}", "*.gen.*", "fixtures/**/*"],
  rules: {
    "eslint/no-underscore-dangle": ["error", { allow: ["_tag"] }],
  },
})
