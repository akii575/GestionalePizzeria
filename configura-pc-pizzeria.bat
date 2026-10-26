@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\configure-pizzeria-pc.ps1"
if errorlevel 1 (
    echo.
    echo Configurazione non completata. Leggi il messaggio qui sopra.
)
pause
