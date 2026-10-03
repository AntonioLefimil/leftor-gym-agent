const http = require('http');
const fs = require('fs');
const path = require('path');

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

async function exportar() {
  console.log('🔒 [1/4] Conectando en modo SOLO LECTURA a Control iD...');
  const loginRes = await post('/login.fcgi', { login: 'admin', password: 'admin' });
  if (!loginRes.session) {
    throw new Error('No se pudo autenticar: ' + JSON.stringify(loginRes));
  }
  const session = loginRes.session;
  console.log('✅ Sesión establecida.');

  console.log('📋 [2/4] Extrayendo información de hardware y sistema...');
  const sysInfo = await post(`/system_information.fcgi?session=${session}`, {});

  console.log('👥 [3/4] Extrayendo usuarios completos del tótem...');
  const usersRes = await post(`/load_objects.fcgi?session=${session}`, { object: 'users' });
  const users = usersRes.users || [];

  console.log(`   -> ${users.length} usuarios encontrados.`);

  console.log('💳 Extrayendo tarjetas RFID asociadas...');
  const cardsRes = await post(`/load_objects.fcgi?session=${session}`, { object: 'cards' });
  const cards = cardsRes.cards || [];
  console.log(`   -> ${cards.length} tarjetas encontradas.`);

  console.log('👥 Extrayendo grupos de acceso...');
  const groupsRes = await post(`/load_objects.fcgi?session=${session}`, { object: 'groups' });
  const userGroupsRes = await post(`/load_objects.fcgi?session=${session}`, { object: 'user_groups' });

  console.log('📜 [4/4] Extrayendo registros de acceso (últimos 300)...');
  const logsRes = await post(`/load_objects.fcgi?session=${session}`, {
    object: 'access_logs',
    order: ['id', 'descending'],
    limit: 300
  });
  const logs = logsRes.access_logs || [];
  console.log(`   -> ${logs.length} registros de acceso obtenidos.`);

  // Guardar respaldo JSON seguro
  const backupDir = path.resolve(__dirname, '../data');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const backupFile = path.resolve(backupDir, 'respaldo-totem-controlid.json');
  const backupData = {
    fechaExtraccion: new Date().toISOString(),
    totem: {
      ip: TOTEM_IP,
      modelo: sysInfo.device_name || 'iDFace',
      serial: sysInfo.serial,
      versionFirmware: sysInfo.version,
      secboxVersion: sysInfo.secbox_version
    },
    totalUsuarios: users.length,
    usuarios: users,
    tarjetas: cards,
    grupos: groupsRes.groups || [],
    usuariosGrupos: userGroupsRes.user_groups || [],
    ultimosAccesos: logs
  };

  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log('\n======================================================');
  console.log('✅ RESPALDO COMPLETADO SIN RIESGO (100% SOLO LECTURA)');
  console.log(`📁 Archivo guardado en: ${backupFile}`);
  console.log(`📊 Resumen:`);
  console.log(`   - Modelo: ${backupData.totem.modelo} (Serial: ${backupData.totem.serial})`);
  console.log(`   - Total Socios en Tótem: ${users.length}`);
  console.log(`   - Total Tarjetas RFID: ${cards.length}`);
  console.log(`   - Registros de acceso extraídos: ${logs.length}`);
  console.log('======================================================');
}

exportar().catch(err => {
  console.error('❌ Error en extracción:', err.message);
});
