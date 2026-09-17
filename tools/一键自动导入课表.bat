@echo off
chcp 65001 >nul
title Auto import timetable
cd /d "%~dp0.."

rem ============================================================
rem  This file is deliberately ASCII-only.
rem  Chinese characters inside a .bat get garbled by cmd.exe
rem  (it reads the file with the OEM codepage), and the garbled
rem  bytes break the following commands. All Chinese messages are
rem  printed by the Node script instead.
rem ============================================================

echo.
echo   ============================================
echo     Auto import timetable -  auto login + grab
echo   ============================================
echo.
echo   Credentials are read from (first one found):
echo     1^) env vars CW_JWXT_USER / CW_JWXT_PASS
echo     2^) .timetable-exports\jwxt-account.json  ^(gitignored, local only^)
echo        {"user":"student-id","pass":"password"}
echo   If neither exists, it falls back to manual login.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js not found. Please install the LTS build from:
  echo       https://nodejs.org/
  echo.
  pause
  exit /b 1
)

node "%~dp0timetable-helper.mjs" --auto --headless %*
set CODE=%ERRORLEVEL%

echo.
echo   ------------------------------
if not "%CODE%"=="0" echo   Finished with exit code %CODE% - see the messages above.
if "%CODE%"=="0" echo   Done. Click "Confirm import" in the browser page that just opened.
echo   ------------------------------
echo.
pause
