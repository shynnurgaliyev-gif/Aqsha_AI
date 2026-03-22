import { z } from 'zod';

/**
 * Coerces a string env var to boolean.
 * Accepts: "true", "1" → true | "false", "0" → false
 */
const envBool = (defaultValue: boolean) =>
  z
    .string()
    .default(defaultValue ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  // ── Runtime ──────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // ── App ──────────────────────────────────────────────────────────────────
  APP_NAME: z.string().default('aqsha-ai'),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  APP_BASE_URL: z.string().url(),
  APP_TIMEZONE: z.string().default('UTC'),

  // ── Telegram ─────────────────────────────────────────────────────────────
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),

  // ── Database ─────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().min(1),
  DATABASE_DIRECT_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // ── OpenAI ───────────────────────────────────────────────────────────────
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_TRANSCRIBE_MODEL: z.string().default('whisper-1'),

  // ── Voice ────────────────────────────────────────────────────────────────
  FFMPEG_PATH: z.string().default('ffmpeg'),
  MAX_VOICE_FILE_SIZE_MB: z.coerce.number().int().positive().default(20),

  // ── Worker / Jobs ────────────────────────────────────────────────────────
  JOB_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  JOB_BATCH_SIZE: z.coerce.number().int().positive().default(10),
  DAILY_RECOMMENDATION_DEFAULT_HOUR: z.coerce.number().int().min(0).max(23).default(9),

  // ── Admin ────────────────────────────────────────────────────────────────
  ADMIN_ENABLED: envBool(false),
  ADMIN_PORT: z.coerce.number().int().positive().default(4000),

  // ── Logging ──────────────────────────────────────────────────────────────
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ── Billing ──────────────────────────────────────────────────────────────
  BILLING_PROVIDER: z.enum(['stub']).default('stub'),
  TRIAL_DAYS: z.coerce.number().int().positive().default(7),
  MONTHLY_PRICE_KZT: z.coerce.number().int().positive().default(800),
});

export type AppEnv = z.infer<typeof envSchema>;

/**
 * Validates and parses environment variables against the schema.
 * Throws a descriptive error on first validation failure.
 *
 * Call this once at application startup — do not call per-request.
 */
export function parseEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Environment validation failed:\n${issues}`);
  }

  return result.data;
}
