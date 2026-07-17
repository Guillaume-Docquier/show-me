import { isAbsolute, posix, relative, resolve, sep } from "node:path"
import { Result, branded, type Branded } from "@guillaume-docquier/tools-ts"
import { compareText } from "../text/compare-text.js"

/**
 * A normalized project-relative path using forward slashes.
 */
export type ProjectFilePath = Branded<string, "ProjectFilePath">

/**
 * The reason a project file path could not be constructed.
 */
export type InvalidProjectFilePath = {
  readonly _tag: "InvalidProjectFilePath"
  readonly input: string
  readonly reason: "empty" | "project-root" | "absolute" | "outside-project-root"
}

/**
 * Operations for constructing normalized project file paths.
 */
export const ProjectFilePath = {
  /**
   * Parse a relative path into a normalized project file path.
   *
   * @param input - A relative path using platform-specific or forward-slash separators.
   * @returns A normalized path, or an error when the path cannot identify a project file.
   */
  parse(input: string): Result<ProjectFilePath, InvalidProjectFilePath> {
    if (input.length === 0) {
      return Result.Failure({
        _tag: "InvalidProjectFilePath",
        input,
        reason: "empty",
      })
    }

    const slashedPath = input.replaceAll("\\", "/")
    if (slashedPath.startsWith("/") || /^[a-zA-Z]:/u.test(slashedPath)) {
      return Result.Failure({
        _tag: "InvalidProjectFilePath",
        input,
        reason: "absolute",
      })
    }

    const normalized = posix.normalize(slashedPath).replace(/\/+$/u, "")
    if (normalized === ".") {
      return Result.Failure({
        _tag: "InvalidProjectFilePath",
        input,
        reason: "project-root",
      })
    }

    if (normalized === ".." || normalized.startsWith("../")) {
      return Result.Failure({
        _tag: "InvalidProjectFilePath",
        input,
        reason: "outside-project-root",
      })
    }

    return Result.Success(branded<ProjectFilePath>(normalized))
  },

  /**
   * Compare canonical project file paths without consulting the host locale.
   *
   * @param left - Project path on the left side of the comparison.
   * @param right - Project path on the right side of the comparison.
   * @returns A negative number, zero, or a positive number for ascending order.
   */
  compare(left: ProjectFilePath, right: ProjectFilePath): number {
    return compareText(left, right)
  },

  /**
   * Construct a project file path from an absolute file path below a project root.
   *
   * @param projectRoot - Root directory of the analyzed project.
   * @param absoluteFilePath - Absolute path of a file expected below the project root.
   * @returns A normalized project-relative path, or an error when the file is outside the root.
   */
  fromAbsolute(projectRoot: string, absoluteFilePath: string): Result<ProjectFilePath, InvalidProjectFilePath> {
    const resolvedRoot = resolve(projectRoot)
    const resolvedFile = resolve(absoluteFilePath)
    const relativePath = relative(resolvedRoot, resolvedFile)

    if (relativePath.length === 0 || isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
      return Result.Failure({
        _tag: "InvalidProjectFilePath",
        input: absoluteFilePath,
        reason: relativePath.length === 0 ? "project-root" : "outside-project-root",
      })
    }

    return ProjectFilePath.parse(relativePath)
  },
}
