const http = require('http');
const EventEmitter = require('events');

class ControlIDClient extends EventEmitter {
  constructor(config = {}) {
    super();
    this.ip = config.ip || '192.168.0.100';
    this.port = config.puerto || 80;
    this.user = config.user || 'admin';
    this.password = config.password || 'admin';
    this.session = null;
    this.isConnected = false;
    this.pollInterval = null;
    this.lastLogId = null;
    this.isPolling = false;
  }

  // ─── Petición HTTP auxiliar ─────────────────────────────────
  async _request(path, method = 'POST', data = null) {
    return new Promise((resolve, reject) => {
      const payload = data ? JSON.stringify(data) : '{}';
      const options = {
        hostname: this.ip,
        port: this.port,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 4000
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body || '{}');
            resolve({ status: res.statusCode, data: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, raw: body });
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout de conexión a Control iD'));
      });

      req.write(payload);
      req.end();
    });
  }

  // ─── Iniciar Sesión ─────────────────────────────────────────
  async login() {
    try {
      const res = await this._request('/login.fcgi', 'POST', {
        login: this.user,
        password: this.password
      });

      if (res.data && res.data.session) {
        this.session = res.data.session;
        return this.session;
      }
      throw new Error(res.data?.error || 'No se obtuvo sesión en login.fcgi');
    } catch (e) {
      this.session = null;
      throw e;
    }
  }

  // ─── Conectar y Monitorear ──────────────────────────────────
  async conectar() {
    console.log(`[Control iD] Conectando a terminal en http://${this.ip}:${this.port}...`);
    try {
      await this.login();
      this.isConnected = true;
      console.log(`[Control iD] ✅ Conectado con éxito a terminal iDFace en http://${this.ip}:${this.port}`);
      this.emit('connected');

      // Inicializar el último ID de log para no reaccionar a accesos antiguos
      await this._inicializarUltimoLog();

      // Iniciar sondeo en tiempo real de nuevos accesos cada 1 segundo
      this._iniciarSondeo();
    } catch (err) {
      this.isConnected = false;
      console.error(`[Control iD] ❌ Error conectando a terminal:`, err.message);
      this.emit('disconnected');
      setTimeout(() => this.conectar(), 5000);
    }
  }

  async _inicializarUltimoLog() {
    try {
      const res = await this._request(`/load_objects.fcgi?session=${this.session}`, 'POST', {
        object: 'access_logs',
        order: ['time', 'descending'],
        limit: 1
      });

      if (res.data && res.data.access_logs && res.data.access_logs.length > 0) {
        this.lastLogId = res.data.access_logs[0].id;
        console.log(`[Control iD] 📋 Último log registrado en el tótem: ID #${this.lastLogId}`);
      }
    } catch (e) {
      console.warn(`[Control iD] Aviso al obtener último log inicial:`, e.message);
    }
  }

  _iniciarSondeo() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => this._pollNuevosLogs(), 1000);

    // Sondeo periódico de nuevos usuarios enrolados en el tótem cada 30 segundos
    if (this.userPollInterval) clearInterval(this.userPollInterval);
    this.userPollInterval = setInterval(() => this._pollNuevosUsuarios(), 30000);
  }

  async _pollNuevosUsuarios() {
    if (!this.isConnected || !this.session) return;
    try {
      const res = await this._request(`/load_objects.fcgi?session=${this.session}`, 'POST', {
        object: 'users'
      });
      const users = res.data?.users || [];
      if (this.lastKnownUserCount === undefined) {
        this.lastKnownUserCount = users.length;
        return;
      }
      if (users.length !== this.lastKnownUserCount) {
        console.log(`[Control iD] 🆕 Cambio detectado en usuarios del tótem (${this.lastKnownUserCount} -> ${users.length}). Extrayendo fotos de perfil...`);
        this.lastKnownUserCount = users.length;

        // Intentar enriquecer fotos de los usuarios más recientes
        for (const u of users) {
          if (!u.foto) {
            try {
              const foto = await this.obtenerFotoUsuario(u.id);
              if (foto) u.foto = foto;
            } catch (_) {}
          }
        }

        this.emit('usersChanged', users);
      }
    } catch (e) {
      // Error silencioso en polling de usuarios
    }
  }

  async _pollNuevosLogs() {
    if (this.isPolling || !this.isConnected) return;
    this.isPolling = true;

    try {
      const res = await this._request(`/load_objects.fcgi?session=${this.session}`, 'POST', {
        object: 'access_logs',
        order: ['time', 'descending'],
        limit: 5
      });

      // Si la sesión expiró, renovar sesión
      if (res.data && res.data.error === 'Invalid session') {
        console.log('[Control iD] Sesión expirada, renovando login...');
        await this.login();
        this.isPolling = false;
        return;
      }

      const logs = res.data?.access_logs || [];
      if (logs.length > 0) {
        // Filtrar solo los logs nuevos que sean posteriores a lastLogId
        const nuevos = [];
        for (const log of logs) {
          if (this.lastLogId === null || log.id > this.lastLogId) {
            nuevos.push(log);
          } else {
            break;
          }
        }

        if (nuevos.length > 0) {
          // Actualizar cursor del último log visto
          this.lastLogId = Math.max(...nuevos.map(l => l.id));

          // Procesar en orden cronológico (más antiguo a más nuevo)
          nuevos.reverse().forEach(log => {
            // event 7 = Identificado/Autorizado, event 3 = Desconocido
            const userId = String(log.user_id || log.card_value || '0');
            const timestamp = new Date((log.time || Math.floor(Date.now() / 1000)) * 1000).toISOString();
            console.log(`[Control iD] 🔔 Evento detectado: ID #${log.id} — Usuario ZK: ${userId} (evento: ${log.event})`);
            this.emit('verify', userId, timestamp);
          });
        }
      }
    } catch (e) {
      // Error silencioso en sondeo para no saturar consola, reintentará en el próximo segundo
    } finally {
      this.isPolling = false;
    }
  }

  // ─── Abrir Molinete / Relé ──────────────────────────────────
  async abrirMolinete() {
    console.log(`[Control iD] 🔓 Enviando comando de apertura al relé del molinete (SecBox)...`);
    try {
      if (!this.session) await this.login();

      const res = await this._request(`/execute_actions.fcgi?session=${this.session}`, 'POST', {
        actions: [
          { action: 'sec_box', parameters: 'id=65793, reason=1' },
          { action: 'door', parameters: 'door=1' }
        ]
      });

      if (res.data && res.data.actions && res.data.actions.some(a => a.status === 'allowed')) {
        console.log(`[Control iD] ✅ Molinete destrabado con éxito (Relé SecBox activado)`);
        return true;
      } else {
        console.warn(`[Control iD] ⚠️ Respuesta de apertura:`, JSON.stringify(res.data));
        return false;
      }
    } catch (e) {
      console.error(`[Control iD] ❌ Error enviando apertura al molinete:`, e.message);
      return false;
    }
  }

  denegarAcceso() {
    console.log(`[Control iD] ⛔ Acceso no autorizado (no se activa relé)`);
    return true;
  }

  // ─── Obtener Historial Completo para Sincronización Masiva ────
  async obtenerHistorialCompleto(maxTotal = 20000) {
    try {
      if (!this.session) await this.login();
      const allLogs = [];
      let offset = 0;
      const batchSize = 500;

      console.log(`[Control iD] 🔄 Extrayendo historial completo de accesos desde el tótem...`);

      while (offset < maxTotal) {
        const res = await this._request(`/load_objects.fcgi?session=${this.session}`, 'POST', {
          object: 'access_logs',
          order: ['time', 'ascending'],
          limit: batchSize,
          offset: offset
        });

        const logs = res.data?.access_logs || [];
        if (logs.length === 0) break;

        allLogs.push(...logs);
        offset += logs.length;
        console.log(`[Control iD] 📥 Descargados ${allLogs.length} logs acumulados...`);

        if (logs.length < batchSize) break;
      }

      console.log(`[Control iD] 📋 Total de eventos históricos extraídos del tótem: ${allLogs.length}`);
      return allLogs.map(l => ({
        logId: l.id,
        zkId: String(l.user_id || l.card_value || '0'),
        event: l.event,
        timestamp: new Date(l.time * 1000).toISOString()
      }));
    } catch (e) {
      console.error(`[Control iD] Error obteniendo historial completo:`, e.message);
      return [];
    }
  }

  async obtenerHistorialReciente(limite = 50) {
    return this.obtenerHistorialCompleto();
  }

  // ─── Obtener Historial Delta (Solo eventos nuevos desde ultimoLogId) ───
  async obtenerHistorialDelta(ultimoLogId = 0) {
    try {
      if (!this.session) await this.login();
      const res = await this._request(`/load_objects.fcgi?session=${this.session}`, 'POST', {
        object: 'access_logs',
        order: ['time', 'descending'],
        limit: 100
      });

      const logs = res.data?.access_logs || [];
      const delta = logs.filter(l => l.id > ultimoLogId);

      if (delta.length > 0) {
        console.log(`[Control iD] 📥 Sincronización incremental: ${delta.length} nuevos eventos desde ID #${ultimoLogId}`);
      }

      return delta.reverse().map(l => ({
        logId: l.id,
        zkId: String(l.user_id || l.card_value || '0'),
        event: l.event,
        timestamp: new Date(l.time * 1000).toISOString()
      }));
    } catch (e) {
      console.warn(`[Control iD] Aviso en obtenerHistorialDelta:`, e.message);
      return [];
    }
  }

  // ─── Obtener Todos los Usuarios del Tótem ───────────────────
  async obtenerUsuariosCompletos() {
    try {
      if (!this.session) await this.login();
      const res = await this._request(`/load_objects.fcgi?session=${this.session}`, 'POST', {
        object: 'users'
      });
      return res.data?.users || [];
    } catch (e) {
      console.error(`[Control iD] Error obteniendo usuarios del tótem:`, e.message);
      return [];
    }
  }

  // ─── Crear o Actualizar Socio desde la Web en el Tótem ──────
  async crearOActualizarUsuario(socio) {
    try {
      if (!this.session) await this.login();

      const nombreCompleto = `${socio.nombre || ''} ${socio.apellido || ''}`.trim() || 'Socio';
      const registration = socio.rut || '';

      const ahoraSeg = Math.floor(Date.now() / 1000);
      let beginTime = ahoraSeg;
      let endTime = socio.vencimiento
        ? Math.floor(new Date(socio.vencimiento).getTime() / 1000)
        : ahoraSeg + (30 * 86400);

      if (socio.estado === 'INACTIVO' || socio.estado === 'SUSPENDIDO') {
        endTime = ahoraSeg - 1; // bloqueado/vencido
      }

      // Buscar si el usuario ya existe por ID de tótem (zkId) o registration (RUT)
      let userIdEnTotem = socio.zkId ? parseInt(socio.zkId) : null;

      if (!userIdEnTotem && registration) {
        const busqueda = await this._request(`/load_objects.fcgi?session=${this.session}`, 'POST', {
          object: 'users',
          where: { users: { registration } }
        });
        if (busqueda.data?.users?.length > 0) {
          userIdEnTotem = busqueda.data.users[0].id;
        }
      }

      if (userIdEnTotem) {
        // Actualizar usuario en el tótem
        console.log(`[Control iD] 🔄 Actualizando socio existente en tótem #${userIdEnTotem} (${nombreCompleto})...`);
        await this._request(`/modify_objects.fcgi?session=${this.session}`, 'POST', {
          object: 'users',
          values: {
            name: nombreCompleto,
            registration: registration,
            begin_time: beginTime,
            end_time: endTime
          },
          where: { users: { id: userIdEnTotem } }
        });
        console.log(`[Control iD] ✅ Socio #${userIdEnTotem} actualizado en el tótem.`);
        return { id: userIdEnTotem, updated: true };
      } else {
        // Crear nuevo usuario en el tótem
        console.log(`[Control iD] ➕ Creando nuevo socio en el tótem: ${nombreCompleto} (RUT: ${registration})...`);
        const crearRes = await this._request(`/create_objects.fcgi?session=${this.session}`, 'POST', {
          object: 'users',
          values: [
            {
              name: nombreCompleto,
              registration: registration,
              begin_time: beginTime,
              end_time: endTime
            }
          ]
        });

        const newId = crearRes.data?.ids?.[0];
        if (newId) {
          // Asignar al grupo 1 para que tenga permiso de desbloqueo
          await this._request(`/create_objects.fcgi?session=${this.session}`, 'POST', {
            object: 'user_groups',
            values: [{ user_id: newId, group_id: 1 }]
          });
          console.log(`[Control iD] ✅ Socio #${newId} creado y habilitado en el molinete exitosamente.`);
          return { id: newId, created: true };
        }
      }
    } catch (e) {
      console.error(`[Control iD] ❌ Error creando/actualizando socio en tótem:`, e.message);
      return false;
    }
  }

  // ─── Subir Foto Facial al Tótem ─────────────────────────────
  async subirFotoFacial(userId, imageBuffer) {
    try {
      if (!this.session) await this.login();
      const timestamp = Math.floor(Date.now() / 1000);
      const reqPath = `/user_set_image.fcgi?user_id=${userId}&timestamp=${timestamp}&match=0&session=${this.session}`;

      return new Promise((resolve) => {
        const options = {
          hostname: this.ip,
          port: this.port,
          path: reqPath,
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': imageBuffer.length
          },
          timeout: 6000
        };

        const req = http.request(options, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            console.log(`[Control iD] ✅ Foto facial subida para socio #${userId}`);
            resolve(true);
          });
        });

        req.on('error', (err) => {
          console.error(`[Control iD] ❌ Error subiendo foto facial:`, err.message);
          resolve(false);
        });

        req.write(imageBuffer);
        req.end();
      });
    } catch (e) {
      console.error(`[Control iD] Error en subirFotoFacial:`, e.message);
      return false;
    }
  }

  // ─── Obtener Foto Facial del Tótem ─────────────────────────
  async obtenerFotoUsuario(userId) {
    try {
      if (!this.session) await this.login();
      return new Promise((resolve) => {
        const options = {
          hostname: this.ip,
          port: this.port,
          path: `/user_get_image.fcgi?user_id=${userId}&session=${this.session}`,
          method: 'GET',
          timeout: 4000
        };

        const req = http.request(options, (res) => {
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            if (buffer.length > 500) {
              const base64 = buffer.toString('base64');
              resolve(`data:image/jpeg;base64,${base64}`);
            } else {
              resolve(null);
            }
          });
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });
        req.end();
      });
    } catch (e) {
      return null;
    }
  }
}

module.exports = ControlIDClient;
