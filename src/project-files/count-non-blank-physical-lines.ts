/**
 * Count non-blank physical lines across LF, CRLF, and CR line endings.
 *
 * Comments count as non-blank lines. This intentionally performs no syntax
 * classification; code/comment/blank breakdown belongs to milestone 006.
 *
 * @param sourceText - Complete text of one project file.
 * @returns The number of lines containing at least one non-whitespace character.
 */
export function countNonBlankPhysicalLines(sourceText: string): number {
  return sourceText.split(/\r\n|\n|\r/u).filter((line) => line.trim().length > 0).length
}
