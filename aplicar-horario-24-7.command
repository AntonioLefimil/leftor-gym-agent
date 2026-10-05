#!/bin/bash
# ====================================================================
# LefTor Sport Gym - Configurar Horario 24/7 (00:00 - 23:59) en Tótem
# ====================================================================
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "===================================================================="
echo "    ⏰ LefTor Sport Gym — Configurar Horario 00:00 a 23:59 (24/7)"
echo "===================================================================="
echo "[*] Este comando asegura que la zona horaria del tótem esté en"
echo "    00:00 a 23:59 de Lunes a Domingo y que todos los socios pertenezcan"
echo "    al grupo con acceso total."
echo ""

# Buscar ejecutable de Node.js en rutas estándar de macOS
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
elif [ -f "/usr/local/bin/node" ]; then
    NODE_BIN="/usr/local/bin/node"
elif [ -f "/opt/homebrew/bin/node" ]; then
    NODE_BIN="/opt/homebrew/bin/node"
elif [ -d "$HOME/.nvm/versions/node" ]; then
    LATEST_NVM=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)
    if [ -n "$LATEST_NVM" ] && [ -f "$HOME/.nvm/versions/node/$LATEST_NVM/bin/node" ]; then
        NODE_BIN="$HOME/.nvm/versions/node/$LATEST_NVM/bin/node"
    fi
fi

if [ -z "$NODE_BIN" ]; then
    echo "❌ [ERROR] No se encontró Node.js instalado en este Mac."
    read -p "Presiona Enter para cerrar..."
    exit 1
fi

echo "[*] Usando Node: $($NODE_BIN -v) desde $NODE_BIN"
echo ""

"$NODE_BIN" scripts/aplicar-horario-00-2359.js

echo ""
read -p "Presiona Enter para cerrar esta ventana..."
