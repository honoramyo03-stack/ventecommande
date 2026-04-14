@echo off
echo ============================================
echo   QuickOrder - Demarrage Production
echo ============================================
echo.

echo [1/4] Installation des dependances backend...
cd backend
call npm install
echo.

echo [2/4] Creation de la base de donnees SQLite...
node db_setup.js
echo.

echo [3/4] Demarrage du backend (port 4000)...
start "QuickOrder Backend" cmd /k "node src/server.js"
echo    Backend demarre sur http://localhost:4000
echo.

echo [4/4] Attente du backend (3 secondes)...
timeout /t 3 /nobreak >nul

cd ..
echo.
echo ============================================
echo   Backend:  http://localhost:4000/api
echo   Frontend: Lancez le frontend separement
echo ============================================
echo.
echo Pour le frontend en dev:
echo   npm run dev
echo.
echo Pour le frontend en production:
echo   npm run build
echo   npx serve dist -l 5173
echo.
echo Vendeur: admin / password
echo ============================================
pause
