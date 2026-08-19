# AGENT PROTOCOL — Contrato oficial de agentes Control Center

Este documento define el contrato que **cualquier agente compatible** con Control Center debe seguir. Los agentes ejecutan; Control Center coordina; el engine gobierna el flujo.

```text
heartbeat
   ↓
read_messages
   ↓
claim_task
   ↓
get_task_context
   ↓
execute
   ↓
complete_task / fail_task
   ↓
repeat
```

## 1. Identidad

- Cada agente corre **una instancia** del MCP server con su identidad:
  ```bash
  npm run mcp -- --agent Antigravity     # o AGENT_NAME=Antigravity
  ```
- La identidad es **enforced por el server**: `claim_task`, `complete_task` y `fail_task` rechazan tareas que no sean de tu agente (`isError: true`). Nunca intentes trabajar tareas ajenas: reclámalo por `send_message` al dueño.
- Una misma identidad no debe correr en dos instancias simultáneas (colisión de heartbeat y de claims).

## 2. Heartbeat

- El server hace heartbeat automáticamente en **cada tool call**, pero el contrato exige:
  - `heartbeat` explícito **al iniciar** y **cuando estés idle más de ~20s**.
  - El dashboard marca `OFFLINE` a un agente sin actividad en 30s.

## 3. Loop de trabajo

1. **`read_messages`** (con `consume: true` al procesar). Tipos accionables:
   - `REQUEST` — tienes una tarea nueva (planner/plan_goal/USER).
   - `HANDOFF` — un agente terminó y te pasó la pelota (trae el `result` previo como contexto).
   - `FIX_REQUEST` — tu antecesor falló y el engine te asignó la corrección (`retryCount` incluido).
2. **`claim_task <taskId>`** — la tarea debe estar en `BACKLOG`; queda `RUNNING`. Si el server rechaza el claim, no insistas: es de otro agente o está en otro estado.
3. **`get_task_context <taskId>`** — reconstruye TODO tu contexto desde ahí: la tarea, su goal (título/descripción), su project con **`repoPath`** (dónde trabajar en disco) y los mensajes adjuntos.
   > **Regla de contexto**: nunca dependas de contexto externo inyectado (paths, credenciales, info fuera de MCP). Todo lo que necesitas debe reconstruirse desde `goal`, `task`, `messages`, `project` y los archivos del `repoPath`.
4. **`execute`** — el trabajo real (escribir archivos en `repoPath`, correr comandos, investigar con tus propias tools, etc.).
5. **`complete_task <taskId> --result <resumen>`** si terminaste (el `result` viaja como contexto al siguiente agente) o **`fail_task <taskId> --error <detalle>`** si no.
   - El engine decide lo demás: `nextAgent` → HANDOFF; `onFailureAgent` → FIX_REQUEST (máx. 3 reintentos → aprobación humana).
6. **Repetir** — vuelve a `read_messages`. Si no hay mensajes: idle corto y `heartbeat`.

## 4. Descubrimiento de trabajo

- **Todo** el trabajo llega como mensaje: `REQUEST`, `HANDOFF` o `FIX_REQUEST`.
- `plan_goal` despacha un `REQUEST` al agente de la **primera** tarea del plan, así que incluso la primera tarea de un chain llega por mensaje.
- Regla práctica: si `read_messages` te da un mensaje accionable, **no necesitas adivinar** qué hacer — la tarea, el goal y el repoPath vienen en `get_task_context`.

## 5. Contexto entre agentes

- Al completar, tu `result` se convierte en el contexto del HANDOFF/FIX_REQUEST siguiente.
- Cuando recibas un HANDOFF: `get_task_context` + leer los archivos del `repoPath` que dejó tu antecesor (ej. `research.md`, `design-system.md`). El trabajo encadenado vive en el repo, no en la memoria del agente.

## 6. Control (pause/resume/stop)

- El dashboard controla tareas con mensajes `CONTROL` (ver `src/lib/control.ts`):
  - `STOP` — apágate (marca OFFLINE y sal del loop).
  - `STOP_TASK:<id>` — detén esa tarea (deja `FAILED`, "Stopped by operator").
  - `PAUSE_TASK:<id>` / `RESUME_TASK:<id>` — pausa/reanuda.
- Al recibir un CONTROL: acusa con `send_message` (`ACK`) y resuelve el mensaje con `status: READ`+`RESOLVED` vía `read_messages`/estado.

## 7. Errores

- Tool falla (`isError: true`): lee el `text` y actúa. Casos típicos:
  - `Task X is assigned to 'Y', not to you ('Z')` → ownership; avisa al dueño o al planificador.
  - `only BACKLOG tasks can be claimed` → la tarea ya está en progreso; no reclames.
  - `Invalid transition` → estado inconsistente; avisa por `send_message` (tipo `ERROR`) al System.
- Falla tu trabajo → **`fail_task`** (no dejes la tarea en `RUNNING`). El engine decide retry/approval.

## 8. Referencia rápida de tools MCP

| Tool | Uso |
|---|---|
| `heartbeat` | Registrarse ONLINE / refrescar actividad |
| `get_state` | Snapshot global (goal activo, proyectos, mensajes, approvals) |
| `create_project` / `set_project_repo` | Crear proyecto / apuntar repoPath |
| `create_goal` | Crear goal (despacha planning task + REQUEST) |
| `plan_goal` | Descomponer goal en cadena (despacha REQUEST a la 1ª tarea) |
| `list_tasks` | Filtrar tareas (projectSlug/agent/state, incluye repoPath) |
| `get_task_context` | **Contexto completo de una tarea** (task + goal + project + messages) |
| `claim_task` / `complete_task` / `fail_task` | Ciclo de vida (ownership enforced) |
| `send_message` | Hablar con agentes o `USER` (REQUEST/QUESTION/INFO/ERROR/ACK…) |
| `read_messages` | Bandeja de entrada (consume → READ) |
| `list_approvals` / `resolve_approval` | Aprobaciones humanas |

## 9. Implementación de referencia

- `scripts/agent-loop.ts` — driver genérico que implementa este loop con hooks de ejecución por rol (referencia para integrar cualquier agente).
- `.opencode/agent/*.md` + `configs/agent-*.json` — agentes opencode reales (3 identidades).
- Pruebas: `npm run test:integration` (driver) y `npm run test:agents` (sesiones opencode reales).

## 10. Sesiones opencode reales (pull model)

`opencode run` es **one-shot**: la sesión arranca, trabaja un turno y sale. Por eso el orquestador NO lanza agentes de larga duración con heartbeat propio: usa el **pull model**:

1. El orquestador (ej. `scripts/test-agents.ts`) vigila el bus de mensajes.
2. Por cada mensaje accionable nuevo (`REQUEST`/`HANDOFF`/`FIX_REQUEST`) lanza UNA sesión corta:
   ```bash
   opencode run --agent <role-file> --auto --format json "<instrucción del contrato>"
   ```
   con `OPENCODE_CONFIG=configs/agent-<rol>.json` (identidad MCP del server).
3. La sesión descubre el trabajo **solo vía MCP** (`read_messages` → `claim_task` → `get_task_context` → ejecuta → `complete/fail`); nunca recibe el contenido de la tarea del orquestador.
4. Al salir la sesión, el orquestador libera el slot y sigue con el siguiente mensaje (serializado para no saturar el modelo).
5. El heartbeat queda implícito: cada sesión refresca el `workerStatus` con sus tool calls mientras trabaja; sin sesión activa el agente aparece `OFFLINE` — correcto, no hay worker corriendo.