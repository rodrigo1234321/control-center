/**
 * QuotaGuard: Coordinador global de concurrencia y consumo de cuota para Antigravity.
 *
 * REGLA: Los roles de PLANNER y QA_VERIFIER (ambos potenciados por agy/Antigravity)
 * comparten ESTE semáforo único con concurrencia máxima = 1.
 * Esto evita el error de bloqueo "Individual quota reached" y optimiza el consumo de tokens.
 */

type Task<T> = () => Promise<T>;

export class QuotaGuard {
  private maxConcurrent: number;
  private running = 0;
  private queue: Array<() => void> = [];
  private totalJobsExecuted = 0;
  private lastJobExecutedAt: string | null = null;

  constructor(maxConcurrent = 1) {
    this.maxConcurrent = maxConcurrent;
  }

  async runWithGuard<T>(task: Task<T>): Promise<T> {
    await this.acquire();
    try {
      this.totalJobsExecuted += 1;
      this.lastJobExecutedAt = new Date().toISOString();
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

  get queueLength(): number {
    return this.queue.length;
  }

  get isBusy(): boolean {
    return this.running > 0;
  }

  get runningCount(): number {
    return this.running;
  }

  get metrics() {
    return {
      maxConcurrent: this.maxConcurrent,
      runningCount: this.running,
      queueLength: this.queue.length,
      isBusy: this.running > 0,
      totalJobsExecuted: this.totalJobsExecuted,
      lastJobExecutedAt: this.lastJobExecutedAt,
    };
  }
}

export const quotaGuard = new QuotaGuard(1);
