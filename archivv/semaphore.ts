/**
 * Semáforo de concurrencia dedicado a Antigravity/agy.
 *
 * POR QUÉ ESTO EXISTE: la cuota de `agy` se comparte entre la app de
 * escritorio, el CLI y el SDK, y los subagentes la consumen en paralelo —
 * hay reportes de bloqueo ("Individual quota reached") después de apenas
 * un par de prompts si corrés varias sesiones a la vez. Es la misma
 * familia de problema que ya viste con 3 procesos de OpenCode sobre el
 * mismo modelo gratis, pero acá el techo se golpea más rápido.
 *
 * REGLA: Planner y QA_VERIFIER (ambos son Antigravity) comparten ESTE
 * mismo semáforo global, no uno por rol. Si OpenCode u Open Design tienen
 * su propio límite de concurrencia, van en un semáforo separado — no
 * mezclar presupuestos de proveedores distintos.
 */

type Task<T> = () => Promise<T>;

export class AntigravitySemaphore {
  private maxConcurrent: number;
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent = 1) {
    this.maxConcurrent = maxConcurrent;
  }

  async run<T>(task: Task<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.running -= 1;
    const next = this.queue.shift();
    if (next) next();
  }

  /** cuántos jobs están esperando turno ahora mismo (útil para exponer en /status por OpenClaw) */
  get pending(): number {
    return this.queue.length;
  }

  get isBusy(): boolean {
    return this.running > 0;
  }
}

// Empezá en 1. Si tenés un Google Cloud project con billing habilitado y
// confirmás en la práctica que 2 en paralelo no te tira "Individual quota
// reached", subilo — pero arrancá conservador.
export const antigravitySemaphore = new AntigravitySemaphore(1);
