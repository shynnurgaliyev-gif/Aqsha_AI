import type { FastifyBaseLogger } from 'fastify';
import type { AppEnv } from '@aqsha-ai/config';
import type { DbPool } from '@aqsha-ai/database';
import {
  handleBillingCommand as _handleBillingCommand,
  type BotMessage,
} from '../../billing/billing-service';

export type { BotMessage };

/**
 * Entry point for billing command from update-router.
 * Delegates to the real billing service (../../billing/billing-service).
 */
export async function handleBillingCommand(
  userId: string,
  planStatus: string,
  db: DbPool,
  env: AppEnv,
  logger: FastifyBaseLogger,
): Promise<BotMessage> {
  return _handleBillingCommand(userId, planStatus, db, env, logger);
}
