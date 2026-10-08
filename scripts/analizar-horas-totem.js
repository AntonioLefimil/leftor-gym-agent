const http = require('http');

const TOTEM_IP = '192.168.0.100';

function post(endpoint, data = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: TOTEM_IP,
      port: 80,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 5000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (e) {
          resolve({ raw: body });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(payload);
    req.end();
  });
}

function formatearFecha(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${dia}/${m}/${y} ${h}:${min}:${s}`;
}

async function run() {
  console.log('========================================================================');
  console.log('🔍 ANÁLISIS DE TIEMPOS: HORA MOLINETE vs HORA BD vs HORA FINAL SANTIAGO');
  console.log('========================================================================\n');

  console.log('1. Conectando al tótem en http://' + TOTEM_IP + '...');
  const loginRes = await post('/login.fcgi', { login: 'admin', password: 'admin' });
  if (!loginRes.session) {
    console.error('❌ Error de autenticación:', loginRes);
    return;
  }
  const session = loginRes.session;

  console.log('2. Obteniendo nombres de usuarios...');
  const usersRes = await post(`/load_objects.fcgi?session=${session}`, { object: 'users' });
  const userMap = new Map();
  (usersRes.users || []).forEach(u => userMap.set(String(u.id), u.name));

  console.log('3. Extrayendo muestra de logs históricos del tótem (incluyendo 15 de julio)...');
  // Extraer todos los logs para buscar específicamente el 15 de julio
  let offset = 0;
  const batchSize = 100;
  const targetLogs = [];

  while (offset < 2500) {
    const res = await post(`/load_objects.fcgi?session=${session}`, {
      object: 'access_logs',
      order: ['time', 'ascending'],
      limit: batchSize,
      offset: offset
    });
    const logs = res.access_logs || [];
    if (logs.length === 0) break;

    for (const log of logs) {
      const dRaw = new Date(log.time * 1000);
      const diaStr = `${dRaw.getUTCFullYear()}-${String(dRaw.getUTCMonth() + 1).padStart(2, '0')}-${String(dRaw.getUTCDate()).padStart(2, '0')}`;
      if (diaStr === '2026-07-15' || diaStr === '2026-07-02' || diaStr === '2026-07-01') {
        targetLogs.push(log);
      }
    }

    offset += logs.length;
    if (logs.length < batchSize) break;
  }

  console.log(`\n📋 Encontrados ${targetLogs.length} logs en las fechas clave (ej: 15 de Julio, 02 de Julio):\n`);
  console.log('| ID Log | ID Socio | Nombre Socio            | Hora Molinete (Raw) | Hora BD (UTC)         | Hora Final (Chile) |');
  console.log('|--------|----------|-------------------------|---------------------|-----------------------|--------------------|');

  for (const log of targetLogs) {
    const userId = String(log.user_id || log.card_value || '0');
    const nombre = (userMap.get(userId) || 'Desconocido').padEnd(23).substring(0, 23);

    // Hora original que el molinete tiene guardada
    const dRaw = new Date(log.time * 1000);
    const horaMolinete = formatearFecha(dRaw);

    // Conversión a ISO UTC considerando offset de invierno (-04:00) o verano (-03:00)
    const month = dRaw.getUTCMonth() + 1;
    const offsetChile = (month >= 5 && month <= 8) ? '-04:00' : '-03:00';
    const y = dRaw.getUTCFullYear();
    const m = String(month).padStart(2, '0');
    const d = String(dRaw.getUTCDate()).padStart(2, '0');
    const h = String(dRaw.getUTCHours()).padStart(2, '0');
    const min = String(dRaw.getUTCMinutes()).padStart(2, '0');
    const s = String(dRaw.getUTCSeconds()).padStart(2, '0');

    const isoDate = new Date(`${y}-${m}-${d}T${h}:${min}:${s}${offsetChile}`);
    const horaBD = isoDate.toISOString();

    // Hora final formateada en America/Santiago
    const horaFinal = isoDate.toLocaleTimeString('es-CL', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    console.log(`| #${String(log.id).padEnd(5)} | ${userId.padEnd(8)} | ${nombre} | ${horaMolinete} | ${horaBD} | ${horaFinal} hrs         |`);
  }

  console.log('\n========================================================================\n');
}

run().catch(console.error);
