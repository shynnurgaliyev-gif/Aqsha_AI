export interface CreateGoalCommand        { type: 'create';           name: string; targetAmount: number; }
export interface CreateGoalNoAmountCommand { type: 'create_no_amount'; name: string; }
export interface AddSavingsCommand        { type: 'add_savings';       nameQuery: string; amount: number; }
export interface ListGoalsCommand         { type: 'list'; }
export interface ShowGoalCommand          { type: 'show';              nameQuery: string; }
export interface DeleteGoalCommand        { type: 'delete';            nameQuery: string; }

export type GoalCommand =
  | CreateGoalCommand
  | CreateGoalNoAmountCommand
  | AddSavingsCommand
  | ListGoalsCommand
  | ShowGoalCommand
  | DeleteGoalCommand;

const LIST_TOKENS = new Set([
  'цели', 'мои цели', 'копилки', 'мои копилки', 'goals', 'my goals',
]);

// "коплю на iPhone 500000" | "цель iPhone 500000" | "создай цель iPhone 500000"
const CREATE_PATTERNS: RegExp[] = [
  /^коплю\s+на\s+(.+)\s+(\d+)$/,
  /^накопить\s+на\s+(.+)\s+(\d+)$/,
  /^хочу\s+накопить\s+на\s+(.+)\s+(\d+)$/,
  /^создай\s+(?:цель|копилку)\s+(.+)\s+(\d+)$/,
  /^создать\s+(?:цель|копилку)\s+(.+)\s+(\d+)$/,
  /^новая\s+(?:цель|копилка)\s+(.+)\s+(\d+)$/,
  /^(?:цель|копилка)\s+(.+)\s+(\d+)$/,
];

// "отложил на iPhone 50000" | "пополнил iPhone 50000" | "добавить в цель iPhone 50000"
const ADD_PATTERNS: RegExp[] = [
  /^отложил\s+(?:на\s+)?(.+)\s+(\d+)$/,
  /^отложить\s+(?:на\s+)?(.+)\s+(\d+)$/,
  /^откладываю\s+(?:на\s+)?(.+)\s+(\d+)$/,
  /^пополнил\s+(?:цель\s+|копилку\s+)?(.+)\s+(\d+)$/,
  /^пополнить\s+(?:цель\s+|копилку\s+)?(.+)\s+(\d+)$/,
  /^закинуть\s+(?:в\s+)?(?:цель\s+|копилку\s+)?(.+)\s+(\d+)$/,
  /^закинул\s+(?:в\s+)?(?:цель\s+|копилку\s+)?(.+)\s+(\d+)$/,
  /^добавил\s+(?:к\s+|в\s+)?(?:цели?\s+|копилку\s+)?(.+)\s+(\d+)$/,
  /^добавить\s+(?:к\s+|в\s+)?(?:цели?\s+|копилку\s+)?(.+)\s+(\d+)$/,
  /^добавь\s+(?:к\s+|в\s+)?(?:цели?\s+|копилку\s+)?(.+)\s+(\d+)$/,
];

// "удали цель iPhone"
const DELETE_PATTERNS: RegExp[] = [
  /^удали\s+(?:цель|копилку)\s+(.+)$/,
  /^удалить\s+(?:цель|копилку)\s+(.+)$/,
  /^убери\s+(?:цель|копилку)\s+(.+)$/,
];

// "цель iPhone" (no trailing number — show only)
const SHOW_PATTERNS: RegExp[] = [
  /^(?:цель|копилка|прогресс)\s+(.+)$/,
];

export function matchGoalCommand(text: string): GoalCommand | null {
  const t = text.toLowerCase().trim().replace(/[.!?,;]+$/, '');

  if (LIST_TOKENS.has(t)) return { type: 'list' };

  for (const p of CREATE_PATTERNS) {
    const m = t.match(p);
    if (m && m[1] && m[2]) {
      const amount = parseInt(m[2], 10);
      if (amount > 0) return { type: 'create', name: m[1].trim(), targetAmount: amount };
    }
  }

  for (const p of ADD_PATTERNS) {
    const m = t.match(p);
    if (m && m[1] && m[2]) {
      const amount = parseInt(m[2], 10);
      if (amount > 0) return { type: 'add_savings', nameQuery: m[1].trim(), amount };
    }
  }

  for (const p of DELETE_PATTERNS) {
    const m = t.match(p);
    if (m && m[1]) return { type: 'delete', nameQuery: m[1].trim() };
  }

  // "создать цель Отпуск" / "создай цель Отпуск" (without amount — ask for it)
  const CREATE_NO_AMOUNT_PATTERNS: RegExp[] = [
    /^(?:создать|создай|новая)\s+(?:цель|копилку)\s+(.+)$/,
    /^коплю\s+на\s+(.+)$/,
    /^накопить\s+на\s+(.+)$/,
    /^хочу\s+накопить\s+(?:на\s+)?(.+)$/,
  ];
  for (const p of CREATE_NO_AMOUNT_PATTERNS) {
    const m = t.match(p);
    if (m && m[1] && !/\d+$/.test(m[1].trim())) {
      return { type: 'create_no_amount', name: m[1].trim() };
    }
  }

  for (const p of SHOW_PATTERNS) {
    const m = t.match(p);
    if (m && m[1] && !/\d+$/.test(m[1].trim())) {
      return { type: 'show', nameQuery: m[1].trim() };
    }
  }

  return null;
}
