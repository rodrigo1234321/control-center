/**
 * Circuit breaker por task: evita el loop infinito
 *   QA falla -> FIX_REQUEST -> OpenCode intenta -> QA falla -> FIX_REQUEST -> ...
 * que quema cuota de Antigravity sin límite.
 *
 * IMPORTANTE: esto guarda estado EN MEMORIA del proceso. Sirve para probar
 * el flujo, pero antes de confiar en esto en producción, movelo a una
 * columna `fixAttempts` / `circuitOpenedAt` en tu modelo Task de Prisma —
 * así sobrevive a un restart de Control Center y es consistente si en
 * algún momento corrés más de una instancia.
 */

interface CircuitState {
  failures: number;
  openedAt: string | null;
}

const MAX_ATTEMPTS = 3;
const state = new Map<string, CircuitState>();

export function recordFailure(taskId: string): CircuitState {
  const current = state.get(taskId) ?? { failures: 0, openedAt: null };
  current.failures += 1;
  if (current.failures >= MAX_ATTEMPTS && !current.openedAt) {
    current.openedAt = new Date().toISOString();
  }
  state.set(taskId, current);
  return current;
}

export function isCircuitOpen(taskId: string): boolean {
  return state.get(taskId)?.openedAt != null;
}

export function resetCircuit(taskId: string): void {
  state.delete(taskId);
}

export function getCircuitState(taskId: string): CircuitState | undefined {
  return state.get(taskId);
}
