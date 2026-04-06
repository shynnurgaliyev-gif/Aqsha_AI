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
 * Splits a message into individual transaction strings.
 *
 * Strategy 1: comma or newline delimiter — "Еда 300, транспорт 400"
 * Strategy 2: space-separated "Cat Amount Cat Amount" pattern —
 *             "Еда 300 машина 400" → ["Еда 300", "машина 400"]
 *
 * Strategy 2 is tried only when strategy 1 produces fewer than 2 parts.
 * It works by repeatedly matching the pattern (letters) (digits) from left to right.
 */
function splitBulkInput(text: string): string[] {
  // Strategy 1: explicit delimiter (comma, newline, or Whisper sentence-ending period)
  // Each part is stripped of trailing punctuation Whisper may have added.
  const byDelimiter = text
    .split(/[,\n]|\.(?=\s|$)/)
    .map((s) => s.trim().replace(/[.!?,;]+$/, ''))
    .filter((s) => s.length > 0);

  if (byDelimiter.length >= 2) return byDelimiter;

  // Strategy 2: extract "word(s) number" pairs from a single space-separated line.
  // Regex matches a run of letters/spaces (non-greedy, stops before a digit run).
  // Example: "Еда 300 машина 400" → ["Еда 300", "машина 400"]
  const pairs: string[] = [];
  const re = /([a-zа-яёA-ZА-ЯЁ][a-zа-яёA-ZА-ЯЁ]*(?:\s+[a-zа-яёA-ZА-ЯЁ][a-zа-яёA-ZА-ЯЁ]*)*)\s+(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    pairs.push(`${match[1]!.trim()} ${match[2]}`);
  }

  return pairs.length >= 2 ? pairs : byDelimiter;
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
    const cleanLine = line.replace(/[.!?,;]+$/, '');
    const explicit = parseIntakeText(cleanLine);
    if (explicit) {
      parsed.push(explicit);
      continue;
    }
    const implicit = parseImplicitExpense(cleanLine);
    if (implicit) {
      parsed.push(implicit);
    }
  }

  return parsed.length >= 2 ? parsed : null;
}
