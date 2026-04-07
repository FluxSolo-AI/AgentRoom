/**
 * Context Manager Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager, ContextEntryType } from '../context';

describe('ContextManager', () => {
  let context: ContextManager;
  const testRoomId = 'test_room_123';

  beforeEach(() => {
    context = new ContextManager();
    context.createContext(testRoomId);
  });

  describe('Context Lifecycle', () => {
    it('should create a new context', () => {
      const ctx = context.getContext(testRoomId);
      expect(ctx).toBeDefined();
      expect(ctx?.roomId).toBe(testRoomId);
    });

    it('should return existing context if already exists', () => {
      const ctx1 = context.getContext(testRoomId);
      const ctx2 = context.getContext(testRoomId);
      expect(ctx1).toBe(ctx2);
    });

    it('should delete context', () => {
      const deleted = context.deleteContext(testRoomId);
      expect(deleted).toBe(true);
      expect(context.getContext(testRoomId)).toBeUndefined();
    });

    it('should return false when deleting non-existent context', () => {
      const deleted = context.deleteContext('non_existent_room');
      expect(deleted).toBe(false);
    });
  });

  describe('Entry Management', () => {
    it('should add entries to context', () => {
      const entry = context.addEntry(
        testRoomId,
        'message',
        { text: 'Hello' },
        'agent_01'
      );

      expect(entry).toBeDefined();
      expect(entry?.type).toBe('message');
      expect(entry?.content).toEqual({ text: 'Hello' });
    });

    it('should track entries by type', () => {
      context.addEntry(testRoomId, 'message', { text: 'msg1' }, 'user1');
      context.addEntry(testRoomId, 'task', { taskId: 'task1' }, 'agent1');
      context.addEntry(testRoomId, 'tool_result', { toolId: 'tool1' }, 'agent1');

      const messages = context.getEntries(testRoomId, { type: 'message' });
      const tasks = context.getEntries(testRoomId, { type: 'task' });
      const tools = context.getEntries(testRoomId, { type: 'tool_result' });

      expect(messages).toHaveLength(1);
      expect(tasks).toHaveLength(1);
      expect(tools).toHaveLength(1);
    });

    it('should get recent entries with limit', () => {
      for (let i = 0; i < 10; i++) {
        context.addEntry(testRoomId, 'message', { index: i }, 'user');
      }

      const recent = context.getRecentEntries(testRoomId, 5);
      expect(recent).toHaveLength(5);
    });

    it('should get entries by task ID', () => {
      context.addEntry(testRoomId, 'task', { id: 'task1' }, 'agent', { taskId: 'task1' });
      context.addEntry(testRoomId, 'message', { text: 'comment' }, 'user', { taskId: 'task1' });

      const taskEntries = context.getTaskContext(testRoomId, 'task1');
      expect(taskEntries).toHaveLength(2);
    });
  });

  describe('Summary Management', () => {
    it('should set and get summary', () => {
      context.setSummary(testRoomId, 'Test summary');
      const summary = context.getSummary(testRoomId);
      expect(summary).toBe('Test summary');
    });

    it('should add summary as entry', () => {
      context.setSummary(testRoomId, 'Auto summary');
      const entries = context.getEntries(testRoomId, { type: 'summary' });
      expect(entries).toHaveLength(1);
      expect(entries[0].content).toBe('Auto summary');
    });
  });

  describe('Participant Tracking', () => {
    it('should track participants', () => {
      context.addParticipant(testRoomId, 'user1');
      context.addParticipant(testRoomId, 'user2');
      context.addParticipant(testRoomId, 'user1'); // duplicate

      const participants = context.getParticipants(testRoomId);
      expect(participants).toHaveLength(2);
      expect(participants).toContain('user1');
      expect(participants).toContain('user2');
    });
  });

  describe('Search', () => {
    it('should search context entries', () => {
      context.addEntry(testRoomId, 'message', { text: 'Hello world' }, 'user1');
      context.addEntry(testRoomId, 'message', { text: 'Goodbye' }, 'user2');
      context.addEntry(testRoomId, 'task', { description: 'Hello task' }, 'agent');

      const results = context.search(testRoomId, 'Hello');
      expect(results.length).toBe(2);
    });
  });

  describe('Statistics', () => {
    it('should provide context stats', () => {
      context.addEntry(testRoomId, 'message', { text: 'msg' }, 'user');
      context.addEntry(testRoomId, 'message', { text: 'msg' }, 'user');
      context.addEntry(testRoomId, 'task', { id: 'task1' }, 'agent');
      context.addEntry(testRoomId, 'tool_result', { toolId: 'tool1' }, 'agent');

      const stats = context.getStats(testRoomId);
      expect(stats.totalEntries).toBe(4);
      expect(stats.byType.message).toBe(2);
      expect(stats.byType.task).toBe(1);
      expect(stats.byType.tool_result).toBe(1);
    });
  });

  describe('Export/Import', () => {
    it('should export context as JSON', () => {
      context.addEntry(testRoomId, 'message', { text: 'test' }, 'user');
      const exported = context.exportContext(testRoomId);
      
      expect(exported).toBeDefined();
      const parsed = JSON.parse(exported!);
      expect(parsed.roomId).toBe(testRoomId);
      expect(parsed.entries).toHaveLength(1);
    });

    it('should import context from JSON', () => {
      context.addEntry(testRoomId, 'message', { text: 'original' }, 'user');
      const exported = context.exportContext(testRoomId);

      const newContext = new ContextManager();
      const success = newContext.importContext('imported_room', exported!);
      
      expect(success).toBe(true);
      const imported = newContext.getContext('imported_room');
      expect(imported?.entries).toHaveLength(1);
    });
  });
});
