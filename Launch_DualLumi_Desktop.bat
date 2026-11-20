@echo off
title DualLumi PRO Desktop
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
start "" pythonw backend\server.py
start "" node node_modules\electron\cli.js .
exit
