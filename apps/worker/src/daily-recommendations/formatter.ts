import type { BudgetSignal } from './calculator';
import type { TopExpenseCategoryRow } from './repository';

function fmt(amount: number): string {
  return amount.toLocaleString('ru-RU') + ' ₸';
}

export interface RecommendationParams {
  balance: number;
  monthExpenses: number;
  monthIncome: number;
  safeDailySpend: number;
  daysRemaining: number;
  budgetSignals?: BudgetSignal[];
  topExpenseCategories?: TopExpenseCategoryRow[];
}

/**
 * Formats a personalized daily recommendation message.
 *
 * Structure:
 *   Доброе утро! ☀️
 *   До конца месяца у вас осталось X ₸.
 *   Это около X ₸ в день.
 *   [category insight — over-budget / near-limit / top spender]
 */
export function formatRecommendationMessage(params: RecommendationParams): string {
  const lines: string[] = [];

  lines.push('Доброе утро! ☀️');
  lines.push('');

  // ── Balance / daily spend ─────────────────────────────────────────────────
  if (params.balance <= 0) {
    lines.push('Баланс на нуле или в минусе. Постарайтесь не тратить лишнего.');
  } else {
    lines.push(`До конца месяца у вас осталось ${fmt(params.balance)}.`);
    lines.push(`Это около ${fmt(params.safeDailySpend)} в день.`);
  }

  // ── Category insight ──────────────────────────────────────────────────────
  const signals = params.budgetSignals ?? [];
  const overBudget = signals.filter((s) => s.kind === 'over_budget');
  const nearLimit  = signals.filter((s) => s.kind === 'near_limit');
  const top        = params.topExpenseCategories ?? [];

  if (overBudget.length > 0) {
    // Sort by overrun amount (most over first)
    const worst = overBudget.sort((a, b) => a.remaining - b.remaining)[0]!;
    lines.push('');
    lines.push(`Основной перерасход — в категории «${worst.categoryName}».`);
    lines.push('Если немного снизить эту категорию, будет легче удержаться в лимите.');
  } else if (nearLimit.length > 0) {
    const closest = nearLimit.sort((a, b) => a.remaining - b.remaining)[0]!;
    lines.push('');
    lines.push(`Категория «${closest.categoryName}» приближается к лимиту — осталось ${fmt(closest.remaining)}.`);
    lines.push('Стоит немного притормозить в этой категории.');
  } else if (top.length > 0) {
    const biggest = top[0]!;
    lines.push('');
    lines.push(`Больше всего в этом месяце потрачено на «${biggest.categoryName}» — ${fmt(biggest.total)}.`);
  }

  return lines.join('\n');
}
