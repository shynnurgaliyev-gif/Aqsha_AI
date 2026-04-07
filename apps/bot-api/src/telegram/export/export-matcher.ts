const EXPORT_TOKENS = new Set([
  'экспорт', 'export',
  'скачать историю', 'скачать данные', 'скачать csv',
  'выгрузить', 'выгрузить историю', 'выгрузить данные', 'выгрузка',
  'выгрузи csv', 'выгрузи историю',
  'скачать транзакции', 'история csv', 'экспорт csv', 'csv',
]);

export function matchExportCommand(text: string): boolean {
  return EXPORT_TOKENS.has(text.toLowerCase().trim().replace(/[.!?,;]+$/, ''));
}

/** Keyboard shown after user types the export command. */
export const EXPORT_PERIOD_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '📅 Текущий месяц',   callback_data: 'export:current_month'  },
      { text: '📅 Прошлый месяц',   callback_data: 'export:previous_month' },
    ],
    [
      { text: '📆 Последние 3 мес', callback_data: 'export:3_months'       },
      { text: '📂 Всё время',       callback_data: 'export:all'            },
    ],
  ],
};

export type ExportPeriod = 'current_month' | 'previous_month' | '3_months' | 'all';

export function parseExportCallback(data: string): ExportPeriod | null {
  if (!data.startsWith('export:')) return null;
  const period = data.slice('export:'.length);
  if (
    period === 'current_month' ||
    period === 'previous_month' ||
    period === '3_months' ||
    period === 'all'
  ) {
    return period;
  }
  return null;
}
