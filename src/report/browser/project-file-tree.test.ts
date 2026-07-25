import { expect, it } from "vitest"
import { buildProjectFileTree } from "./project-file-tree.js"

it("builds a sorted project hierarchy without rendering a synthetic root", () => {
  // Arrange
  const files = [
    { id: "project-file:src/view.ts", path: "src/view.ts" },
    { id: "project-file:root.ts", path: "root.ts" },
    { id: "project-file:src/features/api.ts", path: "src/features/api.ts" },
    { id: "project-file:src/app.ts", path: "src/app.ts" },
  ]

  // Act
  const tree = buildProjectFileTree(files, "")

  // Assert
  expect(tree).toEqual([
    { kind: "file", id: "project-file:root.ts", name: "root.ts", path: "root.ts" },
    {
      kind: "directory",
      name: "src",
      path: "src",
      children: [
        { kind: "file", id: "project-file:src/app.ts", name: "app.ts", path: "src/app.ts" },
        {
          kind: "directory",
          name: "features",
          path: "src/features",
          children: [{ kind: "file", id: "project-file:src/features/api.ts", name: "api.ts", path: "src/features/api.ts" }],
        },
        { kind: "file", id: "project-file:src/view.ts", name: "view.ts", path: "src/view.ts" },
      ],
    },
  ])
})

it("filters case-insensitively by complete paths and retains their directories", () => {
  // Arrange
  const files = [
    { id: "project-file:apps/backend/src/api.ts", path: "apps/backend/src/api.ts" },
    { id: "project-file:apps/frontend/src/main.ts", path: "apps/frontend/src/main.ts" },
    { id: "project-file:packages/shared/src/api.ts", path: "packages/shared/src/api.ts" },
  ]

  // Act
  const tree = buildProjectFileTree(files, "BACKEND")

  // Assert
  expect(tree).toEqual([
    {
      kind: "directory",
      name: "apps",
      path: "apps",
      children: [
        {
          kind: "directory",
          name: "backend",
          path: "apps/backend",
          children: [
            {
              kind: "directory",
              name: "src",
              path: "apps/backend/src",
              children: [
                {
                  kind: "file",
                  id: "project-file:apps/backend/src/api.ts",
                  name: "api.ts",
                  path: "apps/backend/src/api.ts",
                },
              ],
            },
          ],
        },
      ],
    },
  ])
})
