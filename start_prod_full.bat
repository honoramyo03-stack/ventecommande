@echo off
title QuickOrder - Build + Production
echo.
echo ============================================
echo   QuickOrder - Build complet + Production
echo ============================================
echo.

where docker >nul 2>&1 || (echo [ERREUR] Docker non trouve. && pause && exit /b 1)

echo [1/3] Arret des containers existants...
docker compose down 2>nul

echo [2/3] Build des images (peut prendre quelques minutes)...
docker compose build --no-cache

echo [3/3] Demarrage...
docker compose up -d

echo.
echo ============================================
echo   Application : http://localhost
echo   Vendeur     : admin / password
echo ============================================
echo.
pause
