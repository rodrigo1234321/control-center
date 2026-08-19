import os from 'node:os';
import path from 'node:path';

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
      const defaultAgy = process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe')
        : 'agy';
      agyExecutable = process.env.AGY_EXECUTABLE ?? defaultAgy;
    }

    if (agent === 'OpenCode') {
      const defaultOpencode = process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
        : 'opencode';
      opencodeBin = process.env.OPENCODE_BIN ?? defaultOpencode;
    }

    return { databaseUrl, agyExecutable, opencodeBin };
  }
}
