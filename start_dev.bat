@echo off
setlocal
title QuickOrder - Developpement
echo.
echo ============================================
echo   QuickOrder - Mode Developpement
echo ============================================
echo.

where node >nul 2>&1 || (echo [ERREUR] Node.js non trouve. Installez-le depuis nodejs.org && pause && exit /b 1)

echo [1/4] Installation des dependances...
if not exist "node_modules" ( call npm install )
if not exist "backend\node_modules" ( cd backend && call npm install && cd .. )

echo [2/4] Demarrage du backend (port 4000)...
start "QuickOrder Backend" cmd /k "cd /d %~dp0backend && node src/server.js"

echo [3/4] Attente du backend (4 secondes)...
timeout /t 4 /nobreak >nul

echo [4/4] Demarrage du frontend (port 5173)...
start "QuickOrder Frontend" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ============================================
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:4000/api
echo   Vendeur  : admin / password
echo.
echo   Acces LAN : http://<votre-IP>:5173
echo   (IP : ipconfig dans le terminal)
echo ============================================
echo.
echo Fermez les deux fenetres pour arreter.
pause
