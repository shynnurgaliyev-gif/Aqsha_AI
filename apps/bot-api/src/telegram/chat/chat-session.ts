import type { DbPool } from '@aqsha-ai/database';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Maximum number of messages kept in history (user + assistant pairs). */
const MAX_HISTORY = 8;

/**
 * Reads the chat history from the session context.
 * Returns an empty array if no session or no history exists.
 */
export async function getChatHistory(db: DbPool, userId: string): Promise<ChatMessage[]> {
  const result = await db<Array<{ context_json: Record<string, unknown> }>>`
    SELECT context_json FROM user_sessions WHERE user_id = ${userId}
  `;
  const row = result[0];
  if (!row) return [];

  const history = row.context_json['chatHistory'];
  if (!Array.isArray(history)) return [];

  return history.filter(
    (m): m is ChatMessage =>
      m !== null &&
      typeof m === 'object' &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string',
  );
}

/**
 * Persists the chat history into the session context.
 * Trims to the last MAX_HISTORY messages before saving.
 */
export async function setChatHistory(
  db: DbPool,
  userId: string,
  history: ChatMessage[],
): Promise<void> {
  const trimmed = history.slice(-MAX_HISTORY);
  await db`
    UPDATE user_sessions
    SET context_json = context_json || ${db.json({ chatHistory: trimmed } as any)}
    WHERE user_id = ${userId}
  `;
}
