# 🍎 LefTor Sport Gym — Guía de Instalación del Agente en Mac

> **Para el equipo de recepción en Mac:** 👋  
> Esta aplicación es el **puente de comunicación bidireccional** entre el **molinete / tótem** y el **sistema en la nube / base de datos**.  
> Funciona tanto en Macs modernos como en **Macs antiguos** (macOS High Sierra, Mojave, Catalina, etc.).

---

## 🔌 1. Requisitos Previos

1. **Red Local:**
   - El Mac debe estar conectado a la **misma red Wi-Fi o router** que el molinete/tótem.
   - El molinete debe tener asignada una IP fija (por ejemplo `192.168.1.201`).
2. **Node.js en el Mac:**
   - Para saber si ya lo tienen instalado, abran la app **Terminal** en el Mac y escriban:
     ```bash
     node -v
     ```
   - Si dice `v14...`, `v16...`, `v18...` o similar, ¡ya está listo!
   - Si no está instalado:
     - Entren a **[https://nodejs.org](https://nodejs.org)** y descarguen el instalador **LTS (.pkg)** para macOS.
     - *(Si el Mac es muy antiguo y no deja instalar la última versión, descarguen Node 16 o 14 desde [nodejs.org/dist/latest-v16.x/](https://nodejs.org/dist/latest-v16.x/))*.

---

## 📁 2. Dónde poner la carpeta

Pueden colocar la carpeta `leftor-gym-agent` en su carpeta de usuario, por ejemplo:
```text
/Users/tunombre/LefTorGym/
```
o directamente en el **Escritorio** o en **Aplicaciones**.

---

## ⚙️ 3. Configurar la IP en `config.json`

1. Abran el archivo **`config.json`** con la app **TextEdit** (o cualquier editor).
2. Verán esto:
```json
{
  "molinete": {
    "ip": "192.168.1.201",
    "puerto": 4370,
    "timeoutMs": 3000
  },
  "servidor": {
    "url": "https://api.leftorsport.cl",
    "wsNamespace": "/agent",
    "apiKey": "dev_agent_api_key_local"
  },
  "offline": {
    "cachePath": "./data/cache.json",
    "toleranciaDiasVencida": 0
  }
}
```
3. Solo deben cambiar:
   - `"ip"`: La dirección IP que tiene asignada el molinete o tótem en su red local.
   - `"url"`: La URL del servidor (o `http://localhost:3000` si están probando en local).
4. Guarden el archivo (`Cmd + S`).

---

## 🧪 4. Probar la Conexión (Diagnóstico Rápido)

Hagan **doble clic** en Finder sobre:
👉 **`probar-conexion.command`**

Se abrirá una ventana de Terminal que verificará:
- ✅ Si el Mac se comunica con el molinete en la red.
- ✅ Si el puerto del molinete (4370) responde.
- ✅ Si hay comunicación con el servidor central / base de datos.

Si ambas dan **[OK]**, ¡la conexión física y de red están perfectas!

---

## 🚀 5. Probar el Agente en Vivo

Hagan **doble clic** en Finder sobre:
👉 **`iniciar-agente.command`**

Verán en pantalla:
```text
====================================================
🏋️   LefTor Sport Gym — Reception Agent
====================================================
[ZKTeco Client] ✅ Conectado con éxito al molinete en 192.168.1.201:4370
[Gateway] ✅ Conectado con éxito al backend central en la nube
```
Cuando un socio pase su credencial, huella o rostro:
1. El agente consulta a la base de datos en milisegundos.
2. Si la membresía está vigente, destraba el molinete y muestra:
   ```text
   [Main] ✅ ACCESO AUTORIZADO — Nombre del Socio
   ```
3. Pueden presionar `Ctrl + C` para detenerlo cuando terminen las pruebas.

---

## 🛡️ 6. Dejarlo Funcionando Solo 24/7 (Segundo Plano)

Para que el personal del mesón no tenga que abrir ninguna ventana y el agente arranque automáticamente cada vez que se prenda el Mac:

1. Hagan **doble clic** sobre:
   👉 **`instalar-servicio-mac.command`**
2. ¡Listo! El agente queda registrado en `launchd` de macOS como servicio en segundo plano. Si el Mac se reinicia o se corta la luz, se levantará solo al encenderse.
3. Para ver el registro de accesos en cualquier momento:
   ```text
   leftor-gym-agent/logs/agent.log
   ```

*(Si alguna vez quieren desactivarlo, solo hacen doble clic en `desinstalar-servicio-mac.command`).*
