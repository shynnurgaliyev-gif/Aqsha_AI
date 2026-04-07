import type { FastifyBaseLogger } from 'fastify';
import type { ParsedIntake } from './parser';

/**
 * System prompt focused exclusively on transaction extraction.
 * Instructs the model to return {"result": <transaction>} or {"result": null}.
 * Temperature 0 is used to maximise determinism.
 */
const SYSTEM_PROMPT = `You are a transaction parser for a personal finance app. Your only job is to extract transaction details from user messages written in Russian or English.

Return a JSON object with EXACTLY this shape:
{"result": {"kind": "expense" | "income", "amount": <positive integer>, "category": "<canonical category name>", "note": "<string or null>"}}

Return {"result": null} ONLY when:
- there is no amount (number) in the message at all
- the message is clearly a question, greeting, or command unrelated to money

Rules:
- kind: "expense" = money spent/paid; "income" = money received/earned/deposited
- Deposits, savings transfers, received money → always "income"
- amount must be a positive whole number; "2.5k" = 2500, "1к" = 1000
- category: pick the CLOSEST match from the canonical list below; if nothing fits use "Прочее"
- note: optional extra context; null if absent
- NEVER return null just because the category is unclear — use "Прочее" as fallback

Available expense categories (use EXACT spelling):
Продукты, Еда, Кафе, Транспорт, Такси, Бензин, Коммуналка, Аренда, Связь, Одежда, Здоровье, Кофе, Развлечения, Образование, Спорт, Красота, Путешествия, Ремонт, Питомец, Прочее

Available income categories (use EXACT spelling):
Зарплата, Подработка, Продажа, Возврат, Подарок, Проценты, Аренда, Бизнес, Прочее

Mapping hints — map user words to canonical names:
Expense:
- машина, автомобиль, авто, метро, автобус, маршрутка, проезд, парковка → Транспорт
- такси, каршеринг, убер, uber, яндекс такси → Такси
- бензин, горючее, топливо, заправка, газ (авто) → Бензин
- продукты, магазин, покупки, супермаркет, гипермаркет, рынок, базар → Продукты
- кафе, ресторан, обед, ужин, завтрак, перекус, столовая, шаурма, пицца, суши, фастфуд → Кафе
- кофе, кофейня, капучино, латте, американо → Кофе
- еда (без уточнения) → Еда
- коммунальные, свет, вода, газ (ком.), квартплата, жкх → Коммуналка
- аренда, съём, квартира, жильё, rent → Аренда
- телефон, интернет, мобильный, сотовый, sim, связь, роуминг → Связь
- аптека, врач, лечение, лекарства, таблетки, больница, клиника → Здоровье
- кино, кинотеатр, игры, подписка, spotify, netflix, концерт, театр → Развлечения
- курсы, книги, обучение, учеба, университет, школа, репетитор → Образование
- одежда, обувь, куртка, штаны, рубашка, платье → Одежда
- спортзал, зал, тренажёр, фитнес, бассейн, спорт → Спорт
- салон, парикмахер, стрижка, маникюр, педикюр, косметика, красота → Красота
- отель, гостиница, перелёт, авиа, билет, тур, отдых, путешествие → Путешествия
- ремонт, стройка, материалы, инструмент, мебель, техника → Ремонт
- кот, собака, корм, ветеринар, питомец, зоомагазин → Питомец

Income:
- зп, зарплата, оклад, аванс, получил зарплату → Зарплата
- фриланс, халтура, проект, заказ, клиент → Подработка
- продал, продажа, сдал, реализовал → Продажа
- вернули, возврат, вернул, долг вернули → Возврат
- подарок, подарили, в подарок, на день рождения → Подарок
- проценты, дивиденды, вклад, депозит, накопления → Проценты
- аренда сдал, сдаю квартиру, арендная плата → Аренда
- бизнес, выручка, прибыль, доход с бизнеса → Бизнес
- перевод, поступление, получил, пришло → Прочее`;

interface AiChatRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  response_format: { type: 'json_object' };
  temperature: number;
  max_tokens: number;
}

interface AiChatResponse {
  choices: Array<{
    message: { content: string | null };
  }>;
}

/**
 * Validates the raw JSON value returned by the model.
 * Returns a ParsedIntake if the result contains a valid transaction,
 * or null if the model indicated no transaction or output is malformed.
 */
function validateAiResult(raw: unknown, originalText: string): ParsedIntake | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const outer = raw as Record<string, unknown>;
  const result = outer['result'];

  // Explicit null means "not a transaction" — valid response, not an error.
  if (result === null || result === undefined) return null;

  if (typeof result !== 'object' || Array.isArray(result)) return null;
  const r = result as Record<string, unknown>;

  // kind
  const kind = r['kind'];
  if (kind !== 'expense' && kind !== 'income') return null;

  // amount — must be a number; floor to integer; must be positive
  const rawAmount = r['amount'];
  if (typeof rawAmount !== 'number' || !Number.isFinite(rawAmount)) return null;
  const amount = Math.floor(rawAmount);
  if (amount <= 0) return null;

  // category — must be a non-empty string
  const category = r['category'];
  if (typeof category !== 'string' || !category.trim()) return null;

  return {
    kind: kind as 'expense' | 'income',
    amount,
    categoryCandidate: category.trim().toLowerCase(),
    rawText: originalText,
  };
}

/**
 * Attempts to parse a natural-language transaction message using the
 * OpenAI Chat Completions API.
 *
 * Returns a ParsedIntake if the model extracts a clear transaction, or null if:
 *   - the message is not recognisable as a transaction
 *   - model output is invalid or ambiguous
 *   - any network / API error occurs
 *
 * All errors are logged and suppressed — the caller falls back to a safe
 * "unsupported" response. No DB writes happen here.
 */
export async function parseWithAi(
  text: string,
  apiKey: string,
  model: string,
  logger: FastifyBaseLogger,
): Promise<ParsedIntake | null> {
  const requestBody: AiChatRequest = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 150,
  };

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    logger.error({ err }, 'AI parser: network error');
    return null;
  }

  if (!response.ok) {
    logger.warn({ status: response.status }, 'AI parser: HTTP error from OpenAI');
    return null;
  }

  let data: AiChatResponse;
  try {
    data = (await response.json()) as AiChatResponse;
  } catch (err) {
    logger.error({ err }, 'AI parser: failed to parse OpenAI response JSON');
    return null;
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    logger.warn('AI parser: empty content in OpenAI response');
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    logger.warn({ content }, 'AI parser: model returned non-JSON content');
    return null;
  }

  const result = validateAiResult(parsed, text);

  if (result) {
    logger.info({ kind: result.kind, amount: result.amount, category: result.categoryCandidate }, 'AI parser: transaction extracted');
  } else {
    logger.info({ content }, 'AI parser: no valid transaction in model response');
  }

  return result;
}
