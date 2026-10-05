const ControlIDClient = require('../src/controlid/client');
const fs = require('fs');
const path = require('path');

// Cargar configuración si existe
let config = { ip: '192.168.0.100', port: 80 };
const configPath = path.resolve(__dirname, '../config.json');
if (fs.existsSync(configPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (raw.molinete) {
      config = { ...config, ...raw.molinete };
    }
  } catch (e) {
    console.warn('No se pudo leer config.json, usando defaults');
  }
}

console.log('====================================================');
console.log('⏰ CONFIGURACIÓN DE HORARIO 24/7 (00:00 - 23:59)');
console.log(`📡 Conectando a terminal Control iD en ${config.ip}:${config.port}...`);
console.log('====================================================\n');

const client = new ControlIDClient(config);

async function ejecutar() {
  try {
    await client.login();
    console.log('✅ Sesión iniciada con éxito en el tótem.\n');

    console.log('[*] Aplicando horario total (00:00 - 23:59) lunes a domingo a todos los socios...');
    const ok = await client.asegurarHorarioTotal();

    if (ok) {
      console.log('\n====================================================');
      console.log('🎉 ¡ÉXITO! Horario 00:00 a 23:59 aplicado y verificado.');
      console.log('Todos los usuarios del tótem tienen ahora acceso 24/7.');
      console.log('====================================================\n');
      process.exit(0);
    } else {
      console.error('\n❌ No se pudo completar la configuración del horario.');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ Error al conectar o configurar el tótem:', err.message);
    process.exit(1);
  }
}

ejecutar();
