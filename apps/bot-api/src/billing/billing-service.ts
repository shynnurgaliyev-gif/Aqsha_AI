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
} from './billing-repository';
import { setPendingBillingPhone, clearPendingBillingPhone, getPendingBillingPhone } from './billing-session';
import {
  SUBSCRIPTION_INFO,
  SUBSCRIPTION_INFO_KEYBOARD,
  PAYWALL_TEXT,
  PAYWALL_KEYBOARD,
  ASK_PHONE,
  INVALID_PHONE,
  INVOICE_SENT,
  SUBSCRIPTION_ACTIVATED,
  TEST_ACTIVATED,
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
 * Returns the subscription info card with the "Оплатить" button.
 */
export async function handleBillingCommand(
  _userId: string,
  _planStatus: string,
  _db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<BotMessage> {
  logger.info({ provider: env.BILLING_PROVIDER }, 'Billing command triggered');
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
    return createInvoiceAndRespond(userId, phone, db, env, logger);
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
  const pending = await getPendingBillingPhone(db, userId);
  if (!pending) return null;

  const phone = normalisePhone(text.trim());
  if (!phone) {
    return { text: INVALID_PHONE };
  }

  await clearPendingBillingPhone(db, userId);
  await saveUserPhone(db, userId, phone);

  return createInvoiceAndRespond(userId, phone, db, env, logger);
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

export { SUBSCRIPTION_ACTIVATED, PAYWALL_TEXT, PAYWALL_KEYBOARD };
