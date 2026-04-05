import type { RecurringExpense } from './recurring-repository';

function fmt(amount: number): string {
  return amount.toLocaleString('ru-RU') + ' ₸';
}

function dayLabel(day: number): string {
  return `${day}-го числа`;
}

export function formatRecurringCreated(r: RecurringExpense): string {
  return (
    `✅ Регулярный расход добавлен!\n\n` +
    `📋 ${r.description} — ${fmt(r.amount)}\n` +
    `📁 Категория: ${r.categoryName}\n` +
    `📅 Напоминаю: ${dayLabel(r.dayOfMonth)} каждого месяца\n\n` +
    `Напишу тебе в нужный день — ты только подтвердишь.`
  );
}

export function formatRecurringList(items: RecurringExpense[]): string {
  if (items.length === 0) {
    return (
      'У тебя пока нет регулярных расходов.\n\n' +
      'Чтобы добавить — напиши например: «аренда 150000 каждый месяц»'
    );
  }

  const lines: string[] = ['📋 Твои регулярные расходы:\n'];
  for (const r of items) {
    lines.push(`• ${r.description} — ${fmt(r.amount)} (${dayLabel(r.dayOfMonth)}, ${r.categoryName})`);
  }
  lines.push('');
  lines.push('Чтобы удалить — напиши: «удали регулярный аренда»');
  return lines.join('\n');
}

export function formatRecurringDeleted(description: string): string {
  return `🗑 Регулярный расход «${description}» удалён.`;
}

export const RECURRING_NOT_FOUND = 'Регулярный расход не найден. Напиши «мои подписки» чтобы увидеть список.';

export function formatRecurringReminderMessage(r: RecurringExpense): string {
  return (
    `🔔 Напоминание о регулярном расходе:\n\n` +
    `📋 ${r.description} — ${fmt(r.amount)}\n` +
    `📁 Категория: ${r.categoryName}\n\n` +
    `Записать расход за этот месяц?`
  );
}

export function formatRecurringConfirmed(r: RecurringExpense): string {
  return `✅ Записано: ${r.description} — ${fmt(r.amount)}`;
}

