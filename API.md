# Control Center API

Este documento detalla la API HTTP interna utilizada por el Dashboard de Control Center y por los agentes autónomos (vía el SDK).

## Endpoints

### Projects
- **`GET /api/projects`**: Retorna la lista de proyectos ordenados por nombre.
- **`POST /api/projects`**: Crea un nuevo proyecto.

### Tasks
- **`GET /api/tasks`**: Retorna las tareas. Soporta filtros opcionales (ej. `?projectId=X`, `?agent=Y`).
- **`POST /api/tasks`**: Crea una nueva tarea.
- **`GET /api/tasks/[id]`**: Retorna los detalles de una tarea específica.
- **`PATCH /api/tasks/[id]`**: Actualiza una tarea (estado, resultado, etc.). Usado activamente por el Agent SDK.

### Approvals
- **`GET /api/approvals`**: Lista las aprobaciones de seguridad pendientes.
- **`PATCH /api/approvals/[id]`**: Actualiza el estado de una aprobación (APROBAR o RECHAZAR).

### Goals
- **`GET /api/goals`**: Retorna los objetivos y su progreso, opcionalmente filtrados por `?projectId=X`.
- **`POST /api/goals`**: Crea un nuevo objetivo e inicializa su tarea de planificación asociada.

### Messages
- **`GET /api/messages`**: Lista los mensajes entre agentes. Soporta `?toAgent=X`, `?status=UNREAD`, etc.
- **`POST /api/messages`**: Envía un nuevo mensaje entre agentes. Valida tipos como `REQUEST`, `HANDOFF`, `FIX_REQUEST`, etc.
  - **Canal CONTROL**: Los mensajes de tipo `CONTROL` (ej. contenido `STOP`) enviados desde el UI notifican al worker para que termine su proceso limpiamente (graceful shutdown). El sistema actual (Fase 6) usa estos mensajes como un mecanismo "ACK-only" (el worker lee, emite log, y termina su proceso con `process.exit(0)`), sin implementar lógica de pausa real o manejo de estado complejo intermedio.

### Activity
- **`GET /api/activity`**: Retorna el log de actividad global de todos los agentes.
- **`POST /api/activity`**: Registra una nueva entrada en el log de actividad.

## Autenticación
Actualmente, los endpoints no requieren autenticación, ya que Control Center está diseñado para ejecutarse localmente como un orquestador personal (MVP).
