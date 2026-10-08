#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "===================================================================="
echo "    🏋️   LefTor Sport Gym — Análisis Comparativo de Horas"
echo "===================================================================="
echo ""

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
    echo "❌ Node.js no encontrado."
    read -p "Presiona Enter para cerrar..."
    exit 1
fi

"$NODE_BIN" scripts/analizar-horas-totem.js

echo ""
read -p "Presiona Enter para salir..."
