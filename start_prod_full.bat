@echo off
echo ============================================
echo   QuickOrder - Build + Production
echo ============================================
echo.

echo [1/7] Installation des dependances frontend...
call npm install
echo.

echo [2/7] Build du frontend (production)...
call npm run build
echo.

echo [3/7] Installation des dependances backend...
cd backend
call npm install
echo.

echo [4/7] Creation de la base de donnees SQLite...
node db_setup.js
echo.

echo [5/7] Demarrage du backend (port 4000)...
start "QuickOrder Backend" cmd /k "node src/server.js"
echo    Backend demarre sur http://localhost:4000
echo.

echo [6/7] Attente du backend (3 secondes)...
timeout /t 3 /nobreak >nul

cd ..

echo [7/7] Demarrage du frontend build (port 5173)...
start "QuickOrder Frontend" cmd /k "npx serve dist -l 5173"
echo    Frontend demarre sur http://localhost:5173
echo.

echo ============================================
echo   PRODUCTION DEMARREE
echo ============================================
echo   Backend:  http://localhost:4000/api
echo   Frontend: http://localhost:5173
echo   Vendeur:  admin / password
echo ============================================
echo.
echo Les deux serveurs sont demarres dans des fenetres separees.
echo Fermez les fenetres pour arreter les serveurs.
echo.
pause
