import type { SavingsGoal } from './goal-repository';

function fmt(amount: number): string {
  return amount.toLocaleString('ru-RU') + ' ₸';
}

function progressBar(savedAmount: number, targetAmount: number, width = 10): string {
  const pct = targetAmount > 0 ? Math.min(savedAmount / targetAmount, 1) : 0;
  const filled = Math.round(pct * width);
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}

export function formatGoalProgress(goal: SavingsGoal): string {
  if (goal.isCompleted) {
    return (
      `✅ Цель «${goal.name}» достигнута!\n` +
      `💰 Накоплено: ${fmt(goal.savedAmount)}\n` +
      `Поздравляю — ты справился! 🎉`
    );
  }

  const pct = goal.targetAmount > 0 ? Math.round((goal.savedAmount / goal.targetAmount) * 100) : 0;
  const remaining = goal.targetAmount - goal.savedAmount;
  const bar = progressBar(goal.savedAmount, goal.targetAmount);

  return (
    `🎯 ${goal.name}\n` +
    `${bar} ${pct}%\n` +
    `💰 Накоплено: ${fmt(goal.savedAmount)} из ${fmt(goal.targetAmount)}\n` +
    `🏁 Осталось: ${fmt(remaining)}`
  );
}

export function formatGoalCreated(goal: SavingsGoal): string {
  return (
    `✅ Цель создана!\n\n` +
    formatGoalProgress(goal) +
    `\n\nЧтобы пополнить — напиши: «отложил на ${goal.name} 10000»`
  );
}

export function formatSavingsAdded(goal: SavingsGoal, added: number): string {
  if (goal.isCompleted) {
    return (
      `🎉 Ты достиг цели «${goal.name}»!\n` +
      `+${fmt(added)} — и копилка полная!\n\n` +
      formatGoalProgress(goal)
    );
  }
  return (
    `💰 +${fmt(added)} в копилку «${goal.name}»!\n\n` +
    formatGoalProgress(goal)
  );
}

export function formatGoalList(goals: SavingsGoal[]): string {
  if (goals.length === 0) {
    return 'У тебя пока нет целей.\n\nСоздай первую: «коплю на iPhone 500000»';
  }

  const active = goals.filter((g) => !g.isCompleted);
  const done   = goals.filter((g) => g.isCompleted);

  const lines: string[] = ['🎯 Твои цели:\n'];

  for (const g of active) {
    const pct = Math.round((g.savedAmount / g.targetAmount) * 100);
    const bar = progressBar(g.savedAmount, g.targetAmount, 8);
    lines.push(`${bar} ${g.name} — ${pct}% (${fmt(g.savedAmount)} из ${fmt(g.targetAmount)})`);
  }

  if (done.length > 0) {
    lines.push('');
    lines.push('✅ Достигнуто:');
    for (const g of done) {
      lines.push(`• ${g.name} — ${fmt(g.savedAmount)}`);
    }
  }

  return lines.join('\n');
}

export function formatGoalDeleted(name: string): string {
  return `🗑 Цель «${name}» удалена.`;
}

export const GOAL_NOT_FOUND      = 'Цель не найдена. Проверь название или напиши «цели» чтобы увидеть список.';
export const GOAL_ALREADY_EXISTS = 'Цель с таким названием уже существует. Напиши «цели» чтобы увидеть список.';
