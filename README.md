# Control Center

Dashboard + MCP server para **coordinar agentes de IA** (Antigravity, OpenDesign, OpenCode, OpenHands, o los tuyos). Los agentes reciben trabajo, se pasan la pelota entre sí (handoffs), se piden correcciones entre ellos y piden aprobación humana cuando se quedan sin intentos — todo con trazabilidad completa en un dashboard web.

## Qué hace

- **Dashboard** (`http://localhost:3100`): goal activo, pipeline de agentes, tareas, cola de mensajes entre agentes, aprobaciones pendientes, actividad en vivo y controles (pause/resume/stop) sobre tareas en ejecución.
- **Motor autónomo** (`src/lib/`): máquina de estados de tareas + handoffs automáticos (`nextAgent`), fix loop (`onFailureAgent`, máx. 3 reintentos → aprobación humana) y detección de goal completado.
- **MCP server** (`src/mcp/server.ts`): cada agente se conecta con su propia identidad y trabaja con tools (`heartbeat`, `read_messages`, `claim_task`, `complete_task`, `fail_task`, `send_message`, `plan_goal`, …).
- **Agentes reales**: cualquier agente con cliente MCP (opencode, Claude, etc.) se conecta como *una instancia más*.

## Quickstart

```bash
npm install
npm run db:push        # crea la BD SQLite
npm run db:seed        # datos de ejemplo (2 proyectos + aprobación pendiente)
npm run dev            # dashboard en http://localhost:3100
```

## Cómo se coordinan los agentes

Cada agente ejecuta el MCP server con su identidad:

```bash
npm run mcp -- --agent Antigravity
# o: AGENT_NAME=OpenCode npm run mcp
```

Desde su cliente MCP (opencode, Claude Desktop, …) el agente hace su loop de trabajo:

1. `read_messages` — ver si le pidieron algo (REQUEST / HANDOFF / FIX_REQUEST).
2. `claim_task <taskId>` — se asigna la tarea (BACKLOG → RUNNING).
3. Hace el trabajo (escribe archivos, llama APIs, etc.).
4. `complete_task <taskId> --result ...` o `fail_task` si algo salió mal.

El motor se encarga del resto: al completar una tarea con `nextAgent` le llega un **HANDOFF** al siguiente agente (junto con el `result` como contexto); si un agente falla y la tarea tiene `onFailureAgent`, se crea un **FIX_REQUEST** (hasta 3 reintentos) y, si se agotan, una **aprobación humana** queda pendiente en el dashboard.

### Protocolo de control (pause/resume/stop)

El dashboard controla tareas enviando mensajes de tipo `CONTROL` (ver `src/lib/control.ts`):

- `STOP` — apagar el agente.
- `STOP_TASK:<id>` — dejar de trabajar en esa tarea.
- `PAUSE_TASK:<id>` / `RESUME_TASK:<id>` — pausar/reanudar.

El agente escucha estos mensajes en `read_messages`. `scripts/dummy-worker.ts` es un worker de referencia que entiende el protocolo completo.

## Ejemplo completo: landing page con 3 agentes

```bash
npm run demo:landing
```

Levanta 3 instancias MCP (Antigravity, OpenDesign, OpenCode) y orquesta el flujo real:

```
Antigravity → crea proyecto, investiga y genera la estructura (research.md)
OpenDesign  → design system (design-system.md)
OpenCode    → build de landing/index.html (intencionalmente sin <footer>)
Antigravity → verifica, detecta el fallo, fail_task
OpenCode    → [FIX] vía FIX_REQUEST (retry 1/3)
Antigravity → re-verifica → GOAL COMPLETED
```

El resultado queda en `test-fixtures/demo-landing/` (la BD se limpia al final).

## Pruebas

```bash
npm run test:e2e     # motor autónomo completo (handoffs + fix loop + goal COMPLETED)
npm run test:mcp     # smoke test del MCP server (identity, ownership, plan_goal, mensajes)
npm run lint
npm run build
```

## Arquitectura

| Capa | Archivos |
|---|---|
| UI | `src/components/mission-control/*` + `src/app/page.tsx` |
| API | `src/app/api/{projects,goals,tasks,messages,approvals,activity}/*` |
| Motor | `src/lib/transition.ts` (transiciones), `src/lib/handoff.ts` (handoffs/fix loop), `src/lib/types.ts` (estados/mensajes) |
| Control | `src/lib/control.ts` (protocolo CONTROL), `src/lib/approvals.ts` (resolución de aprobaciones compartida API/MCP) |
| MCP | `src/mcp/server.ts` (server stdio), `scripts/test-mcp.ts`, `scripts/demo-landing.ts` |
| Simulación | `scripts/dummy-worker.ts` (worker de referencia), `scripts/agent-sdk.ts` |
| BD | SQLite vía Prisma 7 (`prisma/schema.prisma`) |

## Estado del goal y handoffs

- `BACKLOG → RUNNING → DONE` (o `FAILED`); `REVIEW` si la tarea `requiresApproval`.
- `nextAgent`: al completar, se envía HANDOFF y la tarea pre-planeada en BACKLOG del mismo agente se usa para encadenar; si no existe, se crea `[Handoff from <agente>] …`.
- `onFailureAgent`: al fallar, `[FIX]` con `retryCount`; al llegar a 3 reintentos → aprobación humana (`CLIENT_ACTION`).
- Un goal se marca `COMPLETED` cuando no quedan tareas activas ni fallos terminales.