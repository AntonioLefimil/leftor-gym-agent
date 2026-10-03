#!/bin/bash
# ====================================================================
# LefTor Sport Gym - Desinstalar Servicio Automático en Mac
# ====================================================================
PLIST_PATH="$HOME/Library/LaunchAgents/cl.leftorsport.gymagent.plist"

echo "===================================================================="
echo "    Desinstalar Agente LefTor Gym (macOS)"
echo "===================================================================="
echo ""

if [ -f "$PLIST_PATH" ]; then
    launchctl unload "$PLIST_PATH" 2>/dev/null
    rm -f "$PLIST_PATH"
    echo "✅ [OK] Servicio detenido y eliminado de LaunchAgents."
    echo "   El agente ya no iniciará automáticamente."
else
    echo "ℹ️  No se encontró ningún servicio instalado en $PLIST_PATH."
fi

echo ""
read -p "Presiona Enter para cerrar esta ventana..."
