import type { FastifyBaseLogger } from 'fastify';
import { fetchWithRetry } from '@aqsha-ai/shared';
import type { AnalyticsQuery, AnalyticsPeriod } from './query-matcher';

/**
 * System prompt focused exclusively on analytics intent extraction.
 * Instructs the model to return a structured JSON intent or {"result": null}.
 * Temperature 0 is used to maximise determinism.
 */
const SYSTEM_PROMPT = `You are an analytics intent parser for a personal finance app. Your only job is to extract what kind of financial data the user is asking for.

Return a JSON object with EXACTLY this shape:
{"result": {"query_type": "balance" | "expense_total" | "income_total" | "category_breakdown" | "recent_transactions", "period": "current_month" | "previous_month" | "current_week" | "today" | "yesterday" | null, "kind": "expense" | "income" | null, "category": "<string or null>"}}

Return {"result": null} when:
- the message is not a request for financial data or analytics
- the intent is ambiguous or unclear

Rules:
- query_type: what the user wants to know
  - "balance": current net balance / how much money is left
  - "expense_total": total amount spent overall (NO specific category mentioned)
  - "income_total": total amount received overall (NO specific category mentioned)
  - "category_breakdown": spending or income for a SPECIFIC category, or breakdown across all categories
  - "recent_transactions": list of recent transactions
- CRITICAL: if the user mentions a specific category (food, transport, rent, еда, транспорт, etc.) WITH a question or time-period intent, use "category_breakdown"
- CRITICAL: if the message is ONLY a category name + number (e.g. "Еда 100", "транспорт 500", "кафе 1500") → return {"result": null} — this is a transaction entry, NOT an analytics query
- Analytics queries always contain question words (сколько, как много, покажи) OR time-period words (за месяц, за неделю, сегодня, вчера, прошлый) OR explicit report words (расходы, доходы, итого, статистика)
- period: time frame the user is asking about; null if no specific period is mentioned
- kind: "expense" or "income" where relevant; for spending/потратил/расход → "expense"; for income/заработал/доход → "income"; null if unclear
- category: the specific category name the user mentions (e.g. "еда", "транспорт", "кафе"); null if no specific category

Examples of ANALYTICS queries (return result):
- "сколько потратил на еду" → {"query_type":"category_breakdown","period":null,"kind":"expense","category":"еда"}
- "расходы на транспорт за месяц" → {"query_type":"category_breakdown","period":"current_month","kind":"expense","category":"транспорт"}
- "еда за этот месяц" → {"query_type":"category_breakdown","period":"current_month","kind":"expense","category":"еда"}
- "транспорт за этот месяц" → {"query_type":"category_breakdown","period":"current_month","kind":"expense","category":"транспорт"}
- "сколько я потратил на транспорт" → {"query_type":"category_breakdown","period":null,"kind":"expense","category":"транспорт"}
- "общие расходы за месяц" → {"query_type":"expense_total","period":"current_month","kind":"expense","category":null}

Examples of NON-ANALYTICS (return null — these are transaction entries):
- "Еда 100" → {"result": null}
- "транспорт 500" → {"result": null}
- "кафе 1500" → {"result": null}
- "зарплата 200000" → {"result": null}
- if in doubt, return {"result": null}`;

type AiPeriod = AnalyticsPeriod | null;
type AiQueryType =
  | 'balance'
  | 'expense_total'
  | 'income_total'
  | 'category_breakdown'
  | 'recent_transactions';

interface AiAnalyticsResult {
  query_type: AiQueryType;
  period: AiPeriod;
  kind: 'expense' | 'income' | null;
  category: string | null;
}

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

const VALID_QUERY_TYPES = new Set<string>([
  'balance',
  'expense_total',
  'income_total',
  'category_breakdown',
  'recent_transactions',
]);

const VALID_PERIODS = new Set<string>([
  'current_month',
  'previous_month',
  'current_week',
  'today',
  'yesterday',
]);

/**
 * Maps a validated AI analytics result to an AnalyticsQuery.
 *
 * Returns null only if:
 * - category filter is requested (category-scoped queries not yet implemented)
 * - kind is ambiguous for category_breakdown
 *
 * All periods in VALID_PERIODS are now supported by the deterministic SQL layer,
 * so no period is rejected here. Null period defaults to current_month.
 */
function mapToAnalyticsQuery(result: AiAnalyticsResult): AnalyticsQuery | null {
  const { query_type, period: aiPeriod, kind, category } = result;

  // Null period defaults to current_month for all query types.
  const period: AnalyticsPeriod = aiPeriod ?? 'current_month';

  switch (query_type) {
    case 'balance':
      return { type: 'balance', period: 'current_month' }; // period irrelevant for balance

    case 'expense_total':
      return { type: 'expense_total', period };

    case 'income_total':
      return { type: 'income_total', period };

    case 'category_breakdown': {
      if (category !== null && kind !== null) {
        // Category-scoped query: "сколько потратил на еду за месяц"
        return { type: 'category_scoped', period, category, kind };
      }
      if (category !== null) return null; // kind ambiguous — cannot resolve safely
      if (kind === 'expense') return { type: 'expense_categories', period };
      if (kind === 'income') return { type: 'income_categories', period };
      return null; // ambiguous kind
    }

    case 'recent_transactions':
      return { type: 'recent_transactions', period: 'current_month' }; // period irrelevant

    default:
      return null;
  }
}

/**
 * Validates the raw JSON value returned by the model.
 * Returns an AiAnalyticsResult if all fields are well-formed, null otherwise.
 */
function validateAiAnalyticsResult(raw: unknown): AiAnalyticsResult | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const outer = raw as Record<string, unknown>;
  const result = outer['result'];

  if (result === null || result === undefined) return null;

  if (typeof result !== 'object' || Array.isArray(result)) return null;
  const r = result as Record<string, unknown>;

  // query_type — required, must be one of the supported values
  const query_type = r['query_type'];
  if (typeof query_type !== 'string' || !VALID_QUERY_TYPES.has(query_type)) return null;

  // period — optional; null means no specific period
  const rawPeriod = r['period'];
  let period: AiPeriod;
  if (rawPeriod === null || rawPeriod === undefined) {
    period = null;
  } else if (typeof rawPeriod === 'string' && VALID_PERIODS.has(rawPeriod)) {
    period = rawPeriod as AnalyticsPeriod;
  } else {
    return null;
  }

  // kind — optional; null if not applicable
  const rawKind = r['kind'];
  let kind: 'expense' | 'income' | null;
  if (rawKind === null || rawKind === undefined) {
    kind = null;
  } else if (rawKind === 'expense' || rawKind === 'income') {
    kind = rawKind;
  } else {
    return null;
  }

  // category — optional; null if not mentioned
  const rawCategory = r['category'];
  let category: string | null;
  if (rawCategory === null || rawCategory === undefined) {
    category = null;
  } else if (typeof rawCategory === 'string') {
    category = rawCategory.trim() || null;
  } else {
    return null;
  }

  return {
    query_type: query_type as AiQueryType,
    period,
    kind,
    category,
  };
}

/**
 * Attempts to parse a natural-language analytics query using the
 * OpenAI Chat Completions API.
 *
 * Returns an AnalyticsQuery if the model extracts a clear, supported intent.
 * Returns null if:
 *   - the text is not recognisable as an analytics query
 *   - the intent is ambiguous (e.g. category_breakdown with unknown kind)
 *   - category-scoped query is requested (not yet supported)
 *   - model output is invalid
 *   - any network / API error occurs
 *
 * All errors are logged and suppressed — the caller falls back to null.
 * No DB writes happen here.
 */
export async function parseAnalyticsQueryWithAi(
  text: string,
  apiKey: string,
  model: string,
  logger: FastifyBaseLogger,
): Promise<AnalyticsQuery | null> {
  const requestBody: AiChatRequest = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 100,
  };

  let response: Response;
  try {
    response = await fetchWithRetry(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      },
      {
        timeoutMs: 15_000,
        retries: 2,
        onRetry: (info) => logger.warn(info, 'AI analytics parser retry'),
      },
    );
  } catch (err) {
    logger.error({ err }, 'AI analytics parser: network error');
    return null;
  }

  if (!response.ok) {
    logger.warn({ status: response.status }, 'AI analytics parser: HTTP error from OpenAI');
    return null;
  }

  let data: AiChatResponse;
  try {
    data = (await response.json()) as AiChatResponse;
  } catch (err) {
    logger.error({ err }, 'AI analytics parser: failed to parse OpenAI response JSON');
    return null;
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    logger.warn('AI analytics parser: empty content in OpenAI response');
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    logger.warn({ content }, 'AI analytics parser: model returned non-JSON content');
    return null;
  }

  const aiResult = validateAiAnalyticsResult(parsed);

  if (!aiResult) {
    logger.info({ content }, 'AI analytics parser: no valid intent in model response');
    return null;
  }

  const query = mapToAnalyticsQuery(aiResult);

  if (query) {
    logger.info(
      { queryType: query.type, period: query.period, kind: aiResult.kind },
      'AI analytics parser: intent extracted',
    );
  } else {
    logger.info({ aiResult }, 'AI analytics parser: intent not mappable to supported query');
  }

  return query;
}
