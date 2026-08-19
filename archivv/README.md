# Antigravity Worker Adapter — para Control Center

Reemplaza el hook mockeado (`fs.writeFile` simulando research.md / QA) por
invocaciones reales a `agy` (Antigravity CLI), diseñado alrededor de tres
problemas **verificados** contra el repo público
`google-antigravity/antigravity-cli` en agosto de 2026, no supuestos:

## Los 3 hallazgos que determinan este diseño

1. **`agy --print` no escribe nada a stdout si stdout no es un TTY**
   ([issue #408](https://github.com/google-antigravity/antigravity-cli/issues/408),
   reproducido en la versión 1.0.9). `spawn()` siempre da un pipe no-TTY,
   así que **nunca vas a poder leer la respuesta de Antigravity por stdout**
   desde un proceso Node. Por eso el contrato con el agente acá es "escribí
   tu resultado en un archivo (`RESULT.json`)", no "imprimilo en consola".
   `--output-format json` se pasa igual por si algún día ayuda, pero
   tratalo como bonus, no como dependencia (el issue de salida
   estructurada, [#394](https://github.com/google-antigravity/antigravity-cli/issues/394),
   sigue abierto).

2. **`--sandbox` + `--dangerously-skip-permissions` deja el sandbox
   inútil** ([issue #36](https://github.com/google-antigravity/antigravity-cli/issues/36)):
   el modelo puede pedir `bypassSandbox: true` y con
   `--dangerously-skip-permissions` eso se autoaprueba junto con todo lo
   demás. Consecuencia práctica: **este runner no usa `--sandbox`**,
   porque daría una falsa sensación de seguridad. El aislamiento real
   tiene que venir de afuera — corré este worker dentro de un contenedor
   Docker o una VM donde `workspacePath` sea el único directorio
   realmente escribible, nunca contra tu filesystem principal de Windows.

3. **Auth por credencial cacheada, sin API key documentada.** El modo
   headless usa la sesión del keyring del sistema — logueate una vez de
   forma interactiva (`agy` → login) con la **misma cuenta de Windows**
   bajo la que corre la tarea de autoarranque de tu OpenClaw Gateway (o
   el proceso de Control Center, según dónde termine viviendo esto). Si
   las credenciales cacheadas no están disponibles para ese usuario, la
   corrida headless falla con `authentication required` — el smoke test
   A lo detecta.

## Archivos

| Archivo | Qué hace |
|---|---|
| `types.ts` | Contratos de entrada/salida del job |
| `semaphore.ts` | Concurrencia global = 1 para todos los jobs de Antigravity (Planner + QA comparten cuota) |
| `circuit-breaker.ts` | Corta el loop FIX_REQUEST↔QA después de 3 fallos — mové esto a Prisma antes de producción |
| `validator.ts` | Validación real: lee RESULT.json si existe, pero la fuente de verdad es `git diff` + archivos esperados en disco |
| `workspace-manager.ts` | Clona cada job a una carpeta descartable con rama `cc/<jobId>` — nunca sobre el checkout principal |
| `runner.ts` | El adapter en sí: arma el prompt corto + TASK.md, invoca `agy`, mata por timeout externo, nunca confía en exit 0 solo |
| `health.ts` | Suite de 8 smoke tests (A–H) para correr a mano antes de conectar esto al pipeline real |
| `index.ts` | Punto de entrada (`runAntigravityWithCircuitBreaker`) que llama Control Center |

## Cómo integrarlo a lo que ya tenés

En tu protocolo MCP de 12 tools, el handler de `claim_task` para una task
de rol Planner o QA (Antigravity) es donde hoy vive el mock. Reemplazalo por:

```ts
import { createJobWorkspace, runAntigravityWithCircuitBreaker } from './antigravity-worker';

const workspacePath = await createJobWorkspace(job.id, repoUrl, baseBranch);
await writeFile(path.join(workspacePath, 'TASK.md'), buildTaskPrompt(task)); // vos armás el contenido real acá
const result = await runAntigravityWithCircuitBreaker({
  jobId: job.id,
  taskId: task.id,
  goalId: task.goalId,
  role: task.stage === 'PLAN' ? 'PLANNER' : 'QA_VERIFIER',
  workspacePath,
  expectedFiles: task.stage === 'PLAN' ? ['research.md'] : [],
});

if (result.status === 'COMPLETED') {
  await complete_task(task.id, result);
} else if (result.status === 'NEEDS_APPROVAL') {
  await notifyHuman(result.failureReason); // acá engancha OpenClaw/Telegram más adelante
} else {
  await fail_task(task.id, result.failureReason);
}
```

## Orden para probarlo (no te saltees pasos)

1. `npm i` (o el equivalente en tu proyecto) — sin dependencias externas,
   solo Node built-ins (`node:child_process`, `node:fs/promises`).
2. Logueate una vez con `agy` en la máquina/cuenta que va a correr esto.
3. Corré `runAntigravitySmokeTests()` de `health.ts` a mano. Las 8 tienen
   que pasar antes de tocar Control Center.
4. Reemplazá el hook mockeado de la etapa **Planner** primero (es la de
   menor riesgo — solo produce `research.md`).
5. Recién después reemplazá el hook de **QA/Verifier**, con
   `expectedFiles` y validación de `git diff`/tests reales, no
   autoreporte del agente.
6. Ahí activá el circuit breaker (ya viene armado en `index.ts`) y
   probá el loop completo Goal → Planner → Design → Coder → QA →
   FIX_REQUEST → QA hasta 3 intentos.
7. Recién en ese punto conectá OpenClaw/Telegram arriba de todo esto —
   sigue hablando con Control Center vía tus 12 MCP tools existentes,
   nunca directo con `agy`.

## Lo que falta migrar a producción

- `circuit-breaker.ts` usa un `Map` en memoria — pasalo a una columna en
  tu modelo `Task` de Prisma antes de confiar en esto en serio.
- `workspace-manager.ts` asume Windows (`C:\AI\runtime\jobs`) — ajustá
  `CC_RUNTIME_ROOT` por env var si corrés esto dentro de un contenedor Linux.
- Ninguno de estos archivos fuerza el aislamiento por contenedor — eso es
  responsabilidad de **dónde** corrés el proceso Node que importa este
  módulo, no del módulo en sí. No lo olvides: es el punto de seguridad
  más importante de todo esto.
