/** Valid task states matching the 5-state machine */
export const TASK_STATES = ['BACKLOG', 'RUNNING', 'REVIEW', 'DONE', 'FAILED', 'PAUSED', 'BLOCKED'] as const;
export type TaskState = (typeof TASK_STATES)[number];

/** Valid approval statuses */
export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** Known agent identifiers */
export const AGENTS = ['Antigravity', 'OpenCode', 'OpenHands', 'OpenDesign'] as const;
export type Agent = (typeof AGENTS)[number];

/** Approval action types */
export const ACTION_TYPES = ['DEPLOY', 'DELETE', 'CLIENT_ACTION'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** Agent message types */
export const MESSAGE_TYPES = [
  'REQUEST', 'HANDOFF', 'QUESTION', 'RESPONSE', 
  'REVIEW', 'FIX_REQUEST', 'INFO', 'ERROR', 
  'CONTROL', 'ACK'
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

/** Valid state transitions */
export const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
  BACKLOG: ['RUNNING', 'PAUSED', 'BLOCKED'],
  RUNNING: ['REVIEW', 'DONE', 'FAILED', 'PAUSED', 'BLOCKED'],
  REVIEW: ['DONE', 'FAILED'],
  DONE: [],
  FAILED: ['BACKLOG', 'PAUSED', 'BLOCKED'],
  PAUSED: ['RUNNING', 'BACKLOG', 'FAILED', 'BLOCKED'],
  BLOCKED: ['RUNNING', 'BACKLOG', 'PAUSED', 'FAILED'],
};

/** Check if a state transition is valid */
export function isValidTransition(from: TaskState, to: TaskState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Badge color mapping for task states (Tailwind classes) */
export const STATE_COLORS: Record<string, { bg: string; text: string }> = {
  BACKLOG: { bg: 'bg-zinc-700', text: 'text-zinc-300' },
  RUNNING: { bg: 'bg-blue-900', text: 'text-blue-300' },
  REVIEW: { bg: 'bg-amber-900', text: 'text-amber-300' },
  DONE: { bg: 'bg-emerald-900', text: 'text-emerald-300' },
  FAILED: { bg: 'bg-red-900', text: 'text-red-300' },
  PAUSED: { bg: 'bg-yellow-900', text: 'text-yellow-300' },
  BLOCKED: { bg: 'bg-orange-900', text: 'text-orange-300' },
  UNKNOWN: { bg: 'bg-neutral-800', text: 'text-neutral-400' },
};

/** Badge color mapping for approval statuses */
export const APPROVAL_COLORS: Record<ApprovalStatus, { bg: string; text: string }> = {
  PENDING: { bg: 'bg-amber-900', text: 'text-amber-300' },
  APPROVED: { bg: 'bg-emerald-900', text: 'text-emerald-300' },
  REJECTED: { bg: 'bg-red-900', text: 'text-red-300' },
};
