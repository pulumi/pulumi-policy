@echo off
setlocal
set SCRIPT_DIR=%~dp0
cd "%SCRIPT_DIR%" && @go run . %*
