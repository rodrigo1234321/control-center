import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ValidationResult {
  resultFilePresent: boolean;
  resultFileContent: unknown | null;
  gitDiffSummary: string | null;
  filesChanged: string[];
  expectedFilesOk: boolean;
}

/**
 * La validación de verdad NUNCA vive adentro del prompt del agente.
 * Se comprueba, desde afuera:
 *   1) si escribió el archivo de resultado que le pedimos (RESULT.json)
 *   2) qué cambió realmente en el disco según git
 *   3) si los archivos esperados (research.md, etc.) existen en el workspace
 */
export async function validateWorkspace(
  workspacePath: string,
  opts: { resultFileName: string; expectedFiles: string[] }
): Promise<ValidationResult> {
  const resultPath = path.join(workspacePath, opts.resultFileName);
  let resultFilePresent = false;
  let resultFileContent: unknown | null = null;

  try {
    const raw = await readFile(resultPath, 'utf-8');
    resultFileContent = JSON.parse(raw);
    resultFilePresent = true;
  } catch {
    // Sin resultado, o JSON inválido. Continuamos con validación de disco y git.
  }

  let gitDiffSummary: string | null = null;
  let filesChanged: string[] = [];
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--stat'], { cwd: workspacePath });
    gitDiffSummary = stdout.trim() || null;
    const { stdout: nameOnly } = await execFileAsync('git', ['diff', '--name-only'], { cwd: workspacePath });
    filesChanged = nameOnly.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    // Workspace sin diff o sin repositorio git inicializado
  }

  let expectedFilesOk = true;
  for (const rel of opts.expectedFiles) {
    try {
      await access(path.join(workspacePath, rel));
    } catch {
      expectedFilesOk = false;
    }
  }

  return { resultFilePresent, resultFileContent, gitDiffSummary, filesChanged, expectedFilesOk };
}
