/**
 * Compare text by locale-independent UTF-16 code-unit order.
 *
 * @param left - Text on the left side of the comparison.
 * @param right - Text on the right side of the comparison.
 * @returns A negative number, zero, or a positive number for ascending order.
 */
export function compareText(left: string, right: string): number {
  if (left < right) {
    return -1
  }
  if (left > right) {
    return 1
  }
  return 0
}
