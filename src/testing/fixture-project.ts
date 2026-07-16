import { fileURLToPath } from "node:url"

/**
 * Names of deterministic fixture projects owned by the test suite.
 */
export type FixtureProjectName =
  | "coverage-project"
  | "discovery"
  | "minimal-javascript"
  | "minimal-typescript"
  | "static-esm"
  | "static-esm-no-config"

/**
 * Resolve a fixture project independently from the process working directory.
 *
 * @param name - Fixture project to resolve.
 * @returns The absolute fixture-project directory.
 */
export function fixtureProjectPath(name: FixtureProjectName): string {
  return fileURLToPath(new URL(`../../fixtures/projects/${name}/`, import.meta.url))
}
