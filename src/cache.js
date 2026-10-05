const fs = require('fs');
const path = require('path');

class CacheManager {
  constructor(filePath) {
    this.filePath = path.resolve(filePath || './data/cache.json');
    this.dirPath = path.dirname(this.filePath);
    this.data = {
      socios: {}, // zkId -> { rut, nombre, estado, vencimiento }
      eventosPendientes: [] // accesos registrados offline para sincronizar
    };
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(this.dirPath)) {
        fs.mkdirSync(this.dirPath, { recursive: true });
      }
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw);
      } else {
        this.guardar();
      }
    } catch (err) {
      console.error('[Cache] Error al inicializar caché local:', err.message);
    }
  }

  guardar() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Cache] Error guardando caché local:', err.message);
    }
  }

  actualizarSocio(socio) {
    if (!socio || !socio.zkId) return;
    this.data.socios[socio.zkId] = {
      id: socio.id,
      rut: socio.rut,
      nombre: socio.nombre,
      estado: socio.estado,
      vencimiento: socio.vencimiento ? new Date(socio.vencimiento).toISOString() : null,
      actualizadoEn: new Date().toISOString()
    };
    this.guardar();
    console.log(`[Cache] Socio ${socio.nombre} (${socio.zkId}) actualizado en caché local.`);
  }

  validarAccesoOffline(zkId) {
    const socio = this.data.socios[zkId];
    if (!socio) {
      return { permitido: false, razon: 'DENEGADO_NO_ENCONTRADO' };
    }
    if (socio.estado !== 'ACTIVO') {
      return { permitido: false, socio, razon: 'DENEGADO_SUSPENDIDO' };
    }
    if (socio.vencimiento) {
      const venc = new Date(socio.vencimiento);
      if (venc < new Date()) {
        return { permitido: false, socio, razon: 'DENEGADO_VENCIDA' };
      }
    }
    return { permitido: true, socio };
  }

  encolarEventoOffline(evento) {
    this.data.eventosPendientes.push({
      ...evento,
      timestamp: new Date().toISOString(),
      esOffline: true
    });
    this.guardar();
    console.log(`[Cache] Evento encolado en modo offline. Total pendientes: ${this.data.eventosPendientes.length}`);
  }

  obtenerPendientes() {
    return [...this.data.eventosPendientes];
  }

  limpiarPendientes() {
    this.data.eventosPendientes = [];
    this.guardar();
  }

  getSyncState() {
    return this.data.syncState || {
      historicoCompletado: false,
      ultimoLogId: 0,
      ultimoSync: null
    };
  }

  setSyncState(state) {
    this.data.syncState = { ...this.getSyncState(), ...state, ultimoSync: new Date().toISOString() };
    this.guardar();
  }
}

module.exports = CacheManager;
