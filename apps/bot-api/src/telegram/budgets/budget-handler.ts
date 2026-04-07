import type { FastifyBaseLogger } from 'fastify';
import type { DbPool } from '@aqsha-ai/database';
import { matchBudgetCommand } from './budget-command-matcher';
import { upsertMonthlyBudget, getBudgetStatus, getAllBudgetStatuses, deleteMonthlyBudget } from './budget-repository';
import {
  formatBudgetSet,
  formatBudgetStatus,
  formatAllBudgetStatuses,
  formatBudgetDeleted,
  BUDGET_CATEGORY_NOT_FOUND,
  BUDGET_NOT_FOUND,
  BUDGET_DELETE_NOT_FOUND,
} from './budget-formatter';
import { resolveCategory, normalizeCategoryCandidate } from '../text-intake/category-resolver';

/**
 * Handles monthly budget commands.
 *
 * Returns a response string if the text matched a budget command, or null
 * to pass through to the next handler (correction / text intake).
 *
 * Supported commands:
 *   set_budget   — "лимит еда 50000" / "бюджет еда 50000" / "set budget food 50000"
 *   show_budget  — "лимит еда" / "бюджет еда" / "budget food"
 *   list_budgets — "мои лимиты" / "бюджеты" / "my budgets" / "budgets"
 *
 * Category resolution:
 *   - Only expense categories are accepted (kind = 'expense')
 *   - User-owned categories take priority over system categories
 *   - Unknown category → BUDGET_CATEGORY_NOT_FOUND message
 *
 * set_budget is a direct upsert — no confirmation flow.
 * Budget configuration is not financial truth; it can be changed at any time.
 */
export async function handleBudgetCommand(
  text: string,
  userId: string,
  db: DbPool,
  logger: FastifyBaseLogger,
): Promise<string | null> {
  const command = matchBudgetCommand(text);
  if (!command) return null;

  // ── list_budgets ────────────────────────────────────────────────────────────
  if (command.type === 'list_budgets') {
    const rows = await getAllBudgetStatuses(db, userId);
    logger.info({ userId, count: rows.length }, 'Budget list requested');
    return formatAllBudgetStatuses(rows);
  }

  // ── show_budget ─────────────────────────────────────────────────────────────
  if (command.type === 'show_budget') {
    const category = await resolveCategory(db, userId, 'expense', normalizeCategoryCandidate(command.categoryCandidate));

    if (!category) {
      logger.info({ userId, candidate: command.categoryCandidate }, 'Budget show: expense category not found');
      return BUDGET_CATEGORY_NOT_FOUND;
    }

    const status = await getBudgetStatus(db, userId, category.id);

    if (!status) {
      logger.info({ userId, categoryId: category.id }, 'Budget show: no budget set for this month');
      return BUDGET_NOT_FOUND;
    }

    logger.info({ userId, categoryId: category.id }, 'Budget status shown');
    return formatBudgetStatus(status);
  }

  // ── delete_budget ────────────────────────────────────────────────────────────
  if (command.type === 'delete_budget') {
    const category = await resolveCategory(db, userId, 'expense', normalizeCategoryCandidate(command.categoryCandidate));

    if (!category) {
      logger.info({ userId, candidate: command.categoryCandidate }, 'Budget delete: expense category not found');
      return BUDGET_CATEGORY_NOT_FOUND;
    }

    const deleted = await deleteMonthlyBudget(db, userId, category.id);

    if (!deleted) {
      logger.info({ userId, categoryId: category.id }, 'Budget delete: no budget found for this month');
      return BUDGET_DELETE_NOT_FOUND;
    }

    logger.info({ userId, categoryId: category.id }, 'Budget deleted');
    return formatBudgetDeleted(category.name, new Date().toISOString().slice(0, 7));
  }

  // ── set_budget ──────────────────────────────────────────────────────────────
  if (command.type === 'set_budget') {
    const category = await resolveCategory(db, userId, 'expense', normalizeCategoryCandidate(command.categoryCandidate));

    if (!category) {
      logger.info({ userId, candidate: command.categoryCandidate }, 'Budget set: expense category not found');
      return BUDGET_CATEGORY_NOT_FOUND;
    }

    const yearMonth = await upsertMonthlyBudget(db, userId, category.id, command.amount);

    logger.info({ userId, categoryId: category.id, amount: command.amount, yearMonth }, 'Budget set');
    return formatBudgetSet(category.name, command.amount, yearMonth);
  }

  return null;
}
