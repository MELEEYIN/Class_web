@echo off
chcp 65001 >nul
title Grab timetable (manual login)
cd /d "%~dp0.."

rem This file is deliberately ASCII-only (cmd.exe garbles Chinese in .bat).
rem Chinese messages are printed by the Node script.

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [X] Node.js not found. Please install the LTS build from:
  echo       https://nodejs.org/
  echo.
  pause
  exit /b 1
)

node "%~dp0timetable-helper.mjs" %*
set CODE=%ERRORLEVEL%

echo.
echo   ------------------------------
if not "%CODE%"=="0" echo   Finished with exit code %CODE% - see the messages above.
if "%CODE%"=="0" echo   Done.
echo   ------------------------------
echo.
pause
