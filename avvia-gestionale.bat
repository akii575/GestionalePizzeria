@echo off
setlocal
cd /d "%~dp0"
if not defined FIREBASE_WEB_API_KEY (
    goto missing_firebase_config
)
if not defined FIREBASE_AUTH_DOMAIN (
    goto missing_firebase_config
)
if not defined FIREBASE_APP_ID (
    goto missing_firebase_config
)
if not exist "%~dp0service-account.json" (
    echo The local Firebase service account file is missing.
    exit /b 1
)
set "FIREBASE_PROJECT_ID=gestionalecivico7"
set "GOOGLE_APPLICATION_CREDENTIALS=%~dp0service-account.json"
java --enable-native-access=ALL-UNNAMED -jar "%~dp0target\gestionale-pizzeria-0.0.1-SNAPSHOT.jar"
exit /b %ERRORLEVEL%

:missing_firebase_config
echo Set FIREBASE_WEB_API_KEY, FIREBASE_AUTH_DOMAIN and FIREBASE_APP_ID before starting.
exit /b 1