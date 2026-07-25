import { fileURLToPath } from "node:url"

/**
 * Names of deterministic fixture projects owned by the test suite.
 */
export type FixtureProjectName =
  | "cloc-line-breakdown"
  | "coverage-project"
  | "discovery"
  | "external-packages"
  | "import-compatibility"
  | "minimal-javascript"
  | "minimal-typescript"
  | "path-aliases"
  | "pnpm-workspace"
  | "project-configuration-absent"
  | "project-configuration-invalid"
  | "project-configuration-malformed"
  | "project-configuration-valid"
  | "static-esm"
  | "static-esm-no-config"
  | "test-file-exclusions"

/**
 * Resolve a fixture project independently from the process working directory.
 *
 * @param name - Fixture project to resolve.
 * @returns The absolute fixture-project directory.
 */
export function fixtureProjectPath(name: FixtureProjectName): string {
  return fileURLToPath(new URL(`../../fixtures/projects/${name}/`, import.meta.url))
}
