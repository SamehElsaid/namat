/** Minimal subset of the Telegram Bot API types this integration relies on. */

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  date?: number;
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
  callback_query?: TelegramCallbackQuery;
}

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface SendMessageOptions {
  replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] };
  disableWebPagePreview?: boolean;
}
