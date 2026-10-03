# 🔌 LefTor Sport Gym — Reception Agent (macOS)

> **Para el equipo de recepción:** Este es el **programa que va instalado en el Mac de recepción**. Es el puente entre el molinete (el tótem con reconocimiento facial/tarjetas) y el sistema del gym en internet. Una vez instalado, corre en segundo plano solo — no hay que hacer nada.

---

## 🧠 ¿Qué hace este programa?

El GymAgent es como un **portero digital inteligente** que vive en la computadora del gym:

1. **Escucha al molinete**: Cuando un socio pasa su tarjeta, huella, código o rostro frente al lector, el agente lo detecta.
2. **Consulta al servidor**: En milisegundos, pregunta al sistema si ese socio tiene la membresía al día.
3. **Da la orden**: Si está al día → abre el molinete (`OPEN`). Si no → lo deja cerrado (`DENY`).
4. **Registra todo**: Cada entrada queda guardada con hora y fecha exacta en la base de datos central.

### ¿Qué pasa si se cae el internet?
Sin problema. El agente tiene una **memoria local (`data/cache.json`)** con la lista de socios activos. Si se corta el internet, sigue abriendo a los socios autorizados. Cuando vuelve la conexión, sincroniza automáticamente todo lo que pasó mientras estuvo offline.

---

## 💻 Requisitos del Mac

- Sistema operativo: **Cualquier Mac (antiguo o moderno, macOS 10.12+)**
- Conectado a la **misma red WiFi/LAN que el molinete**
- **Node.js** instalado (v12, v14, v16, v18 o superior)
- Debe estar **encendido mientras el gimnasio esté abierto**

---

## ⚙️ Uso e Instalación Rápida

### 1. Configurar
Abre el archivo `config.json` con TextEdit y completa la IP del molinete y la URL del servidor:

```json
{
  "molinete": {
    "ip": "192.168.1.201",
    "puerto": 4370
  },
  "servidor": {
    "url": "https://api.leftorsport.cl",
    "wsNamespace": "/agent",
    "apiKey": "dev_agent_api_key_local"
  }
}
```

### 2. Probar la Conexión
Haz doble clic en:
👉 `probar-conexion.command`

Verifica si hay respuesta de red y puerto abierto con el molinete y el servidor.

### 3. Iniciar en Vivo
Haz doble clic en:
👉 `iniciar-agente.command`

### 4. Instalar como Servicio Automático de Fondo (LaunchAgent)
Haz doble clic en:
👉 `instalar-servicio-mac.command`

Listo. El agente arrancará automáticamente cada vez que se encienda o inicie sesión en el Mac.
Para desinstalarlo: `desinstalar-servicio-mac.command`.

---

## 📋 Log de actividad

El agente guarda un registro diario en:
```text
logs/agent.log
```

---

## 📁 Estructura del proyecto

```text
leftor-gym-agent/
├── src/
│   ├── zkteco/
│   │   └── client.js                # Cliente TCP con el molinete/tótem
│   ├── gateway.js                   # Cliente WebSocket con el backend
│   ├── cache.js                     # Caché local (modo offline)
│   └── index.js                     # Entry point principal
├── dist/
│   └── bundle.js                    # Código empaquetado autónomo (300 KB)
├── config.json                      # Configuración (IP molinete, URL servidor)
├── probar-conexion.command          # Diagnóstico rápido con doble clic
├── iniciar-agente.command           # Iniciar agente en vivo con doble clic
├── instalar-servicio-mac.command    # Instalador del servicio launchd en Mac
├── desinstalar-servicio-mac.command # Desinstalador del servicio launchd
├── GUIA_INSTALACION_MAC.md          # Guía detallada paso a paso
├── LEEME_PRIMERO.txt                # Resumen rápido
└── package.json
```
