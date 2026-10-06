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

      // Garantizar horario 00:00 a 23:59 (24/7) para todos los usuarios en el tótem
      await this.asegurarHorarioTotal().catch(err => {
        console.warn('[Control iD] Aviso configurando horario 24/7:', err.message);
      });

      // Sincronizar reloj interno del tótem con la hora exacta de America/Santiago
      await this.sincronizarHoraTotem().catch(err => {
        console.warn('[Control iD] Aviso sincronizando reloj del tótem:', err.message);
      });

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

    // Sondeo periódico de nuevos usuarios enrolados en el tótem cada 5 segundos
    if (this.userPollInterval) clearInterval(this.userPollInterval);
    this.userPollInterval = setInterval(() => this._pollNuevosUsuarios(), 5000);
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
        console.log(`[Control iD] 🆕 Cambio detectado en usuarios del tótem (${this.lastKnownUserCount} -> ${users.length}). Auto-asignando horario 00:00 - 23:59...`);
        this.lastKnownUserCount = users.length;

        // Auto-asignar horario total y permisos 24/7 a cualquier usuario nuevo inmediatamente
        await this.asegurarHorarioTotal().catch(err => {
          console.warn('[Control iD] Aviso auto-asignando horario a nuevos usuarios:', err.message);
        });

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

      // Si aún no se encontró, buscar automáticamente por coincidencia de nombre en el tótem
      if (!userIdEnTotem && nombreCompleto) {
        try {
          const busquedaNombre = await this._request(`/load_objects.fcgi?session=${this.session}`, 'POST', {
            object: 'users',
          });
          const users = busquedaNombre.data?.users || [];
          const norm = (str) => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          const target = norm(nombreCompleto);
          const match = users.find(u => {
            const uNorm = norm(u.name);
            return uNorm && (uNorm === target || (target.length > 5 && uNorm.includes(target)) || (uNorm.length > 5 && target.includes(uNorm)));
          });
          if (match) {
            userIdEnTotem = match.id;
            console.log(`[Control iD] 🔗 Vinculación automática: '${nombreCompleto}' vinculado con usuario #${match.id} ('${match.name}') en el tótem.`);
          }
        } catch (e) {
          console.warn(`[Control iD] Error en búsqueda por nombre en tótem:`, e.message);
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

  // ─── Configurar Horario Total 24/7 (00:00 - 23:59) en Control iD ──
  async asegurarHorarioTotal() {
    try {
      if (!this.session) await this.login();
      console.log(`[Control iD] ⏰ Configurando y asegurando horario 00:00 - 23:59 (24/7) para todos los usuarios...`);

      // 1. Asegurar Time Zone 24 Horas
      let timeZoneId = 1;
      const tzRes = await this._request(`/load_objects.fcgi?session=${this.session}`, 'POST', {
        object: 'time_zones'
      });
      const timeZones = tzRes.data?.time_zones || [];
      const tz24 = timeZones.find(tz => tz.name && (tz.name.includes('24') || tz.name.includes('00:00')));
      
      if (tz24) {
        timeZoneId = tz24.id;
      } else if (timeZones.length > 0) {
        timeZoneId = timeZones[0].id;
      } else {
        const createTz = await this._request(`/create_objects.fcgi?session=${this.session}`, 'POST', {
          object: 'time_zones',
          values: [{ name: 'Horario Completo (00:00 - 23:59)' }]
        });
        if (createTz.data?.ids?.[0]) timeZoneId = createTz.data.ids[0];
      }

      // 2. Asegurar que TODOS los Time Spans del tótem estén configurados en 00:00 - 23:59
      const allTsRes = await this._request(`/load_objects.fcgi?session=${this.session}`, 'POST', {
        object: 'time_spans'
      });
      const allTimeSpans = allTsRes.data?.time_spans || [];

      if (allTimeSpans.length === 0) {
        // Crear time_span 00:00 a 23:59
        await this._request(`/create_objects.fcgi?session=${this.session}`, 'POST', {
          object: 'time_spans',
          values: [{
            time_zone_id: timeZoneId,
            start: 0,
            end: 86399,
            sun: 1, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 1, hol1: 1, hol2: 1, hol3: 1
          }]
        });
      } else {
        // Modificar cada time_span existente para que cubra 24/7
        for (const ts of allTimeSpans) {
          if (ts.start !== 0 || ts.end < 86390 || ts.mon !== 1 || ts.sun !== 1) {
            await this._request(`/modify_objects.fcgi?session=${this.session}`, 'POST', {
              object: 'time_spans',
              values: {
                start: 0,
                end: 86399,
                sun: 1, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 1, hol1: 1, hol2: 1, hol3: 1
              },
              where: { time_spans: { id: ts.id } }
            }).catch(() => null);
          }
        }
      }

      // 3. Asegurar Regla de Acceso asociada a esta zona horaria
      const arRes = await this._request(`/load_objects.fcgi?session=${this.session}`, 'POST', {
        object: 'access_rules'
      });
      const accessRules = arRes.data?.access_rules || [];
      let accessRuleId = 1;
      if (accessRules.length === 0) {
        const createAr = await this._request(`/create_objects.fcgi?session=${this.session}`, 'POST', {
          object: 'access_rules',
          values: [{ name: 'Regla 24/7 (00:00 - 23:59)', type: 0, priority: 0 }]
        });
        if (createAr.data?.ids?.[0]) accessRuleId = createAr.data.ids[0];
      } else {
        accessRuleId = accessRules[0].id;
      }

      // Vincular regla de acceso con time zone
      try {
        await this._request(`/create_objects.fcgi?session=${this.session}`, 'POST', {
          object: 'access_rule_time_zones',
          values: [{ access_rule_id: accessRuleId, time_zone_id: timeZoneId }]
        });
      } catch (_) {}

      // Vincular grupo 1 con la regla de acceso
      try {
        await this._request(`/create_objects.fcgi?session=${this.session}`, 'POST', {
          object: 'group_access_rules',
          values: [{ group_id: 1, access_rule_id: accessRuleId }]
        });
      } catch (_) {}

      // Vincular portal 1 con la regla de acceso
      try {
        await this._request(`/create_objects.fcgi?session=${this.session}`, 'POST', {
          object: 'portal_access_rules',
          values: [{ portal_id: 1, access_rule_id: accessRuleId }]
        });
      } catch (_) {}

      // 4. Asignación universal a TODOS los usuarios del tótem
      const usersRes = await this._request(`/load_objects.fcgi?session=${this.session}`, 'POST', {
        object: 'users'
      });
      const users = usersRes.data?.users || [];

      // A) user_groups: Grupo 1
      const ugRes = await this._request(`/load_objects.fcgi?session=${this.session}`, 'POST', {
        object: 'user_groups'
      });
      const userGroups = ugRes.data?.user_groups || [];
      const userIdsInGroup1 = new Set(userGroups.filter(ug => ug.group_id === 1).map(ug => ug.user_id));

      const missingUserGroups = users
        .filter(u => !userIdsInGroup1.has(u.id))
        .map(u => ({ user_id: u.id, group_id: 1 }));

      if (missingUserGroups.length > 0) {
        console.log(`[Control iD] 👥 Asignando ${missingUserGroups.length} usuarios al Grupo 1 (Horario 00:00 - 23:59)...`);
        await this._request(`/create_objects.fcgi?session=${this.session}`, 'POST', {
          object: 'user_groups',
          values: missingUserGroups
        }).catch(() => null);
      }

      // B) user_access_rules: Regla 1 directa (para usuarios creados desde la pantalla táctil)
      try {
        const uarRes = await this._request(`/load_objects.fcgi?session=${this.session}`, 'POST', {
          object: 'user_access_rules'
        });
        const userAccessRules = uarRes.data?.user_access_rules || [];
        const userIdsWithRule = new Set(userAccessRules.map(r => r.user_id));
        const missingUserRules = users
          .filter(u => !userIdsWithRule.has(u.id))
          .map(u => ({ user_id: u.id, access_rule_id: accessRuleId }));

        if (missingUserRules.length > 0) {
          console.log(`[Control iD] 📋 Asignando regla 24/7 directa a ${missingUserRules.length} usuarios...`);
          await this._request(`/create_objects.fcgi?session=${this.session}`, 'POST', {
            object: 'user_access_rules',
            values: missingUserRules
          }).catch(() => null);
        }
      } catch (_) {}

      // C) Limpiar restricciones de fecha expirada (end_time) en los usuarios del tótem
      const ahoraSeg = Math.floor(Date.now() / 1000);
      for (const u of users) {
        if (u.end_time > 0 && u.end_time < ahoraSeg) {
          await this._request(`/modify_objects.fcgi?session=${this.session}`, 'POST', {
            object: 'users',
            values: { begin_time: 0, end_time: 0 },
            where: { users: { id: u.id } }
          }).catch(() => null);
        }
      }

      console.log(`[Control iD] ✅ Horario 00:00 a 23:59 (24/7) garantizado para los ${users.length} usuarios del tótem.`);
      return true;
    } catch (e) {
      console.error(`[Control iD] ⚠️ Error asegurando horario total:`, e.message);
      return false;
    }
  }

  // ─── Sincronizar Reloj Interno a America/Santiago (Chile) ────────
  async sincronizarHoraTotem() {
    try {
      if (!this.session) await this.login();
      const ahora = new Date();

      // Formatear hora exacta según la zona horaria oficial de Chile
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
      });

      const parts = formatter.formatToParts(ahora);
      const getVal = (type) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);

      const year = getVal('year');
      const month = getVal('month');
      const day = getVal('day');
      let hour = getVal('hour');
      if (hour === 24) hour = 0;
      const minute = getVal('minute');
      const second = getVal('second');

      // 1. Configurar NTP a UTC-3 (Zona horaria de Chile continental en horario de verano)
      try {
        console.log('[Control iD] 🌐 Configurando NTP del tótem en UTC-3 (servidor: cl.pool.ntp.org)...');
        await this._request(`/set_configuration.fcgi?session=${this.session}`, 'POST', {
          ntp: {
            enabled: "1",
            timezone: "UTC-3",
            server: "cl.pool.ntp.org"
          }
        });
      } catch (_) {}

      // 2. Ajustar reloj manual al segundo exacto en America/Santiago
      console.log(`[Control iD] 🕒 Sincronizando reloj del tótem a America/Santiago: ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}...`);
      await this._request(`/set_system_time.fcgi?session=${this.session}`, 'POST', {
        day, month, year, hour, minute, second
      });

      console.log(`[Control iD] ✅ Reloj y zona horaria del tótem sincronizados exitosamente`);
      return true;
    } catch (e) {
      console.error(`[Control iD] ⚠️ Error sincronizando reloj del tótem:`, e.message);
      return false;
    }
  }
}

module.exports = ControlIDClient;
