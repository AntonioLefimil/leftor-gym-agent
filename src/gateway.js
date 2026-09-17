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
  }

  /**
   * Consulta al servidor si el socio tiene acceso permitido
   */
  async verificarAcceso(zkId) {
    return new Promise((resolve) => {
      if (!this.isConnected || !this.socket) {
        return resolve({ online: false });
      }

      const timeout = setTimeout(() => {
        resolve({ online: false, timeout: true });
      }, 2500);

      this.socket.emit('accessAttempt', { zkId, timestamp: new Date().toISOString() }, (res) => {
        clearTimeout(timeout);
        resolve({ online: true, ...res });
      });
    });
  }

  /**
   * Sincroniza eventos ocurridos durante una caída de internet
   */
  sincronizarOffline(eventos) {
    if (!this.isConnected || !this.socket || !eventos || eventos.length === 0) return;
    console.log(`[Gateway] Sincronizando ${eventos.length} eventos offline al servidor...`);
    this.socket.emit('syncOfflineEvents', { records: eventos }, (ack) => {
      console.log(`[Gateway] ✅ Sincronización offline completada:`, ack);
    });
  }
}

module.exports = GatewayClient;
