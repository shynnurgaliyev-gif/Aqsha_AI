function formatAmount(amount: number): string {
  return amount.toLocaleString('ru-RU') + ' ₸';
}

export interface RecommendationParams {
  balance: number;
  monthExpenses: number;
  monthIncome: number;
  safeDailySpend: number;
  daysRemaining: number;
}

/**
 * Formats a compact plain-text daily recommendation message.
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
  return lines.join('\n');
}
