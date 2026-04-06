import type { ParsedIntake } from './parser';
import { parseIntakeText } from './parser';

/**
 * Tries to parse a single line as "Category Amount" (expense by default).
 * Examples: "Еда 500", "Транспорт 1200", "кафе 350"
 *
 * This is the implicit format — no kind prefix, amount at the end.
 * All items parsed this way default to 'expense'.
 */
function parseImplicitExpense(line: string): ParsedIntake | null {
  const trimmed = line.trim();
  const match = /^(.+?)\s+(\d+)$/.exec(trimmed);
  if (!match || !match[1] || !match[2]) return null;

  const categoryCandidate = match[1].trim().toLowerCase();
  const amount = parseInt(match[2], 10);

  if (!categoryCandidate || !Number.isFinite(amount) || amount <= 0) return null;

  return { kind: 'expense', amount, categoryCandidate, rawText: trimmed };
}

/**
 * Splits a message into individual lines by comma or newline.
 * Filters out empty parts.
 */
function splitBulkInput(text: string): string[] {
  return text
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parses a bulk transaction message into individual ParsedIntake items.
 *
 * Each line is tried against:
 *   1. Explicit format: "расход 500 еда" / "доход 200000 зарплата"
 *   2. Implicit expense format: "Еда 500" / "транспорт 1200"
 *
 * Returns an array of successfully parsed items if 2 or more are found.
 * Returns null if fewer than 2 items could be parsed (not a bulk message).
 */
export function parseBulkInput(text: string): ParsedIntake[] | null {
  const lines = splitBulkInput(text);
  if (lines.length < 2) return null;

  const parsed: ParsedIntake[] = [];

  for (const line of lines) {
    const explicit = parseIntakeText(line);
    if (explicit) {
      parsed.push(explicit);
      continue;
    }
    const implicit = parseImplicitExpense(line);
    if (implicit) {
      parsed.push(implicit);
    }
  }

  return parsed.length >= 2 ? parsed : null;
}
