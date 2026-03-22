@echo off

REM === APPS ===
if not exist "apps" mkdir "apps"
if not exist "apps\bot-api" mkdir "apps\bot-api"
if not exist "apps\worker" mkdir "apps\worker"
if not exist "apps\admin-web" mkdir "apps\admin-web"

REM === PACKAGES ===
if not exist "packages" mkdir "packages"
if not exist "packages\config" mkdir "packages\config"
if not exist "packages\database" mkdir "packages\database"
if not exist "packages\shared" mkdir "packages\shared"

REM === SUPABASE ===
if not exist "supabase" mkdir "supabase"
if not exist "supabase\migrations" mkdir "supabase\migrations"

REM === DOCS / GITHUB ===
if not exist "docs" mkdir "docs"
if not exist ".github" mkdir ".github"
if not exist ".github\workflows" mkdir ".github\workflows"

REM === ROOT FILES ===
if not exist "CLAUDE.md" type nul > "CLAUDE.md"
if not exist "package.json" type nul > "package.json"
if not exist "pnpm-workspace.yaml" type nul > "pnpm-workspace.yaml"
if not exist ".env.example" type nul > ".env.example"
if not exist ".gitignore" type nul > ".gitignore"

REM === KEEP FILES ===
if not exist "apps\bot-api\.gitkeep" type nul > "apps\bot-api\.gitkeep"
if not exist "apps\worker\.gitkeep" type nul > "apps\worker\.gitkeep"
if not exist "apps\admin-web\.gitkeep" type nul > "apps\admin-web\.gitkeep"

if not exist "packages\config\.gitkeep" type nul > "packages\config\.gitkeep"
if not exist "packages\database\.gitkeep" type nul > "packages\database\.gitkeep"
if not exist "packages\shared\.gitkeep" type nul > "packages\shared\.gitkeep"

if not exist "docs\.gitkeep" type nul > "docs\.gitkeep"
if not exist ".github\workflows\.gitkeep" type nul > ".github\workflows\.gitkeep"

REM === FIRST MIGRATION FILE ===
if not exist "supabase\migrations\20260322_001_init_schema.sql" type nul > "supabase\migrations\20260322_001_init_schema.sql"

echo.
echo Project structure created successfully.
echo.
pause