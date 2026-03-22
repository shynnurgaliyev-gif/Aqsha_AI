@echo off

REM =========================================================
REM CREATE SOURCE DIRECTORIES
REM =========================================================
if not exist "apps\bot-api\src" mkdir "apps\bot-api\src"
if not exist "apps\worker\src" mkdir "apps\worker\src"
if not exist "apps\admin-web\src" mkdir "apps\admin-web\src"

if not exist "packages\config\src" mkdir "packages\config\src"
if not exist "packages\database\src" mkdir "packages\database\src"
if not exist "packages\shared\src" mkdir "packages\shared\src"

REM =========================================================
REM BOT API FILES
REM =========================================================
(
echo export const BOT_API_APP_NAME = 'bot-api';
) > "apps\bot-api\src\app.ts"

(
echo import { BOT_API_APP_NAME } from './app';
echo.
echo function bootstrap^(^) {
echo   console.log^(`[${BOT_API_APP_NAME}] bootstrap placeholder`^);
echo }
echo.
echo bootstrap^(^);
) > "apps\bot-api\src\main.ts"

(
echo {
echo   "extends": "../../tsconfig.base.json",
echo   "compilerOptions": {
echo     "rootDir": "src",
echo     "outDir": "dist",
echo     "noEmit": false
echo   },
echo   "include": ["src/**/*.ts"],
echo   "exclude": ["dist", "node_modules"]
echo }
) > "apps\bot-api\tsconfig.json"

REM =========================================================
REM WORKER FILES
REM =========================================================
(
echo export const WORKER_APP_NAME = 'worker';
) > "apps\worker\src\app.ts"

(
echo import { WORKER_APP_NAME } from './app';
echo.
echo function bootstrap^(^) {
echo   console.log^(`[${WORKER_APP_NAME}] bootstrap placeholder`^);
echo }
echo.
echo bootstrap^(^);
) > "apps\worker\src\main.ts"

(
echo {
echo   "extends": "../../tsconfig.base.json",
echo   "compilerOptions": {
echo     "rootDir": "src",
echo     "outDir": "dist",
echo     "noEmit": false
echo   },
echo   "include": ["src/**/*.ts"],
echo   "exclude": ["dist", "node_modules"]
echo }
) > "apps\worker\tsconfig.json"

REM =========================================================
REM ADMIN WEB PLACEHOLDER
REM =========================================================
if not exist "apps\admin-web\src\.gitkeep" type nul > "apps\admin-web\src\.gitkeep"

(
echo # admin-web
echo.
echo Placeholder for internal admin dashboard.
echo Implementation will be added later.
) > "apps\admin-web\README.md"

REM =========================================================
REM SHARED PACKAGE
REM =========================================================
(
echo export {};
) > "packages\shared\src\index.ts"

(
echo {
echo   "extends": "../../tsconfig.base.json",
echo   "compilerOptions": {
echo     "rootDir": "src",
echo     "outDir": "dist",
echo     "noEmit": false
echo   },
echo   "include": ["src/**/*.ts"],
echo   "exclude": ["dist", "node_modules"]
echo }
) > "packages\shared\tsconfig.json"

REM =========================================================
REM CONFIG PACKAGE
REM =========================================================
(
echo export {};
) > "packages\config\src\index.ts"

(
echo {
echo   "extends": "../../tsconfig.base.json",
echo   "compilerOptions": {
echo     "rootDir": "src",
echo     "outDir": "dist",
echo     "noEmit": false
echo   },
echo   "include": ["src/**/*.ts"],
echo   "exclude": ["dist", "node_modules"]
echo }
) > "packages\config\tsconfig.json"

REM =========================================================
REM DATABASE PACKAGE
REM =========================================================
(
echo export {};
) > "packages\database\src\index.ts"

(
echo {
echo   "extends": "../../tsconfig.base.json",
echo   "compilerOptions": {
echo     "rootDir": "src",
echo     "outDir": "dist",
echo     "noEmit": false
echo   },
echo   "include": ["src/**/*.ts"],
echo   "exclude": ["dist", "node_modules"]
echo }
) > "packages\database\tsconfig.json"

echo.
echo Source skeleton created successfully.
echo.
pause