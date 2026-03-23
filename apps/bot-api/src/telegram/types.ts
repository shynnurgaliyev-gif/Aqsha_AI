// Minimal Telegram update types covering the update kinds the bot will handle.
// Not exhaustive — only fields this service reads are declared.

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  voice?: TelegramVoice;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export type TelegramUpdateType =
  | 'message'
  | 'voice'
  | 'edited_message'
  | 'callback_query'
  | 'unknown';

export function detectUpdateType(update: TelegramUpdate): TelegramUpdateType {
  if (update.message?.voice) return 'voice';
  if (update.message) return 'message';
  if (update.edited_message) return 'edited_message';
  if (update.callback_query) return 'callback_query';
  return 'unknown';
}

export function extractTelegramUserId(update: TelegramUpdate): number | null {
  return (
    update.message?.from?.id ??
    update.edited_message?.from?.id ??
    update.callback_query?.from?.id ??
    null
  );
}

export function extractChatId(update: TelegramUpdate): number | null {
  return (
    update.message?.chat.id ??
    update.edited_message?.chat.id ??
    update.callback_query?.message?.chat.id ??
    null
  );
}
