#!/bin/bash
# ====================================================================
# LefTor Sport Gym - Test de Diagnóstico de Conexiones (macOS)
# ====================================================================
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "===================================================================="
echo "    LefTor Sport Gym - Test de Diagnóstico de Conexiones (Mac)"
echo "===================================================================="
echo ""
echo "Este script verifica si este Mac puede comunicarse con:"
echo "  1. El Totem / Molinete ZKTeco en la red local"
echo "  2. El Servidor central en la nube"
echo ""

if [ ! -f "config.json" ]; then
    echo "❌ [ERROR] No se encontró el archivo config.json en esta carpeta."
    read -p "Presiona Enter para salir..."
    exit 1
fi

# Detectar Node para extraer variables de config.json
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
elif [ -f "/usr/local/bin/node" ]; then
    NODE_BIN="/usr/local/bin/node"
elif [ -f "/opt/homebrew/bin/node" ]; then
    NODE_BIN="/opt/homebrew/bin/node"
fi

if [ -n "$NODE_BIN" ]; then
    TOTEM_IP=$("$NODE_BIN" -e "const c=require('./config.json'); console.log(c.molinete && c.molinete.ip ? c.molinete.ip : '192.168.1.201')")
    TOTEM_PORT=$("$NODE_BIN" -e "const c=require('./config.json'); console.log(c.molinete && c.molinete.puerto ? c.molinete.puerto : 4370)")
    SERVER_URL=$("$NODE_BIN" -e "const c=require('./config.json'); console.log(c.servidor && c.servidor.url ? c.servidor.url : 'https://api.leftorsport.cl')")
else
    TOTEM_IP=$(grep -o '"ip"[^,]*' config.json | head -1 | cut -d'"' -f4)
    TOTEM_PORT=$(grep -o '"puerto"[^,]*' config.json | head -1 | grep -o '[0-9]*')
    SERVER_URL=$(grep -o '"url"[^,]*' config.json | head -1 | cut -d'"' -f4)
fi

[ -z "$TOTEM_IP" ] && TOTEM_IP="192.168.1.201"
[ -z "$TOTEM_PORT" ] && TOTEM_PORT="4370"
[ -z "$SERVER_URL" ] && SERVER_URL="https://api.leftorsport.cl"

echo "--------------------------------------------------------------------"
echo "[1/2] Verificando conexión con el Molinete / Tótem"
echo "      IP: $TOTEM_IP   Puerto: $TOTEM_PORT"
echo "--------------------------------------------------------------------"

# PING
if ping -c 2 -W 2 "$TOTEM_IP" >/dev/null 2>&1; then
    echo "✅ [OK] El Totem responde al comando PING en $TOTEM_IP."
else
    echo "⚠️ [AVISO] No hubo respuesta al PING en $TOTEM_IP."
    echo "         - Verifica que el cable Ethernet o Wi-Fi esté conectado."
    echo "         - Verifica que el Mac y el molinete estén en el mismo rango de red."
fi

# TCP Port Check
echo "Probando si el puerto $TOTEM_PORT está abierto..."
if command -v nc >/dev/null 2>&1 && nc -z -w 3 "$TOTEM_IP" "$TOTEM_PORT" >/dev/null 2>&1; then
    echo "✅ [OK] Conexión TCP al puerto $TOTEM_PORT del molinete EXITOSA!"
elif [ -n "$NODE_BIN" ]; then
    TCP_RES=$("$NODE_BIN" -e "
    const net = require('net');
    const s = new net.Socket();
    s.setTimeout(3000);
    s.on('connect', () => { console.log('OK'); s.destroy(); process.exit(0); });
    s.on('timeout', () => { console.log('FAIL'); s.destroy(); process.exit(1); });
    s.on('error', () => { console.log('FAIL'); process.exit(1); });
    s.connect($TOTEM_PORT, '$TOTEM_IP');
    " 2>/dev/null)
    if [ "$TCP_RES" = "OK" ]; then
        echo "✅ [OK] Conexión TCP al puerto $TOTEM_PORT del molinete EXITOSA!"
    else
        echo "⚠️ [ADVERTENCIA] Puerto $TOTEM_PORT no respondió a la conexión TCP."
    fi
else
    echo "ℹ️  No se pudo verificar el puerto TCP (nc/node no disponibles)."
fi

echo ""
echo "--------------------------------------------------------------------"
echo "[2/2] Verificando conexión con el Servidor Central en la Nube"
echo "      URL: $SERVER_URL"
echo "--------------------------------------------------------------------"
if curl -s --connect-timeout 5 -I "$SERVER_URL" >/dev/null 2>&1; then
    echo "✅ [OK] Servidor en la nube respondiendo correctamente!"
else
    echo "⚠️ [AVISO] No se pudo contactar al servidor: $SERVER_URL"
fi

echo ""
echo "===================================================================="
echo "Fin del diagnóstico."
echo "Si las pruebas dieron [OK], puedes iniciar el agente con:"
echo "👉 doble clic en: iniciar-agente.command"
echo "===================================================================="
echo ""
read -p "Presiona Enter para cerrar esta ventana..."
