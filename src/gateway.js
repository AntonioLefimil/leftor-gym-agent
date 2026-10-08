const io = require('socket.io-client');
const EventEmitter = require('events');

class GatewayClient extends EventEmitter {
  constructor(config) {
    super();
    this.serverUrl = config.url || 'https://api.leftorsport.cl';
    this.namespace = config.wsNamespace || '/agent';
    this.apiKey = config.apiKey || 'dev_agent_api_key_local';
    this.socket = null;
    this.isConnected = false;
  }

  conectar() {
    const fullUrl = `${this.serverUrl}${this.namespace}`;
    console.log(`[Gateway] Conectando WebSocket a ${fullUrl}...`);

    this.socket = io(fullUrl, {
      auth: { apiKey: this.apiKey },
      reconnection: true,
      reconnectionDelay: 3000,
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log(`[Gateway] ✅ Conectado con éxito al backend central en la nube`);
      this.emit('connected');
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      console.warn(`[Gateway] ⚠️ Desconectado del backend (${reason}). Conmutando a modo offline.`);
      this.emit('disconnected');
    });

    this.socket.on('connect_error', (err) => {
      console.error(`[Gateway] ❌ Error de conexión al backend:`, err.message);
    });

    // Eventos recibidos desde la nube
    this.socket.on('socioUpdated', (socio) => {
      console.log(`[Gateway] 📢 Evento 'socioUpdated' recibido:`, socio.nombre);
      this.emit('socioUpdated', socio);
    });

    this.socket.on('manualOpen', (data) => {
      console.log(`[Gateway] 🔓 Evento 'manualOpen' recibido desde el panel web`);
      this.emit('manualOpen', data);
    });

    this.socket.on('freePassage', (data) => {
      console.log(`[Gateway] ⏱️ Evento 'freePassage' recibido desde el panel web:`, data);
      this.emit('freePassage', data);
    });

    this.socket.on('configurarTotem', (data, ack) => {
      console.log(`[Gateway] ⚙️ Evento 'configurarTotem' recibido desde el backend:`, data);
      this.emit('configurarTotem', data, ack);
    });
  }

  /**
   * Consulta al servidor si el socio tiene acceso permitido
   */
  async verificarAcceso(zkId, timestamp = null, horaTotem = null) {
    return new Promise((resolve) => {
      if (!this.isConnected || !this.socket) {
        return resolve({ online: false });
      }

      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (this.socket) this.socket.off('accessResponse', onAccessResponse);
          resolve({ online: false, timeout: true });
        }
      }, 2500);

      const onAccessResponse = (res) => {
        if (!settled && res && (res.zkId === zkId || !res.zkId)) {
          settled = true;
          clearTimeout(timeout);
          if (this.socket) this.socket.off('accessResponse', onAccessResponse);
          resolve({ online: true, ...res });
        }
      };

      this.socket.on('accessResponse', onAccessResponse);

      this.socket.emit('accessRequest', { zkId, timestamp: timestamp || new Date().toISOString(), horaTotem }, (ackRes) => {
        if (!settled && ackRes) {
          settled = true;
          clearTimeout(timeout);
          if (this.socket) this.socket.off('accessResponse', onAccessResponse);
          resolve({ online: true, ...ackRes });
        }
      });
    });
  }

  /**
   * Sincroniza eventos ocurridos durante una caída de internet o historial masivo
   */
  sincronizarOffline(eventos) {
    if (!this.isConnected || !this.socket || !eventos || eventos.length === 0) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      console.log(`[Gateway] Sincronizando ${eventos.length} eventos al servidor en la nube...`);

      let terminado = false;
      const timeout = setTimeout(() => {
        if (!terminado) {
          terminado = true;
          this.socket.off('importHistoryResult', onResult);
          console.warn(`[Gateway] Aviso: timeout esperando confirmación de sincronización.`);
          resolve(null);
        }
      }, 30000);

      const onResult = (res) => {
        if (!terminado) {
          terminado = true;
          clearTimeout(timeout);
          this.socket.off('importHistoryResult', onResult);
          console.log(`[Gateway] ✅ Sincronización en la base de datos completada:`, res);
          resolve(res);
        }
      };

      this.socket.on('importHistoryResult', onResult);

      // Emitir importHistory con confirmación única (evita duplicidad)
      this.socket.emit('importHistory', { records: eventos }, (ack) => {
        if (ack) onResult(ack);
      });
    });
  }

  /**
   * Envía la lista de usuarios del tótem a la base de datos central
   */
  sincronizarUsuariosTotem(usuarios) {
    if (!this.isConnected || !this.socket || !usuarios || usuarios.length === 0) return;
    console.log(`[Gateway] 🔄 Enviando ${usuarios.length} socios desde el tótem hacia la base de datos central...`);
    this.socket.emit('syncTotemUsers', { users: usuarios }, (ack) => {
      console.log(`[Gateway] ✅ Sincronización de socios en la base de datos completada:`, ack);
    });
  }

  /**
   * Notifica a la nube el ID de tótem (zkId) asignado a un socio
   */
  sincronizarZkId(socioId, zkId) {
    if (!this.isConnected || !this.socket) return;
    this.socket.emit('updateSocioZkId', { socioId, zkId });
  }
}

module.exports = GatewayClient;
