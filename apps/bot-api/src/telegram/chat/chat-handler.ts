import type { FastifyBaseLogger } from 'fastify';
import type { ChatMessage } from './chat-session';

/**
 * Conversational fallback handler.
 *
 * Called when no financial intent was detected (unsupported result from text intake).
 * Uses OpenAI to generate a friendly, context-aware response as Акша — the finance assistant.
 * Accepts prior conversation history so replies stay contextually coherent.
 *
 * On any OpenAI failure, returns a safe hardcoded fallback so the bot always replies.
 */

const SYSTEM_PROMPT = `Ты Акша — дружелюбный AI-ассистент для личных финансов в Telegram.

Личность:
- Тёплый, позитивный, немного остроумный
- Говоришь по-русски, на "ты"
- Короткие ответы — 1-3 предложения, не больше. Это мессенджер, не статья.
- Используй эмодзи умеренно — только когда уместно

Что ты умеешь (объясняй только если спросили):
- Записывать расходы: «Кофе 500», «Такси 1200 Транспорт»
- Записывать доходы: «Зарплата 250000», «Фриланс 50000 Доход»
- Голосовые сообщения — можно надиктовать трату
- Аналитика: баланс, расходы за сегодня/неделю/месяц, по категориям
- Бюджеты: «Установи бюджет Еда 30000»
- Ежедневные советы по тратам в 9:00 утра

Правила:
- На приветствие — поздоровайся в ответ и предложи помощь одним коротким предложением
- Если спрашивают что ты умеешь — дай краткий список, не перечисляй всё
- Если запрос явно финансовый но непонятный — покажи правильный формат
- Не выдумывай данные о балансе или транзакциях пользователя — ты их не знаешь в этом контексте
- Помни контекст разговора: если пользователь отвечает «да» или «нет» — это ответ на твой предыдущий вопрос
- На темы не связанные с финансами — отвечай одной фразой и мягко возвращай к финансам
- Никогда не говори что ты ChatGPT или называй модель`;

const FALLBACK_RESPONSES = [
  'Привет! Я Акша — твой финансовый ассистент 👋\nНапиши «Кофе 500» чтобы записать расход, или спроси «баланс».',
  'Не совсем понял, но я здесь 😊 Попробуй написать расход или доход — например «Такси 800».',
  'Привет! Чем могу помочь? Я умею записывать расходы, показывать аналитику и следить за бюджетом.',
];

const DEFAULT_FALLBACK = 'Привет! Я Акша — твой финансовый ассистент 👋\nНапиши «Кофе 500» чтобы записать расход, или спроси «баланс».';

function randomFallback(): string {
  return FALLBACK_RESPONSES[Math.floor(Math.random() * FALLBACK_RESPONSES.length)] ?? DEFAULT_FALLBACK;
}

export interface ChatResult {
  reply: string;
  /** Updated history to persist: prior history + new user message + assistant reply. */
  updatedHistory: ChatMessage[];
}

export async function handleChat(
  text: string,
  history: ChatMessage[],
  apiKey: string,
  model: string,
  logger: FastifyBaseLogger,
): Promise<ChatResult> {
  const newUserMessage: ChatMessage = { role: 'user', content: text };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history,
          newUserMessage,
        ],
        max_tokens: 200,
        temperature: 0.75,
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Chat handler: OpenAI error, using fallback');
      return { reply: randomFallback(), updatedHistory: history };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      logger.warn('Chat handler: empty OpenAI response, using fallback');
      return { reply: randomFallback(), updatedHistory: history };
    }

    const assistantMessage: ChatMessage = { role: 'assistant', content };
    return {
      reply: content,
      updatedHistory: [...history, newUserMessage, assistantMessage],
    };
  } catch (err) {
    logger.warn({ err }, 'Chat handler: unexpected error, using fallback');
    return { reply: randomFallback(), updatedHistory: history };
  }
}
