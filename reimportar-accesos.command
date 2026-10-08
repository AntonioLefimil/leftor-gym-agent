#!/bin/bash
# ====================================================================
# LefTor Sport Gym - Reimportar Historial Completo desde el Tótem (macOS)
# ====================================================================
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "===================================================================="
echo "    🏋️   LefTor Sport Gym — Re-extracción Completa desde Tótem"
echo "===================================================================="
echo "[*] Limpiando cursor de sincronización para forzar extracción desde el log #1..."

NODE_BIN=""
if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
elif [ -f "/usr/local/bin/node" ]; then
    NODE_BIN="/usr/local/bin/node"
elif [ -f "/opt/homebrew/bin/node" ]; then
    NODE_BIN="/opt/homebrew/bin/node"
fi

if [ -n "$NODE_BIN" ]; then
    "$NODE_BIN" -e '
    const fs = require("fs");
    const file = "./data/cache.json";
    if (fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        if (data.syncState) {
          data.syncState.historicoCompletado = false;
          data.syncState.historicoConfirmadoPorServidor = false;
          data.syncState.ultimoLogId = 0;
        }
        fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
        console.log("[*] ✅ Caché reseteado. El agente extraerá el 100% de los logs del tótem.");
      } catch(e) {
        console.warn("Aviso:", e.message);
      }
    }
    '
fi

echo "[*] Conectando con el tótem y reimportando todo el historial..."
echo ""

./iniciar-agente.command
