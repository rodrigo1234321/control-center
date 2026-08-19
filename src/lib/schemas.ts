import { z } from 'zod';
import { TASK_STATES, APPROVAL_STATUSES, AGENTS, MESSAGE_TYPES } from './types';

export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio'),
  description: z.string().optional(),
  projectId: z.string().min(1, 'El projectId es obligatorio'),
  goalId: z.string().optional().nullable(),
  agent: z.enum(AGENTS, { message: `El agente debe ser uno de: ${AGENTS.join(', ')}` }),
  state: z.enum(TASK_STATES).optional().default('BACKLOG'),
  requiresApproval: z.boolean().optional().default(false),
  nextAgent: z.string().optional().nullable(),
  onFailureAgent: z.string().optional().nullable(),
});

export const UpdateTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  state: z.enum(TASK_STATES).optional(),
  result: z.string().optional().nullable(),
  agent: z.enum(AGENTS).optional(),
  requiresApproval: z.boolean().optional(),
  handedOff: z.boolean().optional(),
});

export const CreateGoalSchema = z.object({
  title: z.string().min(1, 'El título del goal es obligatorio'),
  description: z.string().optional(),
  projectId: z.string().min(1, 'El projectId es obligatorio'),
});

export const UpdateGoalSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'FAILED', 'PAUSED']).optional(),
});

export const CreateProjectSchema = z.object({
  name: z.string().min(1, 'El nombre del proyecto es obligatorio'),
  slug: z.string().min(1, 'El slug es obligatorio'),
  description: z.string().optional(),
  repoPath: z.string().optional().nullable(),
});

export const CreateMessageSchema = z.object({
  taskId: z.string().optional().nullable(),
  goalId: z.string().optional().nullable(),
  fromAgent: z.string().min(1, 'fromAgent es obligatorio'),
  toAgent: z.string().min(1, 'toAgent es obligatorio'),
  type: z.enum(MESSAGE_TYPES, { message: `El tipo debe ser uno de: ${MESSAGE_TYPES.join(', ')}` }),
  content: z.string().min(1, 'El contenido del mensaje es obligatorio'),
});

export const ResolveApprovalSchema = z.object({
  status: z.enum(APPROVAL_STATUSES, { message: `El estado debe ser uno de: ${APPROVAL_STATUSES.join(', ')}` }),
  resolvedNote: z.string().optional(),
});

export const ActivityQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  projectId: z.string().optional(),
  agent: z.string().optional(),
});
