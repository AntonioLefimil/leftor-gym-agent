const net = require('net');
const EventEmitter = require('events');

class ZKTecoClient extends EventEmitter {
  constructor(config) {
    super();
    this.ip = config.ip || '127.0.0.1';
    this.port = config.puerto || 4370;
    this.client = null;
    this.isConnected = false;
    this.reconnectTimer = null;
  }

  conectar() {
    console.log(`[ZKTeco Client] Conectando a molinete en ${this.ip}:${this.port}...`);
    this.client = new net.Socket();

    this.client.connect(this.port, this.ip, () => {
      this.isConnected = true;
      console.log(`[ZKTeco Client] ✅ Conectado con éxito al molinete en ${this.ip}:${this.port}`);
      this.emit('connected');
    });

    this.client.on('data', (data) => {
      const text = data.toString().trim();
      console.log(`[ZKTeco Client] Datos recibidos del molinete:`, text);

      // Si el molinete envía JSON (como el simulador o firmware reciente)
      try {
        const parsed = JSON.parse(text);
        if (parsed.event === 'VERIFY' || parsed.userId) {
          this.emit('verify', parsed.userId, parsed.timestamp);
          return;
        }
      } catch {
        // Si es texto plano (protocolo legacy)
        if (text.startsWith('VERIFY:')) {
          const parts = text.split(':');
          const userId = parts[1];
          this.emit('verify', userId, new Date().toISOString());
          return;
        }
      }
    });

    this.client.on('close', () => {
      if (this.isConnected) {
        console.warn(`[ZKTeco Client] ⚠️ Conexión con el molinete cerrada`);
      }
      this.isConnected = false;
      this.emit('disconnected');
      this.programarReconexion();
    });

    this.client.on('error', (err) => {
      console.error(`[ZKTeco Client] ❌ Error de comunicación con molinete:`, err.message);
      this.client.destroy();
    });
  }

  programarReconexion() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.conectar();
    }, 5000);
  }

  abrirMolinete() {
    if (!this.isConnected || !this.client) {
      console.warn(`[ZKTeco Client] No se puede abrir: molinete no conectado`);
      return false;
    }
    console.log(`[ZKTeco Client] 🔓 Enviando comando OPEN al molinete...`);
    this.client.write('OPEN\n');
    return true;
  }

  denegarAcceso() {
    if (!this.isConnected || !this.client) return false;
    console.log(`[ZKTeco Client] ⛔ Enviando comando DENY al molinete...`);
    this.client.write('DENY\n');
    return true;
  }
}

module.exports = ZKTecoClient;
