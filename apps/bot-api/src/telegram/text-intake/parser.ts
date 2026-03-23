/**
 * Narrow deterministic parser for simple transaction intake text.
 *
 * Supported format: "<kind> <amount> <category>"
 *
 * Examples:
 *   "Расход 2500 Еда"
 *   "Доход 50000 Зарплата"
 *   "expense 2500 food"
 *   "income 50000 salary"
 *
 * Rules:
 *   - kind must be a recognized token (case-insensitive)
 *   - amount must be a positive integer with no decimal or extra characters
 *   - category is the remainder of the string after the first two tokens
 *   - returns null for anything that does not match exactly
 */

export type IntakeKind = 'expense' | 'income';

export interface ParsedIntake {
  kind: IntakeKind;
  amount: number;
  categoryCandidate: string;
  rawText: string;
}

const KIND_MAP: Record<string, IntakeKind> = {
  // Russian
  расход: 'expense',
  расходы: 'expense',
  трата: 'expense',
  траты: 'expense',
  доход: 'income',
  доходы: 'income',
  // English
  expense: 'expense',
  expenses: 'expense',
  exp: 'expense',
  income: 'income',
  inc: 'income',
};

export function parseIntakeText(text: string): ParsedIntake | null {
  const trimmed = text.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length < 3) return null;

  const kindToken = parts[0]?.toLowerCase() ?? '';
  const kind = KIND_MAP[kindToken];
  if (!kind) return null;

  const amountToken = parts[1] ?? '';
  // Reject any amount token that is not a pure positive integer string
  if (!/^\d+$/.test(amountToken)) return null;
  const amount = parseInt(amountToken, 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const categoryCandidate = parts.slice(2).join(' ').trim().toLowerCase();
  if (!categoryCandidate) return null;

  return { kind, amount, categoryCandidate, rawText: trimmed };
}
