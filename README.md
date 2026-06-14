# 🔌 LefTor Sport Gym — GymAgent

> **Para JP (tu hermano):** Este es el **programa que va instalado en el notebook de recepción**. Es el puente entre el molinete (el tótem con reconocimiento facial) y el sistema del gym en internet. Una vez instalado, corre en segundo plano solo — no hay que hacer nada.

---

## 🧠 ¿Qué hace este programa?

El GymAgent es como un **portero digital inteligente** que vive en la computadora del gym:

1. **Escucha al molinete**: Cuando un socio pone su cara frente al lector, el GymAgent lo detecta
2. **Consulta al servidor**: En menos de 1 segundo, pregunta al sistema si ese socio tiene la membresía al día
3. **Da la orden**: Si está al día → abre el molinete. Si no → lo deja cerrado
4. **Registra todo**: Cada entrada queda guardada con hora y fecha exacta en el sistema

### ¿Qué pasa si se cae el internet?

Sin problema. El GymAgent tiene una **memoria local** con la lista de socios activos. Si se va el internet, sigue funcionando con esa lista. Cuando vuelve la conexión, sincroniza automáticamente todo lo que pasó mientras estuvo offline.

---

## 💻 Requisitos del notebook

- Sistema operativo: **Windows 10 o Windows 11**
- Conectado a la **misma red WiFi/LAN que el molinete**
- Debe estar **encendido mientras el gym esté abierto**
- Necesita **internet** (puede ser el mismo WiFi del gym)

---

## ⚙️ Instalación (una sola vez)

### Paso 1: Descargar el instalador
Descargar el archivo `GymAgent-Setup.exe` de la carpeta compartida del proyecto.

### Paso 2: Configurar
Abrir el archivo `config.json` con el Bloc de Notas y completar:

```json
{
  "molinete": {
    "ip": "192.168.1.XX",
    "puerto": 4370
  },
  "servidor": {
    "url": "wss://leftor-gym.tudominio.com",
    "apiKey": "CLAVE-SECRETA-DEL-GYM"
  }
}
```

> La IP del molinete la puede ver tu hermano en la pantalla del dispositivo ZKTeco, en Configuración → Red.

### Paso 3: Instalar como servicio de Windows
Hacer doble clic en `instalar-servicio.bat` (ejecutar como Administrador).

Listo. El GymAgent:
- Arranca automáticamente cuando se enciende la computadora
- Aparece como un pequeño ícono en la barra de tareas (cerca del reloj)
- No necesita que nadie abra ni cierre nada

---

## 🔔 Indicadores de estado (ícono en la barra de tareas)

| Ícono | Significado |
|---|---|
| 🟢 Verde | Todo funcionando: conectado al molinete y al servidor |
| 🟡 Amarillo | Funcionando en modo offline (sin internet) |
| 🔴 Rojo | No puede conectarse al molinete — verificar cable de red |

---

## 📋 Log de actividad

El GymAgent guarda un registro de todo lo que pasa en:
```
C:\GymAgent\logs\actividad.log
```

Ejemplo de lo que registra:
```
[10:32:15] ✅ ACCESO PERMITIDO — Juan Pérez (Membresía vigente hasta 30/07/2025)
[10:45:02] ❌ ACCESO DENEGADO — María González (Membresía vencida el 01/06/2025)
[11:00:00] 📶 Modo offline activado — sin conexión al servidor
[11:08:33] 📶 Conexión restaurada — sincronizando 8 eventos pendientes
```

---

## 🔧 Carga masiva de datos del molinete

El lector facial ZKTeco tiene su propia base de datos interna con historial de accesos. Al instalar el GymAgent por primera vez, se puede hacer una **importación completa** de toda esa data histórica al sistema:

```bash
# Extraer y cargar historial del molinete al sistema
gymAgent.exe --import-history

# Ver cuántos registros tiene el molinete
gymAgent.exe --device-info
```

Esto lleva todos los registros históricos del molinete al panel web, donde el dueño puede ver reportes con data real desde antes de que existiera el sistema.

---

## 🛠️ Setup técnico (para desarrolladores)

### Requisitos
- Node.js 20+
- Acceso a la red local donde está el molinete ZKTeco

### Variables de entorno
```env
ZKTECO_IP=192.168.1.XX       # IP del lector facial ZKTeco
ZKTECO_PORT=4370             # Puerto TCP del dispositivo
SERVER_WS_URL=wss://...      # URL WebSocket del servidor central
AGENT_API_KEY=               # Clave de autenticación con el servidor
SYNC_INTERVAL_MS=30000       # Intervalo de heartbeat (30 segundos)
```

### Desarrollo y tests locales
```bash
# Instalar dependencias
npm install

# Iniciar en modo desarrollo (con simulador de molinete)
npm run dev:simulated

# Iniciar conectado al molinete real
npm run dev

# Correr tests (usan simulador TCP automáticamente)
npm test

# Empaquetar como .exe para Windows
npm run build:windows
```

### Tests disponibles
```bash
npm test                    # Todos los tests
npm run test:unit           # Tests unitarios
npm run test:integration    # Tests de integración (con simulador TCP)
npm run test:offline        # Simula pérdida de internet y reconexión
```

---

## 📁 Estructura del proyecto

```
leftor-gym-agent/
├── src/
│   ├── zkteco/
│   │   ├── client.js        # Comunicación TCP con el dispositivo
│   │   ├── protocol.js      # Adaptador del protocolo ZKTeco
│   │   └── importer.js      # Importación masiva de historial
│   ├── gateway.js           # Cliente WebSocket al servidor central
│   ├── cache.js             # SQLite local (modo offline)
│   ├── access.js            # Lógica apertura / denegación
│   ├── tray.js              # Ícono en barra de tareas Windows
│   └── index.js             # Entry point
├── simulator/               # Simulador TCP del ZKTeco (para tests)
│   └── index.js
├── config.json              # Configuración (IP molinete, URL servidor)
├── instalar-servicio.bat    # Instalador del servicio Windows
├── desinstalar-servicio.bat # Desinstalador
└── package.json
```

---

## 🌿 Ramas de desarrollo

```
main        → Versión estable (la que se instala en el gym)
develop     → Desarrollo activo
feature/xxx → Nueva funcionalidad
fix/xxx     → Corrección de bug
```

---

## 🔄 Actualizaciones

Cuando haya una nueva versión:
1. Descargar el nuevo `GymAgent-Setup.exe`
2. Ejecutar como Administrador
3. El instalador actualiza automáticamente sin perder la configuración

---

## ⚠️ Solución de problemas comunes

| Problema | Solución |
|---|---|
| Ícono rojo (no conecta al molinete) | Verificar que el cable de red entre notebook y molinete esté bien conectado. Reiniciar el molinete. |
| Ícono amarillo (sin internet) | Verificar la conexión WiFi del notebook. El molinete sigue funcionando normalmente. |
| El molinete no abre cuando debería | Verificar en el panel web que la membresía del socio esté activa. |
| El programa no aparece en la barra | Ejecutar `C:\GymAgent\GymAgent.exe` manualmente o reiniciar el servicio desde el Administrador de tareas. |

---

## 📞 Soporte técnico

Para dudas técnicas o problemas, contactar al equipo de desarrollo.
