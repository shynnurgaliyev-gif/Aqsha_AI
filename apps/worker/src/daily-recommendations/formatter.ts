import type { BudgetSignal } from './calculator';

function formatAmount(amount: number): string {
  return amount.toLocaleString('ru-RU') + ' ₸';
}

export interface RecommendationParams {
  balance: number;
  monthExpenses: number;
  monthIncome: number;
  safeDailySpend: number;
  daysRemaining: number;
  budgetSignals?: BudgetSignal[];
}

/**
 * Formats a compact plain-text daily recommendation message.
 * Appends budget warnings for near-limit and over-budget categories when present.
 */
export function formatRecommendationMessage(params: RecommendationParams): string {
  const balanceSign = params.balance >= 0 ? '+' : '';
  const lines = [
    'Ваш ежедневный отчёт:',
    `Баланс: ${balanceSign}${formatAmount(params.balance)}`,
    `Расходы за месяц: ${formatAmount(params.monthExpenses)}`,
    `Доходы за месяц: ${formatAmount(params.monthIncome)}`,
    `Рекомендуемый дневной расход: ${formatAmount(params.safeDailySpend)} (осталось дней: ${params.daysRemaining})`,
  ];

  const warnings = (params.budgetSignals ?? []).filter(
    (s) => s.kind === 'near_limit' || s.kind === 'over_budget',
  );

  if (warnings.length > 0) {
    lines.push('');
    lines.push('Лимиты:');
    for (const w of warnings) {
      if (w.kind === 'over_budget') {
        lines.push(`Перерасход: ${w.categoryName} (-${formatAmount(Math.abs(w.remaining))})`);
      } else {
        lines.push(`Близко к лимиту: ${w.categoryName} (остаток ${formatAmount(w.remaining)})`);
      }
    }
  }

  return lines.join('\n');
}
