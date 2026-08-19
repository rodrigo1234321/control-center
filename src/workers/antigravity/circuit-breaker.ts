import { prisma } from '../../lib/prisma';

export interface CircuitState {
  failures: number;
  openedAt: string | null;
}

const MAX_ATTEMPTS = 3;
const memoryFallbackState = new Map<string, CircuitState>();

/**
 * Registra un fallo de verificación en la tarea.
 * Si alcanza el umbral de 3 reintentos, abre el circuito persistiendo circuitOpenedAt en la base de datos.
 */
export async function recordFailure(taskId: string): Promise<CircuitState> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { retryCount: true, circuitOpenedAt: true },
    });

    const newFailures = (task?.retryCount ?? 0) + 1;
    const shouldOpen = newFailures >= MAX_ATTEMPTS && !task?.circuitOpenedAt;
    const openedAt = shouldOpen ? new Date() : task?.circuitOpenedAt ?? null;

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        retryCount: newFailures,
        circuitOpenedAt: openedAt,
      },
      select: { retryCount: true, circuitOpenedAt: true },
    });

    return {
      failures: updated.retryCount,
      openedAt: updated.circuitOpenedAt ? updated.circuitOpenedAt.toISOString() : null,
    };
  } catch {
    // Fallback a memoria si se corre en entorno de tests sin SQLite
    const current = memoryFallbackState.get(taskId) ?? { failures: 0, openedAt: null };
    current.failures += 1;
    if (current.failures >= MAX_ATTEMPTS && !current.openedAt) {
      current.openedAt = new Date().toISOString();
    }
    memoryFallbackState.set(taskId, current);
    return current;
  }
}

/**
 * Verifica si el circuito está abierto para la tarea dada.
 */
export async function isCircuitOpen(taskId: string): Promise<boolean> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { circuitOpenedAt: true },
    });
    return task?.circuitOpenedAt != null;
  } catch {
    return memoryFallbackState.get(taskId)?.openedAt != null;
  }
}

/**
 * Resetea el circuito y los reintentos tras un éxito o intervención humana.
 */
export async function resetCircuit(taskId: string): Promise<void> {
  try {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        retryCount: 0,
        circuitOpenedAt: null,
      },
    });
  } catch {
    memoryFallbackState.delete(taskId);
  }
}

/**
 * Obtiene el estado actual del circuito para inspección/diagnóstico.
 */
export async function getCircuitState(taskId: string): Promise<CircuitState | undefined> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { retryCount: true, circuitOpenedAt: true },
    });
    if (!task) return undefined;
    return {
      failures: task.retryCount,
      openedAt: task.circuitOpenedAt ? task.circuitOpenedAt.toISOString() : null,
    };
  } catch {
    return memoryFallbackState.get(taskId);
  }
}
