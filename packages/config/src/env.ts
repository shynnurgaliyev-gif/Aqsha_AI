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

const baseSchema = z.object({
  // ── Runtime ──────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // ── App ──────────────────────────────────────────────────────────────────
  APP_NAME: z.string().default('aqsha-ai'),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  APP_BASE_URL: z.string().url(),
  APP_TIMEZONE: z.string().default('UTC'),

  // ── Telegram ─────────────────────────────────────────────────────────────
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_BOT_USERNAME: z.string().default('AqshaAiBot'),
  TELEGRAM_MINIAPP_URL: z.string().url().optional(), // e.g. https://aqsha-web.onrender.com/mini

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
  // Hard ceiling on the binary size of a single voice payload.
  // 10 MB ≈ 25-40 min of typical Telegram OGG/Opus — well above the duration
  // limits below, but a safety net against malformed / repacked uploads.
  MAX_VOICE_FILE_SIZE_MB: z.coerce.number().int().positive().default(10),
  // Daily transcription quota for trial users (per user, in their local TZ).
  // active / grace / pending users are unlimited.
  TRIAL_VOICE_DAILY_LIMIT: z.coerce.number().int().positive().default(10),
  // Duration ceiling per voice message (seconds). Hard cap on Whisper cost
  // per call. Trial = 1.5 min, paid = 15 min.
  TRIAL_VOICE_MAX_DURATION_SEC: z.coerce.number().int().positive().default(90),
  PAID_VOICE_MAX_DURATION_SEC: z.coerce.number().int().positive().default(900),

  // ── Worker / Jobs ────────────────────────────────────────────────────────
  JOB_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  JOB_BATCH_SIZE: z.coerce.number().int().positive().default(25),
  // Telegram Bot API hard limit: 30 messages/sec per bot.
  // With 2 workers × 25 batch = 50 potential sends/tick.
  // Set to 35ms delay after each send = ~28 msg/sec per worker instance.
  TELEGRAM_RATE_LIMIT_DELAY_MS: z.coerce.number().int().min(0).default(35),
  DAILY_RECOMMENDATION_DEFAULT_HOUR: z.coerce.number().int().min(0).max(23).default(9),

  // ── Admin ────────────────────────────────────────────────────────────────
  ADMIN_ENABLED: envBool(false),
  ADMIN_PORT: z.coerce.number().int().positive().default(4000),

  // ── Logging ──────────────────────────────────────────────────────────────
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ── Billing ──────────────────────────────────────────────────────────────
  BILLING_PROVIDER: z.enum(['stub', 'kaspi_qr', 'tiptoppay']).default('stub'),
  TRIAL_DAYS: z.coerce.number().int().positive().default(8),
  MONTHLY_PRICE_KZT: z.coerce.number().int().positive().default(1490),

  // ── Kaspi QR (ApiPay.kz) ─────────────────────────────────────────────────
  KASPI_API_KEY: z.string().min(1).optional(),
  KASPI_API_BASE_URL: z.string().url().default('https://bpapi.bazarbay.site/api/v1'),
  KASPI_WEBHOOK_SECRET: z.string().min(1).optional(),
  KASPI_TEST_MODE: envBool(false),
});

/**
 * Cross-field validation: when a billing provider is selected for real
 * (non-test mode), require its credentials to be present. Catches deploy
 * misconfigurations at startup instead of silently failing on the first
 * payment webhook.
 */
const envSchema = baseSchema.superRefine((env, ctx) => {
  if (env.BILLING_PROVIDER === 'kaspi_qr' && !env.KASPI_TEST_MODE) {
    if (!env.KASPI_API_KEY) {
      ctx.addIssue({
        path: ['KASPI_API_KEY'],
        code: z.ZodIssueCode.custom,
        message: 'required when BILLING_PROVIDER=kaspi_qr and KASPI_TEST_MODE is false',
      });
    }
    if (!env.KASPI_WEBHOOK_SECRET) {
      ctx.addIssue({
        path: ['KASPI_WEBHOOK_SECRET'],
        code: z.ZodIssueCode.custom,
        message: 'required when BILLING_PROVIDER=kaspi_qr and KASPI_TEST_MODE is false',
      });
    }
  }

  // Mini App API origin must be explicit in production — refuses to fall back
  // to '*' which would let any origin call the Mini App API with credentials.
  if (env.NODE_ENV === 'production' && !env.TELEGRAM_MINIAPP_URL) {
    ctx.addIssue({
      path: ['TELEGRAM_MINIAPP_URL'],
      code: z.ZodIssueCode.custom,
      message: 'required in production — Mini App CORS origin must be explicit',
    });
  }
});

export type AppEnv = z.infer<typeof baseSchema>;

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
