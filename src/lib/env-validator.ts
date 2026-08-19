/**
 * EnvironmentValidator: Validador de configuración y variables de entorno críticas.
 * Falla rápido y con mensajes explícitos antes de iniciar cualquier worker o servidor.
 */

export class EnvironmentValidator {
  static requireEnv(name: string, context = 'System'): string {
    const value = process.env[name];
    if (!value || value.trim() === '') {
      throw new Error(`[${context}] Error de configuración: falta la variable de entorno obligatoria '${name}'. Revisa tu archivo .env.`);
    }
    return value.trim();
  }

  static validateDatabase(context = 'Database'): string {
    return this.requireEnv('DATABASE_URL', context);
  }

  static validateWorker(agent: string): { databaseUrl: string; agyExecutable?: string; opencodeBin?: string } {
    const databaseUrl = this.validateDatabase(`Worker:${agent}`);
    let agyExecutable: string | undefined;
    let opencodeBin: string | undefined;

    if (agent === 'Antigravity') {
      agyExecutable = process.env.AGY_EXECUTABLE ?? 'C:\\Users\\rodri\\AppData\\Local\\agy\\bin\\agy.exe';
    }

    if (agent === 'OpenCode') {
      opencodeBin = process.env.OPENCODE_BIN ?? (process.platform === 'win32' ? 'opencode.cmd' : 'opencode');
    }

    return { databaseUrl, agyExecutable, opencodeBin };
  }
}
