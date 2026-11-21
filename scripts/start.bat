@echo off
title DualLumi PRO Controller
cd /d "%~dp0\.."

echo ========================================================
echo        DualLumi PRO - BLE Lighting Controller
echo ========================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python 3.10+ is required but not found in PATH.
    pause
    exit /b 1
)

if not exist ".venv" (
    echo [INFO] Setting up virtual environment...
    python -m venv .venv
)

call .venv\Scripts\activate.bat 2>nul || call .venv\Scripts\activate 2>nul

echo [INFO] Verifying dependencies...
pip install -r requirements.txt --quiet --disable-pip-version-check

echo [INFO] Launching DualLumi Native Controller...
python duallumi_native.py

pause
