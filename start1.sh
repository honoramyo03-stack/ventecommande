#!/bin/bash

echo "[1/5] Installation des dependances backend..."
cd backend || exit

echo "[3/5] Demarrage du backend (port 4000)..."
gnome-terminal -- bash -c "node src/server.js; exec bash" 2>/dev/null \
|| x-terminal-emulator -e "node src/server.js" 2>/dev/null \
|| (node src/server.js &) 

echo "   Backend demarre sur http://localhost:4000"
echo

echo "[4/5] Attente du backend (3 secondes)..."
sleep 3

cd ..

echo "[5/5] Demarrage du frontend (port 5173)..."
gnome-terminal -- bash -c "npm run dev -- --host; exec bash" 2>/dev/null \
|| x-terminal-emulator -e "npm run dev -- --host" 2>/dev/null \
|| (npm run dev -- --host &)

echo "   Frontend demarre sur http://localhost:5173"
echo

echo "============================================"
echo "   Backend:  http://localhost:4000/api"
echo "   Frontend: http://localhost:5173"
echo "   Vendeur:  admin / password"
echo "============================================"
wait
