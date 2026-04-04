import type { FastifyBaseLogger } from 'fastify';
import type { ParsedIntake } from './parser';

/**
 * System prompt focused exclusively on transaction extraction.
 * Instructs the model to return {"result": <transaction>} or {"result": null}.
 * Temperature 0 is used to maximise determinism.
 */
const SYSTEM_PROMPT = `You are a transaction parser for a personal finance app. Your only job is to extract transaction details from user messages.

Return a JSON object with EXACTLY this shape:
{"result": {"kind": "expense" | "income", "amount": <positive integer>, "category": "<canonical category name>", "note": "<string or null>"}}

Return {"result": null} when:
- the message is not a financial transaction
- the amount is missing, unclear, or fractional with no clear rounding
- the transaction kind (expense vs income) is ambiguous

Rules:
- kind: "expense" means money was spent; "income" means money was received
- amount must be a positive whole number; if user says "2.5k" interpret as 2500; if truly ambiguous, return null
- category: MUST be one of the canonical category names below — pick the closest match
- note: optional extra context the user mentioned; null if absent
- never invent amounts or categories
- if in doubt, return {"result": null}

Available expense categories (use exact spelling):
Продукты, Еда, Транспорт, Такси, Коммуналка, Связь, Одежда, Здоровье, Кофе, Развлечения, Образование, Прочее

Available income categories (use exact spelling):
Зарплата, Подработка, Продажа, Возврат, Подарок, Прочее

Mapping hints — map user words to canonical names:
- машина, авто, бензин, парковка, метро, автобус → Транспорт
- продукты, магазин, покупки, супермаркет, гипермаркет → Продукты
- кафе, ресторан, обед, ужин, завтрак, перекус → Еда
- кофе, кофейня, кофе-пауза → Кофе
- такси, каршеринг, убер → Такси
- коммунальные, свет, вода, газ, квартплата, жкх → Коммуналка
- телефон, интернет, мобильный, сотовый → Связь
- аптека, врач, лечение, лекарства → Здоровье
- кино, кинотеатр, игры, подписка, spotify, netflix → Развлечения
- курсы, книги, обучение, учеба, университет → Образование
- одежда, обувь, одежды → Одежда
- зп, оклад, получил зарплату → Зарплата
- фриланс, халтура, проект → Подработка
- продал, продажа, сдал → Продажа
- вернули, возврат, вернул → Возврат
- подарок, подарили, в подарок → Подарок`;

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
