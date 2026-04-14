@echo off
echo ============================================
echo   QuickOrder - Demarrage Developpement
echo ============================================
echo.

echo [1/5] Installation des dependances backend...
cd backend
call npm install
echo.

echo [2/5] Creation de la base de donnees SQLite...
node db_setup.js
echo.

echo [3/5] Demarrage du backend (port 4000)...
start "QuickOrder Backend" cmd /k "node src/server.js"
echo    Backend demarre sur http://localhost:4000
echo.

echo [4/5] Attente du backend (3 secondes)...
timeout /t 3 /nobreak >nul

cd ..

echo [5/5] Demarrage du frontend (port 5173)...
start "QuickOrder Frontend" cmd /k "npm run dev -- --host"
echo    Frontend demarre sur http://localhost:5173
echo.

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
