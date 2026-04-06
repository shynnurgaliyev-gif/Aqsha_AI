export interface CreateRecurringCommand {
  type: 'create';
  description: string;
  amount: number;
  dayOfMonth: number; // 1–28
}

export interface ListRecurringCommand {
  type: 'list';
}

export interface DeleteRecurringCommand {
  type: 'delete';
  nameQuery: string;
}

export type RecurringCommand =
  | CreateRecurringCommand
  | ListRecurringCommand
  | DeleteRecurringCommand;

const LIST_TOKENS = new Set([
  'мои подписки',
  'подписки',
  'регулярные расходы',
  'мои регулярные расходы',
  'регулярные',
  'повторяющиеся расходы',
  'повторяющиеся',
  'ежемесячные расходы',
  'ежемесячные',
]);

// "аренда 150000 каждый месяц" | "аренда 150000 каждый месяц 5"
// "аренда каждый месяц 150000" | "аренда 150000 ежемесячно"
// "добавить регулярный расход аренда 150000" (defaults to day 1)
const CREATE_PATTERNS: RegExp[] = [
  /^(.+?)\s+(\d+)\s+каждый\s+месяц(?:\s+(\d{1,2}))?$/,
  /^(.+?)\s+каждый\s+месяц\s+(\d+)(?:\s+(\d{1,2}))?$/,
  /^(.+?)\s+(\d+)\s+ежемесячно(?:\s+(\d{1,2}))?$/,
  /^(.+?)\s+(\d+)\s+раз\s+в\s+месяц(?:\s+(\d{1,2}))?$/,
  /^(.+?)\s+(\d+)\s+в\s+месяц(?:\s+(\d{1,2}))?$/,
  /^каждый\s+месяц\s+(.+?)\s+(\d+)(?:\s+(\d{1,2}))?$/,
  /^ежемесячно\s+(.+?)\s+(\d+)(?:\s+(\d{1,2}))?$/,
  /^добавить\s+регулярный\s+(?:расход\s+)?(.+?)\s+(\d+)$/,
  /^добавь\s+регулярный\s+(?:расход\s+)?(.+?)\s+(\d+)$/,
  /^новый\s+регулярный\s+(?:расход\s+)?(.+?)\s+(\d+)$/,
];

// "удали регулярный аренда" | "удали повторяющийся Netflix" | "удали подписку Netflix"
const DELETE_PATTERNS: RegExp[] = [
  /^удали\s+(?:регулярный|повторяющийся|ежемесячный)\s+(?:расход\s+)?(.+)$/,
  /^удалить\s+(?:регулярный|повторяющийся|ежемесячный)\s+(?:расход\s+)?(.+)$/,
  /^отключить\s+(?:регулярный|повторяющийся|ежемесячный)\s+(?:расход\s+)?(.+)$/,
  /^убрать\s+(?:регулярный|повторяющийся|ежемесячный)\s+(?:расход\s+)?(.+)$/,
  /^удали\s+подписку\s+(.+)$/,
  /^удалить\s+подписку\s+(.+)$/,
  /^убери\s+(?:регулярный|повторяющийся|ежемесячный)\s+(?:расход\s+)?(.+)$/,
];

function clampDay(day: number): number {
  return Math.max(1, Math.min(28, day));
}

export function matchRecurringCommand(text: string): RecurringCommand | null {
  const t = text.toLowerCase().trim().replace(/[.!?,;]+$/, '');

  if (LIST_TOKENS.has(t)) return { type: 'list' };

  for (const p of CREATE_PATTERNS) {
    const m = t.match(p);
    if (m && m[1] && m[2]) {
      const amount = parseInt(m[2], 10);
      if (amount <= 0) continue;
      const dayRaw = m[3] ? parseInt(m[3], 10) : 1;
      return {
        type: 'create',
        description: m[1].trim(),
        amount,
        dayOfMonth: clampDay(dayRaw),
      };
    }
  }

  for (const p of DELETE_PATTERNS) {
    const m = t.match(p);
    if (m && m[1]) return { type: 'delete', nameQuery: m[1].trim() };
  }

  return null;
}
