import { FailureClassifier, ClassifiedFailure } from './failure-classifier';

export interface RetryDecision {
  shouldRetry: boolean;
  classification: ClassifiedFailure;
  backoffMs: number;
  openCircuit: boolean;
  createApproval: boolean;
  description: string;
}

const MAX_RETRIES = 3;

export class RetryPolicy {
  /**
   * Determina la decisión de reintento basada en la clasificación del error y el conteo de reintentos actual.
   */
  static evaluate(errorText: string | null | undefined, currentRetryCount: number): RetryDecision {
    const classification = FailureClassifier.classify(errorText);

    // Si es un error de AUTH o CONFIG -> JAMÁS REINTENTAR AUTOMÁTICAMENTE
    if (!classification.isRetryable) {
      return {
        shouldRetry: false,
        classification,
        backoffMs: 0,
        openCircuit: true,
        createApproval: true,
        description: `Bloqueado por política: ${classification.reason}`,
      };
    }

    // Si alcanzó el máximo de reintentos permitidos -> CORTAR Y CREAR APROBACIÓN
    if (currentRetryCount >= MAX_RETRIES) {
      return {
        shouldRetry: false,
        classification,
        backoffMs: 0,
        openCircuit: true,
        createApproval: true,
        description: `Límite máximo de reintentos alcanzado (${currentRetryCount}/${MAX_RETRIES}). Requiere intervención humana.`,
      };
    }

    // Si es un error de cuota -> Backoff exponencial (30s, 60s, 120s)
    if (classification.category === 'QUOTA') {
      const backoffMs = Math.pow(2, currentRetryCount) * 30_000;
      return {
        shouldRetry: true,
        classification,
        backoffMs,
        openCircuit: false,
        createApproval: false,
        description: `Reintento programado con backoff de ${backoffMs / 1000}s.`,
      };
    }

    // Errores de código o transitorios -> Reintentar vía FIX_REQUEST o reintento directo
    return {
      shouldRetry: true,
      classification,
      backoffMs: 1000,
      openCircuit: false,
      createApproval: false,
      description: `Reintento válido (${currentRetryCount + 1}/${MAX_RETRIES}): ${classification.reason}`,
    };
  }
}
