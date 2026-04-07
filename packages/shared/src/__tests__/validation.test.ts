/**
 * Validation Tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateRoomName,
  validateRoomType,
  validateRoomInput,
  validateTaskTitle,
  validateTaskGoal,
  validateTaskPriority,
  validateTaskInput,
  validateMessageContent,
  validateId,
  validateRoomId,
  validateTaskId,
  combineResults,
  createError,
  createSuccess,
} from '../validation';

describe('Validation Utilities', () => {
  describe('createError / createSuccess', () => {
    it('should create error result', () => {
      const result = createError('field', 'message');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('field: message');
    });

    it('should create success result', () => {
      const result = createSuccess();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should combine multiple results', () => {
      const results = [createSuccess(), createSuccess()];
      const combined = combineResults(...results);
      expect(combined.valid).toBe(true);
    });
  });

  describe('validateRoomName', () => {
    it('should accept valid room names', () => {
      expect(validateRoomName('My Room').valid).toBe(true);
      expect(validateRoomName('A').valid).toBe(true);
    });

    it('should reject empty names', () => {
      expect(validateRoomName('').valid).toBe(false);
      expect(validateRoomName(null).valid).toBe(false);
      expect(validateRoomName(undefined).valid).toBe(false);
    });

    it('should reject names that are too long', () => {
      const longName = 'a'.repeat(201);
      expect(validateRoomName(longName).valid).toBe(false);
    });
  });

  describe('validateRoomType', () => {
    it('should accept valid room types', () => {
      expect(validateRoomType('task_room').valid).toBe(true);
      expect(validateRoomType('incident_room').valid).toBe(true);
      expect(validateRoomType('review_room').valid).toBe(true);
    });

    it('should reject invalid room types', () => {
      expect(validateRoomType('invalid').valid).toBe(false);
      expect(validateRoomType('').valid).toBe(false);
    });
  });

  describe('validateRoomInput', () => {
    it('should validate complete room input', () => {
      const result = validateRoomInput({
        name: 'Test Room',
        type: 'task_room',
        createdBy: 'user123',
      });
      expect(result.valid).toBe(true);
    });

    it('should fail with invalid input', () => {
      const result = validateRoomInput({
        name: '',
        type: 'invalid',
        createdBy: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateTaskPriority', () => {
    it('should accept valid priorities', () => {
      expect(validateTaskPriority('low').valid).toBe(true);
      expect(validateTaskPriority('medium').valid).toBe(true);
      expect(validateTaskPriority('high').valid).toBe(true);
      expect(validateTaskPriority('critical').valid).toBe(true);
    });

    it('should reject invalid priorities', () => {
      expect(validateTaskPriority('urgent').valid).toBe(false);
      expect(validateTaskPriority('').valid).toBe(false);
    });
  });

  describe('validateId', () => {
    it('should accept valid IDs', () => {
      expect(validateId('room_abc123', 'roomId').valid).toBe(true);
      expect(validateId('task_xyz', 'taskId').valid).toBe(true);
      expect(validateId('a1-b2_c3', 'id').valid).toBe(true);
    });

    it('should reject invalid IDs', () => {
      expect(validateId('', 'id').valid).toBe(false);
      expect(validateId('a'.repeat(65), 'id').valid).toBe(false);
      expect(validateId('invalid id', 'id').valid).toBe(false);
    });
  });

  describe('validateRoomId', () => {
    it('should validate room IDs', () => {
      expect(validateRoomId('room_abc123').valid).toBe(true);
    });
  });

  describe('validateTaskId', () => {
    it('should validate task IDs', () => {
      expect(validateTaskId('task_xyz789').valid).toBe(true);
    });
  });
});
