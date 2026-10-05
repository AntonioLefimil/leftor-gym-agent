#!/bin/bash
# ====================================================================
# LefTor Sport Gym - Instalar Servicio Automático en Mac (LaunchAgent)
# ====================================================================
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "===================================================================="
echo "    Instalar Agente LefTor Gym como Servicio en Segundo Plano (Mac)"
echo "===================================================================="
echo ""

# Buscar ejecutable de Node.js
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
    echo "❌ [ERROR] No se encontró Node.js. Por favor instálalo desde nodejs.org antes de continuar."
    read -p "Presiona Enter para cerrar..."
    exit 1
fi

mkdir -p "$DIR/logs"
mkdir -p "$DIR/data"
mkdir -p "$HOME/Library/LaunchAgents"

PLIST_PATH="$HOME/Library/LaunchAgents/cl.leftorsport.gymagent.plist"

TARGET_JS="$DIR/dist/bundle.js"
if [ ! -f "$TARGET_JS" ]; then
    TARGET_JS="$DIR/src/index.js"
fi

cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>cl.leftorsport.gymagent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$TARGET_JS</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$DIR/logs/service.log</string>
    <key>StandardErrorPath</key>
    <string>$DIR/logs/agent-error.log</string>
</dict>
</plist>
EOF

# Descargar si existía previamente y volver a cargar
launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl load "$PLIST_PATH"

echo "✅ [OK] ¡Servicio instalado e iniciado exitosamente!"
echo ""
echo "Detalles:"
echo " - El agente ahora arrancará SOLO cada vez que se prenda el Mac o inicie sesión."
echo " - Si se cae o reinicia, macOS lo volverá a levantar automáticamente."
echo " - Puedes revisar los registros en tiempo real en:"
echo "   $DIR/logs/agent.log"
echo ""
read -p "Presiona Enter para cerrar esta ventana..."
