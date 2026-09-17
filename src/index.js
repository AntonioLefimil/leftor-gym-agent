const fs = require('fs');
const path = require('path');
const ZKTecoClient = require('./zkteco/client');
const GatewayClient = require('./gateway');
const CacheManager = require('./cache');

// ─── Cargar Configuración ─────────────────────────────────────
const configPath = path.resolve(__dirname, '../config.json');
let config = {
  molinete: { ip: '127.0.0.1', puerto: 4370 },
  servidor: { url: 'https://api.leftorsport.cl', wsNamespace: '/agent', apiKey: 'dev_agent_api_key_local' },
  offline: { cachePath: './data/cache.json' }
};

if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e) {
    console.error('[Main] Error leyendo config.json, usando defaults:', e.message);
  }
}

console.log('====================================================');
console.log('🏋️  LefTor Sport Gym — Windows Reception Agent v1.0');
console.log('====================================================');

const cache = new CacheManager(config.offline?.cachePath);
const zkteco = new ZKTecoClient(config.molinete);
const gateway = new GatewayClient(config.servidor);

// ─── Eventos del WebSocket (Nube) ─────────────────────────────
gateway.on('connected', () => {
  console.log('[Main] Sincronizando pendientes offline si existen...');
  const pendientes = cache.obtenerPendientes();
  if (pendientes.length > 0) {
    gateway.sincronizarOffline(pendientes);
    cache.limpiarPendientes();
  }
});

gateway.on('socioUpdated', (socio) => {
  cache.actualizarSocio(socio);
});

gateway.on('manualOpen', (data) => {
  console.log(`[Main] 🔓 Orden de apertura manual recibida para recepcionista`);
  zkteco.abrirMolinete();
});

// ─── Eventos del Molinete (Hardware Local) ────────────────────
zkteco.on('verify', async (userId, timestamp) => {
  console.log(`\n----------------------------------------------------`);
  console.log(`🔍 [Lector Molinete] Verificación detectada para: ${userId}`);

  let accesoPermitido = false;
  let socioInfo = null;

  // 1. Intentar validar en la nube en tiempo real
  if (gateway.isConnected) {
    try {
      const resp = await gateway.verificarAcceso(userId);
      if (resp.online) {
        accesoPermitido = resp.permitido;
        socioInfo = resp.socio;
        console.log(`[Main] Validación Online: ${accesoPermitido ? 'PERMITIDO' : 'DENEGADO'} (Razón: ${resp.razon || 'OK'})`);
      }
    } catch (e) {
      console.warn(`[Main] Error en consulta online, recurriendo a caché local:`, e.message);
    }
  }

  // 2. Si no hay conexión o falló la nube, validar contra la caché SQLite local
  if (!socioInfo) {
    console.log(`[Main] ⚠️ Validando contra caché offline...`);
    const offlineCheck = cache.validarAccesoOffline(userId);
    accesoPermitido = offlineCheck.permitido;
    socioInfo = offlineCheck.socio;
    console.log(`[Main] Validación Offline: ${accesoPermitido ? 'PERMITIDO' : 'DENEGADO'} (Razón: ${offlineCheck.razon || 'OK'})`);

    // Encolar evento para cuando regrese internet
    cache.encolarEventoOffline({
      zkId: userId,
      socioId: socioInfo?.id,
      resultado: accesoPermitido ? 'PERMITIDO' : (offlineCheck.razon || 'DENEGADO_NO_ENCONTRADO'),
      timestamp: timestamp || new Date().toISOString()
    });
  }

  // 3. Ejecutar acción física en el molinete
  if (accesoPermitido) {
    console.log(`[Main] ✅ ACCESO AUTORIZADO — ${socioInfo?.nombre || userId}`);
    zkteco.abrirMolinete();
  } else {
    console.log(`[Main] ❌ ACCESO DENEGADO — ${socioInfo?.nombre || userId}`);
    zkteco.denegarAcceso();
  }
  console.log(`----------------------------------------------------\n`);
});

// ─── Iniciar conexiones ───────────────────────────────────────
zkteco.conectar();
gateway.conectar();
