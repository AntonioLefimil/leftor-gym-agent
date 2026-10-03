/**
 * Script de Sincronización e Importación de Usuarios del Tótem a Render
 * Valida RUT con Módulo 11 y marca 'actualizarRut: true' si no es válido.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuración de conexión a Render
const RENDER_BASE = 'https://leftor-gym-app.onrender.com';
const ADMIN_EMAIL = 'admin@leftorsport.cl';
const ADMIN_PASS = 'admin123';

// ─── Utilidad Módulo 11 ───────────────────────────────────────
function validarRutChileno(rut) {
  if (!rut || typeof rut !== 'string') return false;
  const limpio = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 7 || limpio.length > 9) return false;

  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;

  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = suma % 11;
  const resultado = 11 - resto;
  const dvEsperado = resultado === 11 ? '0' : resultado === 10 ? 'K' : resultado.toString();
  return dv === dvEsperado;
}

function formatearRutChileno(rut) {
  const limpio = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 2) return limpio;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  let formateado = '';
  let count = 0;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    formateado = cuerpo[i] + formateado;
    count++;
    if (count % 3 === 0 && i > 0) {
      formateado = '.' + formateado;
    }
  }
  return `${formateado}-${dv}`;
}

// ─── Cliente HTTP ─────────────────────────────────────────────
function requestJson(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      timeout: 15000
    };

    const req = https.request(reqOptions, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const parsed = rawData ? JSON.parse(rawData) : null;
          resolve({ status: res.statusCode, data: parsed, raw: rawData });
        } catch (e) {
          resolve({ status: res.statusCode, raw: rawData, data: null });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout conectando a ' + url));
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// ─── Flujo Principal de Sincronización ─────────────────────────
async function run() {
  console.log('====================================================');
  console.log('🔄 Sincronizando usuarios del Tótem a la Base de Datos');
  console.log('   Destino: ' + RENDER_BASE);
  console.log('====================================================\n');

  // 1. Iniciar sesión como admin en Render
  console.log('1️⃣ Iniciando sesión como administrador en Render...');
  const loginRes = await requestJson(`${RENDER_BASE}/api/auth/login`, {
    method: 'POST'
  }, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASS
  });

  if (!loginRes.data || !loginRes.data.accessToken) {
    console.error('❌ Error al iniciar sesión en Render:', loginRes.raw);
    process.exit(1);
  }

  const token = loginRes.data.accessToken;
  console.log('✅ Sesión iniciada con éxito.\n');

  // 2. Obtener lista actual de socios en Render para evitar duplicados
  console.log('2️⃣ Consultando socios existentes en la nube...');
  const sociosRes = await requestJson(`${RENDER_BASE}/api/socios?limite=1000`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const sociosExistentes = sociosRes.data?.data || sociosRes.data?.socios || (Array.isArray(sociosRes.data) ? sociosRes.data : []);
  console.log(`ℹ️ Hay ${sociosExistentes.length} socios registrados actualmente en Render.`);

  const mapZkId = new Set();
  const mapRut = new Set();
  sociosExistentes.forEach((s) => {
    if (s.zkId) mapZkId.add(String(s.zkId));
    if (s.rut) mapRut.add(s.rut.toUpperCase());
  });

  // 3. Cargar respaldo del tótem
  const backupPath = path.resolve(__dirname, '../data/respaldo-totem-controlid.json');
  if (!fs.existsSync(backupPath)) {
    console.error('❌ No se encontró el archivo de respaldo en:', backupPath);
    process.exit(1);
  }

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const usuarios = backup.usuarios || [];
  console.log(`ℹ️ Se encontraron ${usuarios.length} usuarios en el respaldo del tótem.\n`);

  // 4. Sincronizar cada usuario
  console.log('3️⃣ Procesando e importando usuarios...');
  let creados = 0;
  let omitidos = 0;
  let errores = 0;

  for (const u of usuarios) {
    const rawName = (u.name || '').trim();
    const zkId = String(u.id);

    // Omitir nombres completamente vacíos o que sean claramente de prueba "BORRAR"
    if (!rawName || rawName.toUpperCase() === 'BORRAR') {
      omitidos++;
      continue;
    }

    // Parsear nombre y apellido
    const partes = rawName.split(/\s+/);
    const nombre = partes[0] || 'Socio';
    const apellido = partes.slice(1).join(' ') || 'Tótem';

    // Validar RUT con Módulo 11
    const tieneRutValido = validarRutChileno(u.registration);
    let rutFinal = tieneRutValido
      ? formatearRutChileno(u.registration)
      : `TOTEM-${String(u.id).padStart(4, '0')}`;

    // Si ya existe por zkId o por RUT, no duplicar
    if (mapZkId.has(zkId) || mapRut.has(rutFinal.toUpperCase())) {
      console.log(`⏭️ [ID ${zkId}] ${nombre} ${apellido} ya existe en Render. Omitiendo.`);
      omitidos++;
      continue;
    }

    // Crear en Render
    try {
      const payload = {
        nombre,
        apellido,
        rut: rutFinal,
        zkId
      };

      const res = await requestJson(`${RENDER_BASE}/api/socios`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }, payload);

      if (res.status === 201 || res.status === 200) {
        creados++;
        mapZkId.add(zkId);
        mapRut.add(rutFinal.toUpperCase());
        console.log(`✅ [${creados}] Creado: ${nombre} ${apellido} (zkId: ${zkId}, RUT: ${rutFinal}) ${tieneRutValido ? '' : '⚠️ [Requiere RUT]'}`);
      } else {
        errores++;
        console.warn(`⚠️ Error creando ID ${zkId} (${nombre} ${apellido}):`, res.raw);
      }
    } catch (err) {
      errores++;
      console.error(`❌ Error en petición para ID ${zkId}:`, err.message);
    }
  }

  console.log('\n====================================================');
  console.log(`🎉 Sincronización Completa:`);
  console.log(`   - Nuevos socios creados en la BD: ${creados}`);
  console.log(`   - Omitidos (ya existían o 'BORRAR'): ${omitidos}`);
  console.log(`   - Errores: ${errores}`);
  console.log('====================================================\n');
}

run().catch((err) => {
  console.error('Fatal error:', err);
});
