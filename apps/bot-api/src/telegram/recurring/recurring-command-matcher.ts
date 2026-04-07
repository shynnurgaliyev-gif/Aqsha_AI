export interface RecurringDraft {
  description: string;
  amount: number;
  dayOfMonth: number;
}

/**
 * Keyword pattern covering all supported aliases for "every month".
 * Matches: каждый месяц, каждый мес, каждого числа, ежемесячно, every month
 */
const KEYWORD = /каждый\s+(?:месяц|мес\.?)|ежемесячно|каждого\s+числа/i;

/**
 * Returns true if the text looks like a recurring expense attempt
 * (contains the keyword), even if the full parse fails.
 * Used to give targeted error messages instead of falling through.
 */
export function looksLikeRecurringCommand(text: string): boolean {
  return KEYWORD.test(text);
}

/**
 * Parses a recurring expense creation command.
 *
 * Supported patterns (all keyword aliases, case-insensitive):
 *   "аренда 120000 каждый месяц 5"
 *   "аренда каждый мес 5 120000"
 *   "ежемесячно 5 аренда 120000"
 *   "аренда 120000 каждого числа 5"
 *
 * Day must be 1–28 (works even in February).
 * Returns null if the text does not match or day is out of range.
 */
export function matchRecurringCreateCommand(text: string): RecurringDraft | null {
  const t = text.trim();

  if (!KEYWORD.test(t)) return null;

  // Normalise all keyword variants to a single placeholder so one set of
  // patterns covers all aliases.
  const normalised = t.replace(KEYWORD, '__KW__');

  // Pattern 1: description amount __KW__ day
  let m = /^(.+?)\s+(\d+)\s+__KW__\s+(\d{1,2})\s*$/.exec(normalised);
  if (m) {
    const [, rawDesc, rawAmt, rawDay] = m;
    if (rawDesc && rawAmt && rawDay) {
      const desc = rawDesc.trim();
      const amount = parseInt(rawAmt, 10);
      const day = parseInt(rawDay, 10);
      if (desc && amount > 0 && day >= 1 && day <= 28) {
        return { description: desc, amount, dayOfMonth: day };
      }
    }
  }

  // Pattern 2: description __KW__ day amount
  m = /^(.+?)\s+__KW__\s+(\d{1,2})\s+(\d+)\s*$/.exec(normalised);
  if (m) {
    const [, rawDesc, rawDay, rawAmt] = m;
    if (rawDesc && rawDay && rawAmt) {
      const desc = rawDesc.trim();
      const day = parseInt(rawDay, 10);
      const amount = parseInt(rawAmt, 10);
      if (desc && day >= 1 && day <= 28 && amount > 0) {
        return { description: desc, amount, dayOfMonth: day };
      }
    }
  }

  // Pattern 3: __KW__ day description amount
  m = /^__KW__\s+(\d{1,2})\s+(.+?)\s+(\d+)\s*$/.exec(normalised);
  if (m) {
    const [, rawDay, rawDesc, rawAmt] = m;
    if (rawDay && rawDesc && rawAmt) {
      const day = parseInt(rawDay, 10);
      const desc = rawDesc.trim();
      const amount = parseInt(rawAmt, 10);
      if (day >= 1 && day <= 28 && desc && amount > 0) {
        return { description: desc, amount, dayOfMonth: day };
      }
    }
  }

  return null;
}

/**
 * Returns true if the text is a "list my recurring expenses" command.
 */
export function matchRecurringListCommand(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!?,;]+$/, '');
  return (
    t === 'регулярные' ||
    t === 'мои регулярные' ||
    t === 'регулярные расходы' ||
    t === 'мои регулярные расходы' ||
    t === 'регулярки' ||
    t === 'мои регулярки'
  );
}
