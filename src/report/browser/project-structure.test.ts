import { expect, it } from "vitest"
import { buildProjectStructure } from "./project-structure.js"

it("derives a deterministic directory tree and file containment edges", () => {
  // Arrange
  const files = [
    { id: "project-file:README.md", path: "README.md" },
    { id: "project-file:src/features/accounts/create.ts", path: "src/features/accounts/create.ts" },
    { id: "project-file:src/platform/database.ts", path: "src/platform/database.ts" },
  ]

  // Act
  const firstStructure = buildProjectStructure(files, "example")
  const secondStructure = buildProjectStructure(files, "example")

  // Assert
  expect(firstStructure).toEqual(secondStructure)
  expect(firstStructure.directories).toEqual([
    { id: "directory:.", path: "", label: "example", depth: 0 },
    { id: "directory:src", path: "src", label: "src", depth: 1 },
    { id: "directory:src/features", path: "src/features", label: "features", depth: 2 },
    { id: "directory:src/platform", path: "src/platform", label: "platform", depth: 2 },
    { id: "directory:src/features/accounts", path: "src/features/accounts", label: "accounts", depth: 3 },
  ])
  expect(firstStructure.edges).toEqual([
    { id: "structure-directory:src", source: "directory:.", target: "directory:src" },
    { id: "structure-directory:src/features", source: "directory:src", target: "directory:src/features" },
    { id: "structure-directory:src/platform", source: "directory:src", target: "directory:src/platform" },
    {
      id: "structure-directory:src/features/accounts",
      source: "directory:src/features",
      target: "directory:src/features/accounts",
    },
    { id: "structure-file:project-file:README.md", source: "directory:.", target: "project-file:README.md" },
    {
      id: "structure-file:project-file:src/features/accounts/create.ts",
      source: "directory:src/features/accounts",
      target: "project-file:src/features/accounts/create.ts",
    },
    {
      id: "structure-file:project-file:src/platform/database.ts",
      source: "directory:src/platform",
      target: "project-file:src/platform/database.ts",
    },
  ])
})

it("keeps one labeled root directory for an empty project", () => {
  // Act
  const structure = buildProjectStructure([], "empty")

  // Assert
  expect(structure).toEqual({
    directories: [{ id: "directory:.", path: "", label: "empty", depth: 0 }],
    edges: [],
  })
})
