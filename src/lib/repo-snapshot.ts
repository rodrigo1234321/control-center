import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

/**
 * Snapshot de un repoPath basado en mtime+size de cada archivo. No depende de
 * git (los fixtures de test no siempre son un repo git), así que sirve tanto
 * para proyectos reales como para test-fixtures/agents.
 *
 * Se usa para detectar si un agente realmente tocó el disco entre el momento
 * en que reclamó la tarea (RUNNING) y el momento en que la marcó DONE — que es
 * exactamente el hueco que permite que un fallo headless silencioso (exit 0,
 * sin escritura real) se cuele como éxito.
 */
export async function snapshotRepo(repoPath: string): Promise<string> {
  const entries: string[] = [];
  const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build']);

  async function walk(dir: string) {
    let items: string[];
    try {
      items = await fs.readdir(dir);
    } catch {
      return; // el directorio puede no existir todavía (ej. antes del primer write)
    }
    for (const item of items) {
      if (SKIP_DIRS.has(item)) continue;
      const full = path.join(dir, item);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat) continue;
      if (stat.isDirectory()) {
        await walk(full);
      } else {
        entries.push(`${path.relative(repoPath, full)}:${stat.size}:${stat.mtimeMs}`);
      }
    }
  }

  await walk(repoPath);
  entries.sort();
  return crypto.createHash('sha256').update(entries.join('\n')).digest('hex');
}
