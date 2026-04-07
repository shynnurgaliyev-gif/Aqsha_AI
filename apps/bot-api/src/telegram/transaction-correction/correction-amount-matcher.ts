/**
 * Extracts a positive integer amount from an amount-correction command.
 *
 * Supported patterns (matched after lowercasing and trimming):
 *   "исправь сумму на 3500"
 *   "сумму на 3500"
 *   "сумма 3500"
 *   "set amount 3500"
 *
 * Returns a positive integer amount, or null if no pattern matches.
 * Zero and negative values are rejected.
 */
const AMOUNT_PATTERNS: RegExp[] = [
  /^исправь\s+сумму\s+на\s+(\d+)$/,
  /^сумму\s+на\s+(\d+)$/,
  /^сумма\s+(\d+)$/,
  /^set\s+amount\s+(\d+)$/,
];

export function matchAmountCorrection(text: string): number | null {
  const t = text.toLowerCase().trim();
  for (const pattern of AMOUNT_PATTERNS) {
    const m = t.match(pattern);
    if (m && m[1]) {
      const amount = parseInt(m[1], 10);
      if (amount > 0) return amount;
    }
  }
  return null;
}
