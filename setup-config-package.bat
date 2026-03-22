@echo off
setlocal

set "PSFILE=%TEMP%\aqsha_setup_config_%RANDOM%.ps1"

> "%PSFILE%" (
  echo $Utf8NoBom = New-Object System.Text.UTF8Encoding($false^)
  echo.
  echo $rootPackageJson = @'
  echo {
  echo   "name": "aqsha-ai",
  echo   "private": true,
  echo   "version": "0.1.0",
  echo   "scripts": {
  echo     "dev": "pnpm -r --parallel --if-present dev",
  echo     "build": "pnpm -r --if-present build",
  echo     "lint": "pnpm -r --if-present lint",
  echo     "typecheck": "pnpm -r --if-present typecheck",
  echo     "test": "pnpm -r --if-present test"
  echo   },
  echo   "devDependencies": {
  echo     "typescript": "latest",
  echo     "@types/node": "latest"
  echo   }
  echo }
  echo '@
  echo [System.IO.File]::WriteAllText("package.json", $rootPackageJson, $Utf8NoBom^)
  echo.
  echo $configPackageJson = @'
  echo {
  echo   "name": "@aqsha-ai/config",
  echo   "private": true,
  echo   "version": "0.1.0",
  echo   "main": "dist/index.js",
  echo   "types": "dist/index.d.ts",
  echo   "files": [
  echo     "dist"
  echo   ],
  echo   "scripts": {
  echo     "build": "tsc -p tsconfig.json",
  echo     "lint": "echo config lint is not configured yet",
  echo     "typecheck": "tsc -p tsconfig.json --noEmit",
  echo     "test": "echo config test is not configured yet"
  echo   },
  echo   "dependencies": {
  echo     "zod": "latest"
  echo   }
  echo }
  echo '@
  echo [System.IO.File]::WriteAllText("packages\config\package.json", $configPackageJson, $Utf8NoBom^)
  echo.
  echo $envTs = @'
  echo import { z } from 'zod';
  echo.
  echo const nodeEnvSchema = z.enum(['development', 'test', 'production']);
  echo const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
  echo.
  echo function parseBoolean(value: string ^| undefined, defaultValue: boolean^): boolean {
  echo   if (value === undefined ^|^| value === '') {
  echo     return defaultValue;
  echo   }
  echo.
  echo   if (value === 'true') {
  echo     return true;
  echo   }
  echo.
  echo   if (value === 'false') {
  echo     return false;
  echo   }
  echo.
  echo   throw new Error(`Invalid boolean value: ${value}`);
  echo }
  echo.
  echo export const envSchema = z.object({
  echo   NODE_ENV: nodeEnvSchema.default('development'),
  echo.
  echo   APP_NAME: z.string().min(1).default('aqsha-ai'),
  echo   APP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  echo   APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  echo   APP_TIMEZONE: z.string().min(1).default('Asia/Almaty'),
  echo.
  echo   TELEGRAM_BOT_TOKEN: z.string().min(1),
  echo   TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  echo   TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  echo.
  echo   DATABASE_URL: z.string().min(1),
  echo   DATABASE_DIRECT_URL: z.string().min(1).optional(),
  echo   SUPABASE_URL: z.string().url(),
  echo   SUPABASE_ANON_KEY: z.string().min(1),
  echo   SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  echo.
  echo   OPENAI_API_KEY: z.string().min(1),
  echo   OPENAI_MODEL: z.string().min(1).default('gpt-4.1-mini'),
  echo   OPENAI_TRANSCRIBE_MODEL: z.string().min(1).default('gpt-4o-mini-transcribe'),
  echo.
  echo   FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  echo   MAX_VOICE_FILE_SIZE_MB: z.coerce.number().int().positive().default(20),
  echo.
  echo   JOB_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  echo   JOB_BATCH_SIZE: z.coerce.number().int().positive().default(50),
  echo   DAILY_RECOMMENDATION_DEFAULT_HOUR: z.coerce.number().int().min(0).max(23).default(9),
  echo.
  echo   ADMIN_ENABLED: z.boolean().default(true),
  echo   ADMIN_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  echo.
  echo   LOG_LEVEL: logLevelSchema.default('info'),
  echo.
  echo   BILLING_PROVIDER: z.string().min(1).default('stub'),
  echo   TRIAL_DAYS: z.coerce.number().int().positive().default(7),
  echo   MONTHLY_PRICE_KZT: z.coerce.number().int().positive().default(800)
  echo });
  echo.
  echo export type AppEnv = z.infer^<typeof envSchema^>;
  echo.
  echo export function parseEnv(rawEnv: NodeJS.ProcessEnv = process.env^): AppEnv {
  echo   return envSchema.parse({
  echo     ...rawEnv,
  echo     ADMIN_ENABLED: parseBoolean(rawEnv.ADMIN_ENABLED, true)
  echo   });
  echo }
  echo '@
  echo [System.IO.File]::WriteAllText("packages\config\src\env.ts", $envTs, $Utf8NoBom^)
  echo.
  echo $indexTs = @'
  echo export { envSchema, parseEnv, type AppEnv } from './env';
  echo '@
  echo [System.IO.File]::WriteAllText("packages\config\src\index.ts", $indexTs, $Utf8NoBom^)
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PSFILE%"
set "EXITCODE=%ERRORLEVEL%"
del "%PSFILE%"

if not "%EXITCODE%"=="0" (
  echo.
  echo Script failed with code %EXITCODE%.
  pause
  exit /b %EXITCODE%
)

echo.
echo Files created successfully:
echo - package.json
echo - packages\config\package.json
echo - packages\config\src\env.ts
echo - packages\config\src\index.ts
echo.
pause