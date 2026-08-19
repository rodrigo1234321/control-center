/**
 * Security Guard: Mecanismo de defensa en profundidad para Control Center y OpenClaw.
 * Implementa las 4 barreras de seguridad.
 */

const BLOCKED_PATTERNS = [
  /\b(git\s+push\s+.*--force)\b/i,
  /\b(rm\s+-rf\s+[/~])\b/i,
  /\b(format\s+[c-z]:)\b/i,
  /\b(drop\s+database)\b/i,
  /\b(export\s+.*TOKEN|export\s+.*KEY)\b/i,
];

const SECRET_PATTERNS = [
  /AIzaSy[A-Za-z0-9-_]{30,45}/g, // Google API Key
  /sk-[A-Za-z0-9-_]{20,80}/g,    // OpenAI / Anthropic / OpenRouter Keys
  /ghp_[A-Za-z0-9]{30,50}/g,     // GitHub Token
  /xox[baprs]-[A-Za-z0-9-_]{20,80}/g,// Slack Token
  /bot[0-9]{8,12}:[A-Za-z0-9_-]{30,50}/g, // Telegram Token
];

export interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
  sanitizedText?: string;
}

export class SecurityGuard {
  /**
   * Valida si un comando o instrucción está dentro de las políticas de seguridad permitidas.
   */
  static validateInstruction(text: string): SecurityCheckResult {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(text)) {
        return {
          allowed: false,
          reason: `Instrucción bloqueada por política de seguridad: coincide con patrón peligroso (${pattern.source})`,
        };
      }
    }

    if (/(\.env|credentials\.json|id_rsa)\s*$/i.test(text.trim()) && /cat|type|read|get/i.test(text)) {
      return {
        allowed: false,
        reason: 'Intento de lectura directa de archivos de credenciales bloqueado por política de seguridad.',
      };
    }

    return { allowed: true };
  }

  /**
   * Sanitiza respuestas para prevenir fugas accidentales de secretos hacia el canal de chat.
   */
  static sanitizeOutput(text: string): string {
    let sanitized = text;
    for (const pattern of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      sanitized = sanitized.replace(new RegExp(pattern.source, 'g'), '[REDACTED_SECRET]');
    }
    return sanitized;
  }

  /**
   * Valida autorización de usuario por ID numérico estricto.
   */
  static isUserAuthorized(userId: string | number, allowedUsers: (string | number)[]): boolean {
    if (!allowedUsers || allowedUsers.length === 0) return false;
    const strId = String(userId).trim();
    return allowedUsers.map(String).includes(strId);
  }
}
