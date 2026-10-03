const fs = require('fs');
const path = require('path');
const ZKTecoClient = require('./zkteco/client');
const GatewayClient = require('./gateway');
const CacheManager = require('./cache');

// ─── Cargar Configuración ─────────────────────────────────────
const execDir = path.dirname(process.execPath);
const candidateConfigPaths = [
  path.resolve(process.cwd(), 'config.json'),
  path.resolve(execDir, 'config.json'),
  path.resolve(__dirname, '../config.json'),
  path.resolve(__dirname, 'config.json')
];

let configPath = candidateConfigPaths.find((p) => fs.existsSync(p)) || candidateConfigPaths[0];
let config = {
  molinete: { ip: '192.168.1.201', puerto: 4370 },
  servidor: { url: 'https://api.leftorsport.cl', wsNamespace: '/agent', apiKey: 'dev_agent_api_key_local' },
  offline: { cachePath: path.resolve(process.cwd(), 'data/cache.json') }
};

if (fs.existsSync(configPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config = { ...config, ...parsed };
    console.log(`[Config] Cargada configuración desde: ${configPath}`);
  } catch (e) {
    console.error('[Config] Error leyendo config.json, usando defaults:', e.message);
  }
} else {
  console.warn(`[Config] No se encontró config.json en las rutas esperadas. Usando valores por defecto.`);
}

// Resolver ruta de caché
if (config.offline && config.offline.cachePath && !path.isAbsolute(config.offline.cachePath)) {
  config.offline.cachePath = path.resolve(process.cwd(), config.offline.cachePath);
}

const molineteIp = (config.molinete && config.molinete.ip) || '192.168.1.201';
const molinetePuerto = (config.molinete && config.molinete.puerto) || 4370;
const servidorUrl = (config.servidor && config.servidor.url) || 'https://api.leftorsport.cl';
const wsNamespace = (config.servidor && config.servidor.wsNamespace) || '';
const cachePath = (config.offline && config.offline.cachePath) || path.resolve(process.cwd(), 'data/cache.json');

console.log('====================================================');
console.log('🏋️   LefTor Sport Gym — Reception Agent');
console.log('====================================================');
console.log(`[Setup] Molinete IP: ${molineteIp}:${molinetePuerto}`);
console.log(`[Setup] Servidor:    ${servidorUrl}${wsNamespace}`);
console.log(`[Setup] Base Caché:  ${cachePath}`);
console.log('----------------------------------------------------\n');

const cache = new CacheManager(cachePath);
const zkteco = new ZKTecoClient(config.molinete || {});
const gateway = new GatewayClient(config.servidor || {});

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
  console.log(`[Main] 🔓 Orden de apertura manual recibida desde recepción/panel web`);
  zkteco.abrirMolinete();
});

// ─── Eventos del Molinete (Hardware Local) ────────────────────
zkteco.on('verify', async (userId, timestamp) => {
  console.log(`\n----------------------------------------------------`);
  console.log(`🔍 [Lector Molinete] Verificación detectada para: ${userId}`);

  let accesoPermitido = false;
  let socioInfo = null;
  let validadoOnline = false;

  // 1. Intentar validar en la nube en tiempo real
  if (gateway.isConnected) {
    try {
      const resp = await gateway.verificarAcceso(userId);
      if (resp && resp.online) {
        validadoOnline = true;
        accesoPermitido = Boolean(resp.permitido);
        socioInfo = resp.socio || { nombre: `Usuario ${userId}` };
        console.log(`[Main] Validación Online: ${accesoPermitido ? '✅ PERMITIDO' : '❌ DENEGADO'} (Razón: ${resp.razon || resp.resultado || 'OK'})`);
      }
    } catch (e) {
      console.warn(`[Main] Error en consulta online, recurriendo a caché local:`, e.message);
    }
  }

  // 2. Si no hay conexión o falló la consulta a la nube, validar contra la caché SQLite/JSON local
  if (!validadoOnline) {
    console.log(`[Main] ⚠️ Sin conexión online. Validando contra caché local offline...`);
    const offlineCheck = cache.validarAccesoOffline(userId);
    accesoPermitido = offlineCheck.permitido;
    socioInfo = offlineCheck.socio || { nombre: `Usuario ${userId}` };
    console.log(`[Main] Validación Offline: ${accesoPermitido ? '✅ PERMITIDO' : '❌ DENEGADO'} (Razón: ${offlineCheck.razon || 'OK'})`);

    // Encolar evento para cuando regrese internet
    cache.encolarEventoOffline({
      zkId: userId,
      socioId: socioInfo && socioInfo.id ? socioInfo.id : null,
      resultado: accesoPermitido ? 'PERMITIDO' : (offlineCheck.razon || 'DENEGADO_NO_ENCONTRADO'),
      timestamp: timestamp || new Date().toISOString()
    });
  }

  // 3. Ejecutar acción física en el molinete
  const nombreDisplay = (socioInfo && socioInfo.nombre) ? socioInfo.nombre : userId;
  if (accesoPermitido) {
    console.log(`[Main] ✅ ACCESO AUTORIZADO — ${nombreDisplay}`);
    zkteco.abrirMolinete();
  } else {
    console.log(`[Main] ❌ ACCESO DENEGADO — ${nombreDisplay}`);
    zkteco.denegarAcceso();
  }
  console.log(`----------------------------------------------------\n`);
});

// ─── Iniciar conexiones ───────────────────────────────────────
zkteco.conectar();
gateway.conectar();
