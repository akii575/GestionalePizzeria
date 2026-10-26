@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-printer-agent.ps1"
if errorlevel 1 (
    echo.
    echo Installazione non riuscita. Leggi il messaggio qui sopra.
)
pause
