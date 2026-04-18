import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import type { InlineKeyboardMarkup } from '../telegram/telegram-client';
import { createBillingProvider } from './billing-factory';
import {
  createPendingPayment,
  activateSubscription,
  saveUserPhone,
  getUserPhone,
  getCurrentSubscriptionInfo,
} from './billing-repository';
import {
  setPendingBillingPhone,
  clearPendingBillingPhone,
  getPendingBillingPhone,
  getPendingPhoneConfirm,
  setPendingPhoneConfirm,
  clearPendingPhoneConfirm,
} from './billing-session';
import {
  SUBSCRIPTION_INFO,
  SUBSCRIPTION_INFO_KEYBOARD,
  SUBSCRIPTION_ACTIVE,
  PAYWALL_TEXT,
  PAYWALL_KEYBOARD,
  ASK_PHONE,
  ASK_PHONE_AGAIN,
  INVALID_PHONE,
  INVOICE_SENT,
  SUBSCRIPTION_ACTIVATED,
  TEST_ACTIVATED,
  CONFIRM_NEW_PHONE_MESSAGE,
  CONFIRM_NEW_PHONE_KEYBOARD,
  USE_SAVED_PHONE_MESSAGE,
  USE_SAVED_PHONE_KEYBOARD,
} from './billing-formatter';

export interface BotMessage {
  text: string;
  reply_markup?: InlineKeyboardMarkup;
}

/** Normalises a Kazakh phone number to 87XXXXXXXXX format. Returns null if invalid. */
function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('7')) return '8' + digits.slice(1);
  if (digits.length === 11 && digits.startsWith('8')) return digits;
  if (digits.length === 10 && digits.startsWith('7')) return '8' + digits;
  return null;
}

/**
 * Called when user sends "оплатить", "подписка", etc.
 * - active/trial/grace → shows remaining days instead of payment screen.
 * - pending → payment in progress; show waiting message (not free trial offer).
 * - expired/blocked/canceled → shows payment screen.
 */
export async function handleBillingCommand(
  userId: string,
  planStatus: string,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<BotMessage> {
  logger.info({ provider: env.BILLING_PROVIDER, planStatus }, 'Billing command triggered');

  // Payment was sent to Kaspi but not yet confirmed — do not show "7 days free" offer.
  if (planStatus === 'pending') {
    return {
      text: '⏳ Ваш платёж обрабатывается.\n\nДоступ откроется автоматически сразу после подтверждения оплаты в Kaspi.',
    };
  }

  const hasActiveSub = planStatus === 'active' || planStatus === 'trial' || planStatus === 'grace';

  if (hasActiveSub) {
    const info = await getCurrentSubscriptionInfo(db, userId);
    if (info) {
      const msLeft = info.endDate.getTime() - Date.now();
      const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
      return { text: SUBSCRIPTION_ACTIVE(daysLeft, info.endDate, info.status) };
    }
  }

  return {
    text: SUBSCRIPTION_INFO,
    reply_markup: SUBSCRIPTION_INFO_KEYBOARD(env.KASPI_TEST_MODE),
  };
}

/**
 * Called when user presses "💳 Оплатить 1 490 ₸" inline button (callback: billing_pay).
 * - In test mode: activates immediately.
 * - Otherwise: checks stored phone or prompts for it.
 */
export async function handleBillingPayCallback(
  userId: string,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<BotMessage> {
  if (env.KASPI_TEST_MODE) {
    await activateSubscription(db, {
      userId,
      provider: env.BILLING_PROVIDER,
      invoiceId: `test_${Date.now()}`,
      amountKzt: env.MONTHLY_PRICE_KZT,
    });
    logger.info({ userId }, 'Test subscription activated');
    return { text: TEST_ACTIVATED };
  }

  const phone = await getUserPhone(db, userId);
  if (phone) {
    // Ask user to confirm saved phone or switch to a different one
    return {
      text: USE_SAVED_PHONE_MESSAGE(phone),
      reply_markup: USE_SAVED_PHONE_KEYBOARD,
    };
  }

  await setPendingBillingPhone(db, userId);
  return { text: ASK_PHONE };
}

/**
 * Called on every user text message.
 * Returns a response only if user is in "enter phone" billing state.
 * Returns null to pass through to other handlers.
 */
export async function handleBillingPhoneInput(
  text: string,
  userId: string,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<BotMessage | null> {
  // If user is in phone-confirm state and types affirmative/negative text
  const confirmState = await getPendingPhoneConfirm(db, userId);
  if (confirmState) {
    const t = text.trim().toLowerCase();
    const isYes = /^(да|yes|верно|ок|ok|подтверждаю)$/i.test(t) || t === '+';
    const isNo  = /^(нет|no|нет|изменить|сменить|cancel|отмена)$/i.test(t);
    if (isYes) {
      await clearPendingPhoneConfirm(db, userId);
      await saveUserPhone(db, userId, confirmState.phone);
      logger.info({ userId }, 'Phone confirmed via text and saved');
      return createInvoiceAndRespond(userId, confirmState.phone, db, env, logger);
    }
    if (isNo) {
      await clearPendingPhoneConfirm(db, userId);
      await setPendingBillingPhone(db, userId);
      logger.info({ userId }, 'Phone rejected via text — asking again');
      return { text: ASK_PHONE_AGAIN };
    }
    // Any other text while in confirm state — re-show the confirmation prompt
    return {
      text: CONFIRM_NEW_PHONE_MESSAGE(confirmState.phone),
      reply_markup: CONFIRM_NEW_PHONE_KEYBOARD,
    };
  }

  const pending = await getPendingBillingPhone(db, userId);
  if (!pending) return null;

  const phone = normalisePhone(text.trim());
  if (!phone) {
    return { text: INVALID_PHONE };
  }

  // Store phone in session and ask user to confirm before saving
  await clearPendingBillingPhone(db, userId);
  await setPendingPhoneConfirm(db, userId, phone);
  return {
    text: CONFIRM_NEW_PHONE_MESSAGE(phone),
    reply_markup: CONFIRM_NEW_PHONE_KEYBOARD,
  };
}

async function createInvoiceAndRespond(
  userId: string,
  phone: string,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<BotMessage> {
  const provider = createBillingProvider(env);
  const externalId = `${userId}_${Date.now()}`;

  let link;
  try {
    link = await provider.createInvoice({
      amountKzt: env.MONTHLY_PRICE_KZT,
      phone,
      externalId,
      description: 'Подписка Aqsha AI — 1 490 ₸/мес',
    });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to create Kaspi invoice');
    return { text: 'Не удалось выставить счёт. Попробуйте позже.' };
  }

  await createPendingPayment(db, {
    userId,
    provider: 'kaspi_qr',
    invoiceId: link.invoiceId,
    amountKzt: env.MONTHLY_PRICE_KZT,
    expiresAt: link.expiresAt,
  });

  logger.info({ userId, invoiceId: link.invoiceId }, 'Kaspi invoice created');
  return { text: INVOICE_SENT };
}

/**
 * Called when user taps [✅ Да, верно] after entering a new phone.
 * Saves the phone and creates the invoice.
 */
export async function handleBillingConfirmPhone(
  userId: string,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<BotMessage> {
  const state = await getPendingPhoneConfirm(db, userId);
  if (!state) {
    return { text: 'Не найден номер для подтверждения. Нажмите «Оплатить» и попробуйте снова.' };
  }
  await clearPendingPhoneConfirm(db, userId);
  await saveUserPhone(db, userId, state.phone);
  logger.info({ userId }, 'Phone confirmed and saved');
  return createInvoiceAndRespond(userId, state.phone, db, env, logger);
}

/**
 * Called when user taps [✅ Да] to use their already saved phone.
 * Creates the invoice immediately.
 */
export async function handleBillingUsePhone(
  userId: string,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<BotMessage> {
  const phone = await getUserPhone(db, userId);
  if (!phone) {
    await setPendingBillingPhone(db, userId);
    return { text: ASK_PHONE };
  }
  logger.info({ userId }, 'Using saved phone for invoice');
  return createInvoiceAndRespond(userId, phone, db, env, logger);
}

/**
 * Called when user taps [✏️ Изменить] or [🔄 Сменить номер].
 * Clears any pending confirmation state and asks for a new phone number.
 */
export async function handleBillingChangePhone(
  userId: string,
  db: DbPool,
  logger: FastifyBaseLogger,
): Promise<BotMessage> {
  await clearPendingPhoneConfirm(db, userId);
  await setPendingBillingPhone(db, userId);
  logger.info({ userId }, 'Phone change requested');
  return { text: ASK_PHONE_AGAIN };
}

export { SUBSCRIPTION_ACTIVATED, PAYWALL_TEXT, PAYWALL_KEYBOARD };
