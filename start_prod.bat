@echo off
title QuickOrder - Production
echo.
echo ============================================
echo   QuickOrder - Production (Docker)
echo ============================================
echo.

where docker >nul 2>&1 || (echo [ERREUR] Docker non trouve. Installez Docker Desktop. && pause && exit /b 1)

echo Demarrage des containers...
docker compose up -d

echo.
echo ============================================
echo   Application : http://localhost
echo   Vendeur     : admin / password
echo.
echo   Logs   : docker compose logs -f
echo   Stop   : docker compose down
echo ============================================
echo.
pause
