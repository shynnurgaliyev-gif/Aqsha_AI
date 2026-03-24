/**
 * Extracts a category name string from a category-correction command.
 *
 * Supported patterns (matched after lowercasing and trimming):
 *   "исправь категорию на еда"
 *   "категорию на еда"
 *   "категория еда"
 *   "set category food"
 *
 * Returns the extracted category name string, or null if no pattern matches.
 * The returned string is already lowercased and trimmed (ready for resolveCategory).
 */
const CATEGORY_PATTERNS: RegExp[] = [
  /^исправь\s+категорию\s+на\s+(.+)$/,
  /^категорию\s+на\s+(.+)$/,
  /^категория\s+(.+)$/,
  /^set\s+category\s+(.+)$/,
];

export function matchCategoryCorrection(text: string): string | null {
  const t = text.toLowerCase().trim();
  for (const pattern of CATEGORY_PATTERNS) {
    const m = t.match(pattern);
    if (m && m[1]) {
      return m[1].trim();
    }
  }
  return null;
}
