import type { InlineKeyboardMarkup } from '../telegram-client';

export interface RecurringDisplayRow {
  id: string;
  description: string;
  categoryName: string;
  amount: number;
  dayOfMonth: number;
  reminderHour: number;
}

const REMINDER_HOURS = [8, 9, 10, 11, 14, 18] as const;

export const TIME_KEYBOARD: InlineKeyboardMarkup = {
  inline_keyboard: [
    REMINDER_HOURS.map((h) => ({
      text: `${h}ч`,
      callback_data: `rec_time:${h}`,
    })),
  ],
};

function formatAmount(amount: number): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + ' ₸';
}

function dayLabel(day: number): string {
  return `${day}-го числа`;
}

export function formatTimePrompt(description: string, amount: number, day: number): string {
  return (
    `💸 Регулярный расход: ${description} — ${formatAmount(amount)}\n` +
    `📅 Каждый месяц ${dayLabel(day)}\n\n` +
    `В какое время напоминать?`
  );
}

export function formatRecurringCreated(rec: RecurringDisplayRow): string {
  return (
    `✅ Регулярный расход добавлен!\n\n` +
    `💸 ${rec.description} — ${formatAmount(rec.amount)}\n` +
    `📅 Каждый месяц ${dayLabel(rec.dayOfMonth)}\n` +
    `⏰ Напоминание в ${rec.reminderHour}:00`
  );
}

export function formatRecurringList(rows: RecurringDisplayRow[]): string {
  if (rows.length === 0) {
    return 'У вас нет регулярных расходов.';
  }
  const lines = rows.map(
    (r, i) =>
      `${i + 1}. 💸 ${r.description} — ${formatAmount(r.amount)}\n` +
      `   📅 ${dayLabel(r.dayOfMonth)}, ⏰ ${r.reminderHour}:00`,
  );
  return `📋 Регулярные расходы:\n\n${lines.join('\n\n')}`;
}
