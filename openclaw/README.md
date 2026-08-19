# Guía de Conexión: OpenClaw Gateway + Telegram + Control Center

Esta guía documenta la integración entre el **OpenClaw Gateway Real** (instalado como daemon del sistema) y **Control Center**.

---

## 1. Arquitectura de Integración

```text
📱 TELEGRAM / CELULAR (Vos)
         │
         ▼ (Canal Seguro / Tailscale)
┌────────────────────────────────┐
│       OPENCLAW GATEWAY         │
│  (Daemon self-hosted :18789)   │
│  - AllowFrom (ID numérico)     │
│  - Policy: tools.exec.mode=ask │
└───────────────┬────────────────┘
                │ HTTP REST
                ▼
┌────────────────────────────────┐
│         CONTROL CENTER         │
│         (Next.js :3100)        │
│  - State Machine & Handoffs    │
│  - Approvals & Circuit Breaker │
│  - Drivers: Antigravity,       │
│    OpenCode, OpenDesign        │
└────────────────────────────────┘
```

---

## 2. Instalación y Onboarding de OpenClaw

1. **Instalar el paquete oficial de OpenClaw:**
   ```powershell
   npm install -g openclaw@latest --allow-scripts=openclaw
   ```

2. **Ejecutar el asistente interactivo de onboarding:**
   ```powershell
   openclaw onboard --install-daemon
   ```

3. **Copiar la configuración de seguridad:**
   Copiar `openclaw/openclaw.json.template` hacia `~/.openclaw/openclaw.json` completando tus credenciales.

---

## 3. Conexión de Telegram y Seguridad en 4 Barreras

### Barrera 1: Solo tu ID Numérico
Habla con `@userinfobot` en Telegram para obtener tu ID (ejemplo: `123456789`).
Colocalo en `channels.telegram.allowFrom`:
```json5
"allowFrom": ["123456789"]
```

### Barrera 2: Aprobaciones Estrictas en Control Center
Las siguientes acciones requieren autorización explícita desde la web o mediante confirmación inline:
- Deploy a producción
- Eliminación de archivos/proyectos
- Modificación de variables de entorno

### Barrera 3: Prohibición de Secretos en el Chat
OpenClaw nunca transmite ni expone claves de API, tokens ni credenciales en las respuestas del chat.

### Barrera 4: Cero Ejecución Directa de Shell
OpenClaw no ejecuta comandos arbitrarios de PowerShell ni `npm install`. Toda acción se traduce en llamadas a la API de Control Center (`POST /api/goals`, `PATCH /api/approvals/:id`, `POST /api/system/emergency-stop`).

---

## 4. Acceso Remoto Seguro con Tailscale

Para acceder desde tu celular fuera de la red local:
1. Instalar Tailscale en Windows: `winget install Tailscale.Tailscale`
2. Conectar tu cuenta: `tailscale up`
3. Instalar la app de Tailscale en tu celular y unirte a tu tailnet privada.
4. El Gateway permanece en loopback (`127.0.0.1:18789`), protegido y accesible únicamente desde tus dispositivos autorizados.

---

## 5. Comandos y Operación desde Telegram

- `/status` — Consulta el estado del sistema, agentes online, tareas en curso y cuota.
- `/goal <descripción>` — Crea un nuevo objetivo y activa la planificación automática en Antigravity.
- `/tasks` — Lista las tareas activas y sus estados.
- `/approvals` — Muestra aprobaciones pendientes para autorizar o rechazar.
- `/emergency-stop` — Pausa inmediatamente el sistema y todos los workers sin pérdida de datos.
- `/resume` — Reanuda el sistema y reactiva las tareas pendientes.
