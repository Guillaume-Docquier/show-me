import { expect, it } from "vitest"
import { nodeSizeForLines, type BrowserPresentation } from "./report-presentation.js"
import {
  buildReportView,
  initialReportViewState,
  reportViewLayoutSignature,
  visibleRelationships,
  type ReportViewState,
} from "./report-view.js"

const presentation: BrowserPresentation = {
  projectName: "example",
  workspacePackages: [
    { name: "frontend", path: "apps/frontend" },
    { name: "backend", path: "apps/backend" },
  ],
  nodes: [
    {
      id: "project-file:root.ts",
      kind: "project-file",
      displayName: "root.ts",
      path: "root.ts",
      workspacePackage: undefined,
      lineMetrics: { code: 2, comment: 3, blank: 5 },
      dependencyNodeIds: ["project-file:apps/frontend/main.ts", "external-package:sigma"],
      consumerNodeIds: [],
      coverage: undefined,
      color: "#111111",
      size: 1,
    },
    {
      id: "project-file:apps/frontend/main.ts",
      kind: "project-file",
      displayName: "apps/frontend/main.ts",
      path: "apps/frontend/main.ts",
      workspacePackage: "apps/frontend",
      lineMetrics: { code: 10, comment: 4, blank: 2 },
      dependencyNodeIds: [],
      consumerNodeIds: ["project-file:root.ts"],
      coverage: 100,
      color: "#222222",
      size: 2,
    },
    {
      id: "project-file:apps/backend/server.ts",
      kind: "project-file",
      displayName: "apps/backend/server.ts",
      path: "apps/backend/server.ts",
      workspacePackage: "apps/backend",
      lineMetrics: { code: 20, comment: 1, blank: 1 },
      dependencyNodeIds: ["external-package:fastify"],
      consumerNodeIds: [],
      coverage: 50,
      color: "#333333",
      size: 3,
    },
    externalPackage("external-package:sigma", "sigma", ["project-file:root.ts"]),
    externalPackage("external-package:fastify", "fastify", ["project-file:apps/backend/server.ts"]),
  ],
  edges: [
    {
      id: "project-dependency-0",
      kind: "project-file",
      source: "project-file:root.ts",
      target: "project-file:apps/frontend/main.ts",
    },
    {
      id: "external-package-dependency-0",
      kind: "external-package",
      source: "project-file:root.ts",
      target: "external-package:sigma",
    },
    {
      id: "external-package-dependency-1",
      kind: "external-package",
      source: "project-file:apps/backend/server.ts",
      target: "external-package:fastify",
    },
  ],
}

it("creates the default view from every workspace package without external packages", () => {
  // Arrange
  const state = initialReportViewState(presentation)

  // Act
  const view = buildReportView(presentation, state)

  // Assert
  expect(view.nodes.map(({ id }) => id)).toEqual([
    "project-file:root.ts",
    "project-file:apps/frontend/main.ts",
    "project-file:apps/backend/server.ts",
  ])
  expect(view.dependencyEdges.map(({ id }) => id)).toEqual(["project-dependency-0"])
  expect(view.visibleProjectFileCount).toBe(3)
  expect(view.directories).toContainEqual({
    id: "directory:apps/frontend",
    path: "apps/frontend",
    label: "frontend",
    depth: 2,
    parentDirectoryId: "directory:apps",
    childNodeIds: ["project-file:apps/frontend/main.ts"],
    descendantProjectFileCount: 1,
  })
  expect(view.graphNodeIds).toEqual(
    new Set([
      "project-file:root.ts",
      "project-file:apps/frontend/main.ts",
      "project-file:apps/backend/server.ts",
      "directory:.",
      "directory:apps",
      "directory:apps/backend",
      "directory:apps/frontend",
    ]),
  )
})

it("composes workspace filtering, external-package visibility, and line sizing in one transition", () => {
  // Arrange
  const state: ReportViewState = {
    lineCategories: ["code", "comment"],
    externalPackages: true,
    workspacePackages: new Set(["apps/frontend"]),
  }

  // Act
  const view = buildReportView(presentation, state)

  // Assert
  expect(view.nodes.map(({ id, size }) => ({ id, size }))).toEqual([
    { id: "project-file:root.ts", size: nodeSizeForLines(5) },
    { id: "project-file:apps/frontend/main.ts", size: nodeSizeForLines(14) },
    { id: "external-package:sigma", size: 8 },
  ])
  expect(view.dependencyEdges.map(({ id }) => id)).toEqual(["project-dependency-0", "external-package-dependency-0"])
  expect(visibleRelationships(view, ["project-file:apps/frontend/main.ts", "external-package:fastify"])).toEqual([
    "project-file:apps/frontend/main.ts",
  ])
})

it("produces a stable layout-input signature that changes with node sizing", () => {
  // Arrange
  const initial = buildReportView(presentation, initialReportViewState(presentation))
  const resized = buildReportView(presentation, {
    ...initial.state,
    lineCategories: ["code", "comment", "blank"],
  })

  // Act
  const firstInitialSignature = reportViewLayoutSignature(initial)
  const secondInitialSignature = reportViewLayoutSignature(initial)
  const resizedSignature = reportViewLayoutSignature(resized)

  // Assert
  expect(firstInitialSignature).toBe(secondInitialSignature)
  expect(resizedSignature).not.toBe(firstInitialSignature)
})

function externalPackage(id: string, packageName: string, consumerNodeIds: readonly string[]): BrowserPresentation["nodes"][number] {
  return {
    id,
    kind: "external-package",
    displayName: packageName,
    packageName,
    dependencyNodeIds: [],
    consumerNodeIds,
    color: "#c084fc",
    size: 8,
  }
}
