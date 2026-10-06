#!/bin/bash
# ====================================================================
# LefTor Sport Gym - Actualizar Agente y Configurar Tótem Automáticamente
# ====================================================================
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "===================================================================="
echo "    🏋️  LefTor Sport Gym — Actualización Automática del Agente"
echo "===================================================================="
echo "[*] Directorio: $DIR"
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

echo "[1/4] Descargando última versión desde GitHub..."
git pull origin main

echo ""
echo "[2/4] Deteniendo proceso anterior del agente..."
# Matar instancias previas para liberar memoria RAM
pkill -f "dist/bundle.js" 2>/dev/null || true
pkill -f "src/index.js" 2>/dev/null || true
sleep 1

echo ""
echo "[3/4] Aplicando horario 00:00 - 23:59 (24/7) y sincronizando reloj oficial de Chile..."
"$NODE_BIN" scripts/aplicar-horario-00-2359.js

echo ""
echo "[4/4] Iniciando el agente de recepción con la nueva versión..."
mkdir -p "$DIR/logs"
nohup "$NODE_BIN" dist/bundle.js > "$DIR/logs/agent.log" 2>&1 &

sleep 2
if pgrep -f "dist/bundle.js" >/dev/null; then
    echo "✅ ¡Agente corriendo exitosamente en segundo plano! (PID: $(pgrep -f "dist/bundle.js" | head -n 1))"
else
    echo "⚠️ Iniciando en primer plano..."
    "$NODE_BIN" dist/bundle.js
fi

echo ""
echo "===================================================================="
echo "🎉 ¡LISTO! El tótem quedó con horario 00:00 - 23:59 y hora sincronizada."
echo "Los nuevos socios registrados tendrán acceso 24/7 automático."
echo "===================================================================="
echo ""
read -p "Presiona Enter para cerrar esta ventana..."
