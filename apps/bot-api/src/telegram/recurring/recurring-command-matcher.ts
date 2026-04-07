export interface RecurringDraft {
  description: string;
  amount: number;
  dayOfMonth: number;
}

/**
 * Parses a recurring expense creation command.
 *
 * Supported patterns (case-insensitive):
 *   "аренда 120000 каждый месяц 5"
 *   "аренда каждый месяц 5 120000"
 *   "каждый месяц 5 аренда 120000"
 *
 * Returns null if the text does not match any pattern.
 */
export function matchRecurringCreateCommand(text: string): RecurringDraft | null {
  const t = text.trim();

  if (!/каждый\s+месяц/i.test(t)) return null;

  // Pattern 1: description amount каждый месяц day
  let m = /^(.+?)\s+(\d+)\s+каждый\s+месяц\s+(\d{1,2})\s*$/i.exec(t);
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

  // Pattern 2: description каждый месяц day amount
  m = /^(.+?)\s+каждый\s+месяц\s+(\d{1,2})\s+(\d+)\s*$/i.exec(t);
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

  // Pattern 3: каждый месяц day description amount
  m = /^каждый\s+месяц\s+(\d{1,2})\s+(.+?)\s+(\d+)\s*$/i.exec(t);
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
