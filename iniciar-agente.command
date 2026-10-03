#!/bin/bash
# ====================================================================
# LefTor Sport Gym - Iniciar Agente de Recepción (macOS)
# ====================================================================
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "===================================================================="
echo "    🏋️   LefTor Sport Gym — Agente de Recepción (macOS)"
echo "===================================================================="
echo "[*] Directorio de ejecución: $DIR"
echo "[*] Presiona Ctrl + C en cualquier momento para detenerlo."
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
    echo ""
    echo "Pasos rápidos para instalarlo en Mac:"
    echo "1. Entra a: https://nodejs.org"
    echo "2. Descarga e instala la versión recomendada (archivo .pkg para macOS)"
    echo "3. Vuelve a hacer doble clic en este archivo."
    echo ""
    read -p "Presiona Enter para cerrar..."
    exit 1
fi

echo "[*] Usando Node: $($NODE_BIN -v) desde $NODE_BIN"
echo ""

# Priorizar bundle empaquetado (300KB autónomo sin dependencias sueltas) o src/index.js
if [ -f "dist/bundle.js" ]; then
    "$NODE_BIN" dist/bundle.js
elif [ -f "src/index.js" ]; then
    "$NODE_BIN" src/index.js
else
    echo "❌ [ERROR] No se encontró dist/bundle.js ni src/index.js"
    read -p "Presiona Enter para cerrar..."
    exit 1
fi

echo ""
echo "[*] El agente se ha detenido."
read -p "Presiona Enter para cerrar..."
