/**
 * Centralized CONTROL protocol for worker orchestration.
 *
 * Workers parse these exact prefixes when handling messages of type CONTROL.
 * UI components must use these helpers instead of sending bare state names.
 */
export const CONTROL_COMMANDS = {
  STOP: 'STOP',
  STOP_TASK: (id: string) => `STOP_TASK:${id}`,
  PAUSE_TASK: (id: string) => `PAUSE_TASK:${id}`,
  RESUME_TASK: (id: string) => `RESUME_TASK:${id}`,
} as const;

/** Parse a CONTROL message back into its command and optional task id. */
export function parseControlCommand(
  content: string
): { command: keyof typeof CONTROL_COMMANDS; taskId?: string } {
  for (const key of ['STOP_TASK', 'PAUSE_TASK', 'RESUME_TASK'] as const) {
    const prefix = `${key}:`;
    if (content.startsWith(prefix)) {
      const taskId = content.slice(prefix.length).trim() || undefined;
      return { command: key, taskId };
    }
  }
  if (content === CONTROL_COMMANDS.STOP || content === 'STOP_ALL') {
    return { command: 'STOP' };
  }
  if (content === 'PAUSE' || content === 'PAUSE_ALL') {
    return { command: 'PAUSE_TASK' };
  }
  throw new Error(`Unknown CONTROL command: ${content}`);
}