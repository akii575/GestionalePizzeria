@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\disable-printer-agent.ps1"
if errorlevel 1 (
    echo.
    echo Disattivazione non completata. Leggi il messaggio qui sopra.
)
pause
