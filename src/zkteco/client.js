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
      const rawLines = data.toString().split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
      for (const line of rawLines) {
        console.log(`[ZKTeco Client] Datos recibidos del molinete:`, line);

        // 1. Si el molinete o simulador envía JSON
        try {
          const parsed = JSON.parse(line);
          const userId = parsed.userId || parsed.zkId || parsed.id || parsed.user_id;
          if (userId) {
            this.emit('verify', String(userId).trim(), parsed.timestamp || new Date().toISOString());
            continue;
          }
        } catch {
          // Continuar con parsers de texto plano
        }

        // 2. Si es formato con prefijo (VERIFY:, USER:, CARD:, ID:)
        const prefixMatch = line.match(/^(?:VERIFY|USER|CARD|ID|UID):(.*)$/i);
        if (prefixMatch) {
          const userId = prefixMatch[1].trim();
          if (userId) {
            this.emit('verify', userId, new Date().toISOString());
            continue;
          }
        }

        // 3. Ignorar respuestas de comandos internos como ACK:OPEN, ACK:DENY, etc.
        if (line.startsWith('ACK:') || line.startsWith('OK') || line === 'PONG') {
          continue;
        }

        // 4. Si es un ID alfanumérico directo (código de barra, QR o tarjeta RFID directa)
        if (/^[a-zA-Z0-9_-]{2,30}$/.test(line)) {
          this.emit('verify', line, new Date().toISOString());
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
    this.client.write('OPEN\r\n');
    return true;
  }

  denegarAcceso() {
    if (!this.isConnected || !this.client) return false;
    console.log(`[ZKTeco Client] ⛔ Enviando comando DENY al molinete...`);
    this.client.write('DENY\r\n');
    return true;
  }
}

module.exports = ZKTecoClient;
