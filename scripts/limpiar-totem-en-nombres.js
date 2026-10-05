/**
 * Script para limpiar sufijo o apellido 'Tótem' / 'Totem' de todos los socios en la base de datos
 */

const https = require('https');

const RENDER_BASE = 'leftor-gym-app.onrender.com';
const ADMIN_EMAIL = 'admin@leftorsport.cl';
const ADMIN_PASS = 'admin123';

function requestJson(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: RENDER_BASE,
      port: 443,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) });
        } catch {
          resolve({ status: res.statusCode, data: d });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('🧹 Limpiando "Tótem" de los nombres en la base de datos...\n');

  // 1. Login
  const loginRes = await requestJson({
    path: '/api/auth/login',
    method: 'POST'
  }, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASS
  });

  const token = loginRes.data.accessToken;

  // 2. Obtener lista completa de socios
  const sociosRes = await requestJson({
    path: '/api/socios?limite=100',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });

  const socios = sociosRes.data?.data || [];
  console.log(`📋 Total socios analizados: ${socios.length}`);

  let limpiados = 0;

  for (const s of socios) {
    let actualizar = false;
    let nuevoApellido = s.apellido;
    let nuevoNombre = s.nombre;

    // Si el apellido es exactamente Tótem o Totem
    if (nuevoApellido && (nuevoApellido.trim().toLowerCase() === 'tótem' || nuevoApellido.trim().toLowerCase() === 'totem')) {
      nuevoApellido = '';
      actualizar = true;
    } else if (nuevoApellido && (nuevoApellido.includes('Tótem') || nuevoApellido.includes('Totem'))) {
      nuevoApellido = nuevoApellido.replace(/tótem/gi, '').trim();
      actualizar = true;
    }

    // Si el nombre contiene Tótem o Totem
    if (nuevoNombre && (nuevoNombre.includes('Tótem') || nuevoNombre.includes('Totem'))) {
      nuevoNombre = nuevoNombre.replace(/tótem/gi, '').trim();
      actualizar = true;
    }

    if (actualizar) {
      console.log(`Limpiando socio #${s.zkId || s.id}: "${s.nombre} ${s.apellido}" -> "${nuevoNombre}"`);
      await requestJson({
        path: `/api/socios/${s.id}`,
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      }, {
        nombre: nuevoNombre,
        apellido: nuevoApellido
      });
      limpiados++;
    }
  }

  console.log(`\n✅ Proceso finalizado. Total socios corregidos y limpiados: ${limpiados}`);
}

run().catch(console.error);
