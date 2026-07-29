import { expect, it } from "vitest"
import { ReportNavigation, type ReportNavigationState } from "./report-navigation.js"

it("records explicit selections, suppresses duplicates, and navigates backward and forward", () => {
  // Arrange
  const transitions: Array<{ readonly state: ReportNavigationState; readonly centeredNodeId: string | undefined }> = []
  const navigation = new ReportNavigation({
    onChange: (state, centeredNodeId): void => {
      transitions.push({ state, centeredNodeId })
    },
  })
  navigation.setVisibleNodeIds(new Set(["project-file:a.ts", "project-file:b.ts", "project-file:c.ts"]))

  // Act
  navigation.activate("project-file:a.ts")
  navigation.activate("project-file:b.ts")
  navigation.activate("project-file:b.ts")
  navigation.goBack()
  navigation.goForward()

  // Assert
  expect(transitions.at(-1)).toEqual({
    state: {
      selectedNodeId: "project-file:b.ts",
      hoveredNodeId: undefined,
      history: ["project-file:a.ts", "project-file:b.ts"],
      historyIndex: 1,
      canGoBack: true,
      canGoForward: false,
    },
    centeredNodeId: "project-file:b.ts",
  })
})

it("keeps hover out of selection history and restores the persistent selection when hover ends", () => {
  // Arrange
  const states: ReportNavigationState[] = []
  const navigation = new ReportNavigation({
    onChange: (state): void => {
      states.push(state)
    },
  })
  navigation.setVisibleNodeIds(new Set(["project-file:a.ts", "project-file:b.ts"]))
  navigation.activate("project-file:a.ts")

  // Act
  navigation.preview("project-file:b.ts")
  navigation.clearPreview("project-file:b.ts")

  // Assert
  expect(states.slice(-2)).toEqual([
    {
      selectedNodeId: "project-file:a.ts",
      hoveredNodeId: "project-file:b.ts",
      history: ["project-file:a.ts"],
      historyIndex: 0,
      canGoBack: false,
      canGoForward: false,
    },
    {
      selectedNodeId: "project-file:a.ts",
      hoveredNodeId: undefined,
      history: ["project-file:a.ts"],
      historyIndex: 0,
      canGoBack: false,
      canGoForward: false,
    },
  ])
})

it("clears selection without erasing history and lets back restore the latest selection", () => {
  // Arrange
  let current: ReportNavigationState | undefined
  const navigation = new ReportNavigation({
    onChange: (state): void => {
      current = state
    },
  })
  navigation.setVisibleNodeIds(new Set(["project-file:a.ts"]))
  navigation.activate("project-file:a.ts")

  // Act
  navigation.clearSelection()
  const cleared = current
  navigation.goBack()

  // Assert
  expect(cleared).toMatchObject({
    selectedNodeId: undefined,
    history: ["project-file:a.ts"],
    historyIndex: 1,
    canGoBack: true,
  })
  expect(current).toMatchObject({
    selectedNodeId: "project-file:a.ts",
    historyIndex: 0,
    canGoBack: false,
  })
})

it("drops unavailable history entries when the visible graph changes", () => {
  // Arrange
  let current: ReportNavigationState | undefined
  const navigation = new ReportNavigation({
    onChange: (state): void => {
      current = state
    },
  })
  navigation.setVisibleNodeIds(new Set(["project-file:a.ts", "project-file:b.ts"]))
  navigation.activate("project-file:a.ts")
  navigation.activate("project-file:b.ts")

  // Act
  navigation.setVisibleNodeIds(new Set(["project-file:a.ts"]))

  // Assert
  expect(current).toEqual({
    selectedNodeId: undefined,
    hoveredNodeId: undefined,
    history: ["project-file:a.ts"],
    historyIndex: 1,
    canGoBack: true,
    canGoForward: false,
  })
})

it("preserves the active duplicate occurrence when an equivalent graph view is rebuilt", () => {
  // Arrange
  let current: ReportNavigationState | undefined
  const visibleNodeIds = new Set(["project-file:a.ts", "project-file:b.ts"])
  const navigation = new ReportNavigation({
    onChange: (state): void => {
      current = state
    },
  })
  navigation.setVisibleNodeIds(visibleNodeIds)
  navigation.activate("project-file:a.ts")
  navigation.activate("project-file:b.ts")
  navigation.activate("project-file:a.ts")
  navigation.goBack()
  navigation.goBack()

  // Act
  navigation.setVisibleNodeIds(visibleNodeIds)

  // Assert
  expect(current).toMatchObject({
    selectedNodeId: "project-file:a.ts",
    history: ["project-file:a.ts", "project-file:b.ts", "project-file:a.ts"],
    historyIndex: 0,
    canGoBack: false,
    canGoForward: true,
  })
})
