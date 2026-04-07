/**
 * Input Validation Layer
 * 
 * Provides validation utilities for all incoming data.
 */

import { RoomType, TaskPriority, InterventionType, MessageType } from './types';

// ============================================================
// Validation Result
// ============================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function createError(field: string, message: string): ValidationResult {
  return { valid: false, errors: [`${field}: ${message}`] };
}

export function createSuccess(): ValidationResult {
  return { valid: true, errors: [] };
}

export function combineResults(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap(r => r.errors);
  return { valid: errors.length === 0, errors };
}

// ============================================================
// String Validators
// ============================================================

export function validateString(
  value: unknown,
  fieldName: string,
  options?: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
  }
): ValidationResult {
  if (typeof value !== 'string') {
    return createError(fieldName, 'must be a string');
  }

  const { minLength = 1, maxLength = 1000, pattern } = options || {};

  if (value.length < minLength) {
    return createError(fieldName, `must be at least ${minLength} characters`);
  }

  if (value.length > maxLength) {
    return createError(fieldName, `must be at most ${maxLength} characters`);
  }

  if (pattern && !pattern.test(value)) {
    return createError(fieldName, 'has invalid format');
  }

  return createSuccess();
}

// ============================================================
// Room Validators
// ============================================================

export function validateRoomName(name: unknown): ValidationResult {
  return validateString(name, 'room name', { minLength: 1, maxLength: 200 });
}

export function validateRoomType(type: unknown): ValidationResult {
  const validTypes: RoomType[] = ['task_room', 'incident_room', 'review_room'];
  
  if (typeof type !== 'string' || !validTypes.includes(type as RoomType)) {
    return createError('room type', `must be one of: ${validTypes.join(', ')}`);
  }
  
  return createSuccess();
}

export function validateRoomInput(input: {
  name?: unknown;
  type?: unknown;
  createdBy?: unknown;
  policyId?: unknown;
}): ValidationResult {
  const results: ValidationResult[] = [];

  results.push(validateRoomName(input.name));
  results.push(validateRoomType(input.type));
  results.push(validateString(input.createdBy, 'createdBy', { minLength: 1, maxLength: 64 }));
  
  if (input.policyId !== undefined) {
    results.push(validateString(input.policyId, 'policyId', { maxLength: 64 }));
  }

  return combineResults(...results);
}

// ============================================================
// Task Validators
// ============================================================

export function validateTaskTitle(title: unknown): ValidationResult {
  return validateString(title, 'task title', { minLength: 1, maxLength: 500 });
}

export function validateTaskGoal(goal: unknown): ValidationResult {
  return validateString(goal, 'task goal', { minLength: 1, maxLength: 10000 });
}

export function validateTaskPriority(priority: unknown): ValidationResult {
  const validPriorities: TaskPriority[] = ['low', 'medium', 'high', 'critical'];
  
  if (typeof priority !== 'string' || !validPriorities.includes(priority as TaskPriority)) {
    return createError('priority', `must be one of: ${validPriorities.join(', ')}`);
  }
  
  return createSuccess();
}

export function validateTaskInput(input: {
  title?: unknown;
  goal?: unknown;
  priority?: unknown;
  requiresHuman?: unknown;
  parentTaskId?: unknown;
}): ValidationResult {
  const results: ValidationResult[] = [];

  results.push(validateTaskTitle(input.title));
  results.push(validateTaskGoal(input.goal));
  
  if (input.priority !== undefined) {
    results.push(validateTaskPriority(input.priority));
  }
  
  if (input.requiresHuman !== undefined && typeof input.requiresHuman !== 'boolean') {
    results.push(createError('requiresHuman', 'must be a boolean'));
  }
  
  if (input.parentTaskId !== undefined) {
    results.push(validateString(input.parentTaskId, 'parentTaskId', { maxLength: 64 }));
  }

  return combineResults(...results);
}

// ============================================================
// Message Validators
// ============================================================

export function validateMessageContent(content: unknown): ValidationResult {
  return validateString(content, 'content', { minLength: 1, maxLength: 50000 });
}

export function validateMessageType(type: unknown): ValidationResult {
  const validTypes: MessageType[] = ['text', 'command', 'event', 'intervention', 'system'];
  
  if (typeof type !== 'string' || !validTypes.includes(type as MessageType)) {
    return createError('messageType', `must be one of: ${validTypes.join(', ')}`);
  }
  
  return createSuccess();
}

// ============================================================
// Intervention Validators
// ============================================================

export function validateInterventionType(type: unknown): ValidationResult {
  const validTypes: InterventionType[] = [
    'comment', 'nudge', 'approve', 'reject', 
    'takeover', 'resume', 'pause_room', 'kill_task'
  ];
  
  if (typeof type !== 'string' || !validTypes.includes(type as InterventionType)) {
    return createError('interventionType', `must be one of: ${validTypes.join(', ')}`);
  }
  
  return createSuccess();
}

// ============================================================
// ID Validators
// ============================================================

const ID_PATTERN = /^[a-z0-9_-]{1,64}$/i;

export function validateId(id: unknown, fieldName: string): ValidationResult {
  if (typeof id !== 'string') {
    return createError(fieldName, 'must be a string');
  }
  
  if (!ID_PATTERN.test(id)) {
    return createError(fieldName, 'contains invalid characters or is too long');
  }
  
  return createSuccess();
}

export function validateRoomId(roomId: unknown): ValidationResult {
  return validateId(roomId, 'roomId');
}

export function validateTaskId(taskId: unknown): ValidationResult {
  return validateId(taskId, 'taskId');
}

export function validateInterventionId(interventionId: unknown): ValidationResult {
  return validateId(interventionId, 'interventionId');
}
