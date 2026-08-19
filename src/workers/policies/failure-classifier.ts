/**
 * FailureClassifier: Categoriza errores de ejecución de agentes para determinar
 * si un fallo es transitorio, de código, de cuota, o un error fatal de autenticación/configuración.
 */

export type FailureCategory =
  | 'AUTH'        // Errores de IAM, permisos, tokens, 401, 403 -> NO REINTENTAR, frenar y alertar
  | 'CONFIG'      // Faltan variables de entorno, binarios o rutas -> NO REINTENTAR, escalar a humano
  | 'QUOTA'       // 429, Rate limit, Resource Exhausted -> REINTENTO CON BACKOFF
  | 'TRANSIENT'   // Timeout, caída de red, 500, 502, 503, ECONNRESET -> REINTENTO LIMITADO
  | 'CODE'        // Error de compilación, sintaxis, tests o git diff -> FIX_REQUEST
  | 'SYSTEM';     // Error interno no clasificado

export interface ClassifiedFailure {
  category: FailureCategory;
  isRetryable: boolean;
  requiresHumanIntervention: boolean;
  suggestedAction: 'STOP_AND_ALERT' | 'WAIT_AND_RETRY' | 'AUTO_FIX' | 'ESCALATE_APPROVAL';
  reason: string;
}

const AUTH_PATTERNS = [
  /M_PERMISSION_DENIED/i,
  /IAM_PERMISSION_DENIED/i,
  /PERMISSION_DENIED/i,
  /authentication required/i,
  /invalid_grant/i,
  /invalid_api_key/i,
  /unauthorized/i,
  /forbidden/i,
  /401/i,
  /403/i,
  /cloudaicompanion\.instances/i,
];

const QUOTA_PATTERNS = [
  /429/i,
  /rate_limit/i,
  /quota exceeded/i,
  /resource_exhausted/i,
  /too many requests/i,
  /individual quota reached/i,
];

const TRANSIENT_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /econnreset/i,
  /etimedout/i,
  /500/i,
  /502/i,
  /503/i,
  /504/i,
  /socket hang up/i,
  /network error/i,
];

const CONFIG_PATTERNS = [
  /missing required environment variable/i,
  /enoent/i,
  /einval/i,
  /spawn\s+einval/i,
  /invalid config/i,
  /cannot find module/i,
];

export class FailureClassifier {
  static classify(errorText: string | null | undefined): ClassifiedFailure {
    const text = (errorText ?? '').trim();
    if (!text) {
      return {
        category: 'SYSTEM',
        isRetryable: false,
        requiresHumanIntervention: true,
        suggestedAction: 'STOP_AND_ALERT',
        reason: 'Error no especificado',
      };
    }

    // 1. Detección de Errores de Autenticación / IAM (Crítico: NUNCA REINTENTAR EN BUCLE)
    for (const pattern of AUTH_PATTERNS) {
      if (pattern.test(text)) {
        return {
          category: 'AUTH',
          isRetryable: false,
          requiresHumanIntervention: true,
          suggestedAction: 'STOP_AND_ALERT',
          reason: `Fallo de autenticación o permisos del proveedor (${pattern.source}). No se reintentará automáticamente para evitar consumir recursos.`,
        };
      }
    }

    // 2. Detección de Errores de Configuración / Variables faltantes
    for (const pattern of CONFIG_PATTERNS) {
      if (pattern.test(text)) {
        return {
          category: 'CONFIG',
          isRetryable: false,
          requiresHumanIntervention: true,
          suggestedAction: 'ESCALATE_APPROVAL',
          reason: `Fallo de configuración o entorno (${pattern.source}). Requiere intervención técnica.`,
        };
      }
    }

    // 3. Detección de Cuota / Rate Limits (Reintentable con backoff)
    for (const pattern of QUOTA_PATTERNS) {
      if (pattern.test(text)) {
        return {
          category: 'QUOTA',
          isRetryable: true,
          requiresHumanIntervention: false,
          suggestedAction: 'WAIT_AND_RETRY',
          reason: `Límite de cuota o rate limit alcanzado. Se aplicará retroceso exponencial (backoff).`,
        };
      }
    }

    // 4. Detección de Errores Transitorios de Red / Timeouts
    for (const pattern of TRANSIENT_PATTERNS) {
      if (pattern.test(text)) {
        return {
          category: 'TRANSIENT',
          isRetryable: true,
          requiresHumanIntervention: false,
          suggestedAction: 'WAIT_AND_RETRY',
          reason: `Error transitorio de red o timeout. Reintentable de forma limitada.`,
        };
      }
    }

    // 5. Errores de Código / Lógica / Tests (Ciclo de Fix Request)
    return {
      category: 'CODE',
      isRetryable: true,
      requiresHumanIntervention: false,
      suggestedAction: 'AUTO_FIX',
      reason: 'Fallo en la verificación del código generado. Asignable a ciclo de corrección (FIX_REQUEST).',
    };
  }
}
