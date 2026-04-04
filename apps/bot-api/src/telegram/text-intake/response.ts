import type { PendingTransactionDraft } from './session-draft';

/**
 * Result boundary returned by the text intake handler.
 *
 * The webhook layer uses this to decide what to send back to the user.
 * Keeping this as a typed discriminated union makes future Telegram
 * reply integration straightforward — each kind maps to a message template.
 */
export type IntakeResult =
  | { kind: 'confirmation_prompt'; message: string; draft: PendingTransactionDraft }
  | { kind: 'transaction_saved'; message: string; savedCategoryId: string; savedKind: 'expense' | 'income' }
  | { kind: 'cancelled'; message: string }
  | { kind: 'category_not_found'; message: string; candidate: string }
  | { kind: 'unsupported'; message: string };
