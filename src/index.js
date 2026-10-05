const fs = require('fs');
const path = require('path');
const ZKTecoClient = require('./zkteco/client');
const ControlIDClient = require('./controlid/client');
const GatewayClient = require('./gateway');
const CacheManager = require('./cache');

// ─── Configurar Registro de Logs en Archivo (logs/agent.log) ──
const projectDir = fs.existsSync(path.resolve(process.cwd(), 'config.json'))
  ? process.cwd()
  : path.resolve(__dirname, '..');
const logsDir = path.resolve(projectDir, 'logs');
if (!fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (_) {}
}

const logFilePath = path.join(logsDir, 'agent.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

function appendLog(level, args) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const text = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
    .join(' ');
  try {
    logStream.write(`[${ts}] [${level}] ${text}\n`);
  } catch (_) {}
}

const _origLog = console.log;
const _origWarn = console.warn;
const _origError = console.error;

console.log = (...args) => {
  _origLog(...args);
  appendLog('INFO', args);
};

console.warn = (...args) => {
  _origWarn(...args);
  appendLog('WARN', args);
};

console.error = (...args) => {
  _origError(...args);
  appendLog('ERROR', args);
};

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
  molinete: { ip: '192.168.0.100', puerto: 80 },
  servidor: { url: 'https://leftor-gym-app.onrender.com', wsNamespace: '/agent', apiKey: 'dev_agent_api_key_local' },
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

const molineteIp = (config.molinete && config.molinete.ip) || '192.168.0.100';
const molinetePuerto = (config.molinete && config.molinete.puerto) || 80;
const servidorUrl = (config.servidor && config.servidor.url) || 'https://leftor-gym-app.onrender.com';
const wsNamespace = (config.servidor && config.servidor.wsNamespace) || '';
const cachePath = (config.offline && config.offline.cachePath) || path.resolve(process.cwd(), 'data/cache.json');

console.log('====================================================');
console.log('🏋️   LefTor Sport Gym — Reception Agent');
console.log('====================================================');
console.log(`[Setup] Molinete IP: ${molineteIp}:${molinetePuerto}`);
console.log(`[Setup] Servidor:    ${servidorUrl}${wsNamespace}`);
console.log(`[Setup] Base Caché:  ${cachePath}`);
console.log(`[Setup] Archivo Log: ${logFilePath}`);
console.log('----------------------------------------------------\n');

const cache = new CacheManager(cachePath);

// Seleccionar cliente de hardware según puerto o tipo
const isControlID = molinetePuerto === 80 || config.molinete?.tipo === 'controlid';
const hardwareClient = isControlID
  ? new ControlIDClient(config.molinete || {})
  : new ZKTecoClient(config.molinete || {});

const gateway = new GatewayClient(config.servidor || {});

// ─── Eventos del WebSocket (Nube) ─────────────────────────────
gateway.on('connected', async () => {
  console.log('[Main] ✅ Conectado a la nube. Iniciando sincronización...');

  // 1. Sincronizar registros offline pendientes
  const pendientes = cache.obtenerPendientes();
  if (pendientes.length > 0) {
    gateway.sincronizarOffline(pendientes);
    cache.limpiarPendientes();
  }

  // 2. Extraer y enviar los socios del tótem hacia la base de datos central
  if (typeof hardwareClient.obtenerUsuariosCompletos === 'function') {
    try {
      console.log('[Main] 🔄 Extrayendo usuarios del tótem para sincronizar con la nube...');
      const usuarios = await hardwareClient.obtenerUsuariosCompletos();
      if (usuarios && usuarios.length > 0) {
        gateway.sincronizarUsuariosTotem(usuarios);
      }
    } catch (e) {
      console.warn('[Main] Aviso extrayendo usuarios del tótem:', e.message);
    }
  }

  // 3. Sincronizar historial de accesos del tótem con la base de datos central
  if (typeof hardwareClient.obtenerHistorialReciente === 'function') {
    try {
      console.log('[Main] 🔄 Consultando accesos históricos del tótem para sincronizar...');
      const historial = await hardwareClient.obtenerHistorialReciente(300);
      if (historial && historial.length > 0) {
        gateway.sincronizarOffline(historial);
      }
    } catch (e) {
      console.warn('[Main] Aviso sincronizando historial del tótem:', e.message);
    }
  }
});

// Cuando se detecta un nuevo usuario enrolado en el tótem
hardwareClient.on('usersChanged', (usuarios) => {
  console.log(`[Main] 🔄 Sincronizando ${usuarios.length} usuarios del tótem con la nube...`);
  if (gateway.isConnected) {
    gateway.sincronizarUsuariosTotem(usuarios);
  }
});

gateway.on('socioUpdated', async (socio) => {
  console.log(`[Main] 📢 Notificación recibida: Socio ${socio.nombre} actualizado en la web`);
  cache.actualizarSocio(socio);

  // Enviar inmediatamente al tótem (crear o actualizar en Control iD)
  if (typeof hardwareClient.crearOActualizarUsuario === 'function') {
    const res = await hardwareClient.crearOActualizarUsuario(socio);
    if (res && res.id && !socio.zkId) {
      gateway.sincronizarZkId(socio.id, String(res.id));
    }
  }
});

let modoPasoLibreHasta = null;

gateway.on('manualOpen', (data) => {
  console.log(`[Main] 🔓 Orden de apertura manual recibida desde recepción/panel web`);
  hardwareClient.abrirMolinete();
});

gateway.on('freePassage', (data) => {
  const minutos = data?.duracionMinutos || 15;
  modoPasoLibreHasta = Date.now() + (minutos * 60 * 1000);
  console.log(`[Main] ⏱️ Modo Paso Libre activado por ${minutos} minutos (hasta ${new Date(modoPasoLibreHasta).toLocaleTimeString()})`);
  hardwareClient.abrirMolinete();
});

// ─── Eventos del Molinete (Hardware Local) ────────────────────
hardwareClient.on('verify', async (userId, timestamp) => {
  console.log(`\n----------------------------------------------------`);
  console.log(`🔍 [Lector Molinete] Verificación detectada para: ${userId}`);

  // Si está activo el modo paso libre temporal, abrir de inmediato
  if (modoPasoLibreHasta && Date.now() < modoPasoLibreHasta) {
    console.log(`[Main] ⏱️ Paso Libre Temporal activo — Destrabando torniquete sin restricciones`);
    hardwareClient.abrirMolinete();
    return;
  }

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
    hardwareClient.abrirMolinete();
  } else {
    console.log(`[Main] ❌ ACCESO DENEGADO — ${nombreDisplay}`);
    hardwareClient.denegarAcceso();
  }
  console.log(`----------------------------------------------------\n`);
});

// ─── Iniciar conexiones ───────────────────────────────────────
hardwareClient.conectar();
gateway.conectar();

