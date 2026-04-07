/**
 * Context Management System
 * 
 * Provides context isolation and management for multi-agent collaboration.
 * Each room has its own context that agents can read from and write to.
 */

import { createLogger, Logger } from './logger';

// ============================================================
// Context Types
// ============================================================

export type ContextEntryType = 
  | 'message' 
  | 'task' 
  | 'tool_result' 
  | 'observation' 
  | 'summary'
  | 'metadata';

export interface ContextEntry {
  id: string;
  type: ContextEntryType;
  content: unknown;
  createdAt: string;
  createdBy: string; // agent ID or 'system'
  roomId: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}

export interface ContextWindow {
  maxTokens?: number;
  maxEntries?: number;
  strategy: 'sliding' | 'summary' | 'breakdown';
}

export interface RoomContext {
  roomId: string;
  entries: ContextEntry[];
  summary?: string;
  createdAt: string;
  updatedAt: string;
  metadata: {
    totalMessages: number;
    totalTasks: number;
    totalToolCalls: number;
    participants: string[];
  };
}

// ============================================================
// Context Manager
// ============================================================

export class ContextManager {
  private contexts: Map<string, RoomContext> = new Map();
  private logger: Logger;
  private defaultWindow: ContextWindow = {
    maxEntries: 100,
    strategy: 'sliding',
  };

  constructor(logger?: Logger) {
    this.logger = logger || createLogger('context-manager');
  }

  // ============================================================
  // Context Lifecycle
  // ============================================================

  createContext(roomId: string): RoomContext {
    if (this.contexts.has(roomId)) {
      this.logger.warn('Context already exists, returning existing', { roomId });
      return this.contexts.get(roomId)!;
    }

    const context: RoomContext = {
      roomId,
      entries: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        totalMessages: 0,
        totalTasks: 0,
        totalToolCalls: 0,
        participants: [],
      },
    };

    this.contexts.set(roomId, context);
    this.logger.info('Context created', { roomId });

    return context;
  }

  getContext(roomId: string): RoomContext | undefined {
    return this.contexts.get(roomId);
  }

  deleteContext(roomId: string): boolean {
    const deleted = this.contexts.delete(roomId);
    if (deleted) {
      this.logger.info('Context deleted', { roomId });
    }
    return deleted;
  }

  // ============================================================
  // Entry Management
  // ============================================================

  addEntry(
    roomId: string,
    type: ContextEntryType,
    content: unknown,
    createdBy: string,
    options?: {
      taskId?: string;
      metadata?: Record<string, unknown>;
    }
  ): ContextEntry | undefined {
    let context = this.contexts.get(roomId);

    if (!context) {
      context = this.createContext(roomId);
    }

    const entry: ContextEntry = {
      id: `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      content,
      createdAt: new Date().toISOString(),
      createdBy,
      roomId,
      taskId: options?.taskId,
      metadata: options?.metadata,
    };

    context.entries.push(entry);
    context.updatedAt = new Date().toISOString();

    // Update metadata
    this.updateMetadata(context, type);

    // Apply window strategy
    this.applyWindowStrategy(roomId);

    this.logger.debug('Context entry added', { 
      roomId, 
      entryId: entry.id, 
      type,
      createdBy 
    });

    return entry;
  }

  getEntries(
    roomId: string,
    options?: {
      type?: ContextEntryType;
      taskId?: string;
      limit?: number;
      since?: Date;
    }
  ): ContextEntry[] {
    const context = this.contexts.get(roomId);
    if (!context) return [];

    let entries = context.entries;

    // Filter by type
    if (options?.type) {
      entries = entries.filter(e => e.type === options.type);
    }

    // Filter by task
    if (options?.taskId) {
      entries = entries.filter(e => e.taskId === options.taskId);
    }

    // Filter by date
    if (options?.since) {
      entries = entries.filter(e => new Date(e.createdAt) >= options.since!);
    }

    // Sort by creation time (newest first)
    entries = entries.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Apply limit
    if (options?.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  getRecentEntries(roomId: string, limit = 50): ContextEntry[] {
    return this.getEntries(roomId, { limit });
  }

  getTaskContext(roomId: string, taskId: string): ContextEntry[] {
    return this.getEntries(roomId, { taskId });
  }

  // ============================================================
  // Summary Management
  // ============================================================

  setSummary(roomId: string, summary: string): void {
    const context = this.contexts.get(roomId);
    if (!context) {
      this.logger.warn('Cannot set summary, context not found', { roomId });
      return;
    }

    context.summary = summary;
    context.updatedAt = new Date().toISOString();

    this.addEntry(roomId, 'summary', summary, 'system', {
      metadata: { type: 'auto_summary' },
    });

    this.logger.debug('Context summary updated', { roomId, summaryLength: summary.length });
  }

  getSummary(roomId: string): string | undefined {
    return this.contexts.get(roomId)?.summary;
  }

  // ============================================================
  // Participant Tracking
  // ============================================================

  addParticipant(roomId: string, participantId: string): void {
    const context = this.contexts.get(roomId);
    if (!context) return;

    if (!context.metadata.participants.includes(participantId)) {
      context.metadata.participants.push(participantId);
      context.updatedAt = new Date().toISOString();
    }
  }

  getParticipants(roomId: string): string[] {
    return this.contexts.get(roomId)?.metadata.participants || [];
  }

  // ============================================================
  // Window Strategy
  // ============================================================

  private applyWindowStrategy(roomId: string): void {
    const context = this.contexts.get(roomId);
    if (!context) return;

    const strategy = this.defaultWindow;

    if (strategy.maxEntries && context.entries.length > strategy.maxEntries) {
      switch (strategy.strategy) {
        case 'sliding':
          // Keep most recent entries
          context.entries = context.entries.slice(-strategy.maxEntries);
          this.logger.debug('Applied sliding window', { 
            roomId, 
            entriesRemoved: context.entries.length - strategy.maxEntries 
          });
          break;

        case 'summary':
          // Summarize older entries and keep recent
          const keepCount = Math.floor(strategy.maxEntries * 0.7);
          const olderEntries = context.entries.slice(0, -keepCount);
          
          if (olderEntries.length > 0) {
            // Create a summary of older entries
            const summary = this.summarizeEntries(olderEntries);
            context.entries = [
              ...context.entries.slice(-keepCount),
              {
                id: `ctx_summary_${Date.now()}`,
                type: 'summary' as ContextEntryType,
                content: summary,
                createdAt: new Date().toISOString(),
                createdBy: 'system',
                roomId,
                metadata: { type: 'window_summary', originalCount: olderEntries.length },
              },
            ];
          }
          break;

        case 'breakdown':
          // Keep one entry per type per task
          const seen = new Set<string>();
          context.entries = context.entries.reverse().filter(entry => {
            const key = `${entry.type}:${entry.taskId || 'global'}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }).reverse();
          break;
      }

      context.updatedAt = new Date().toISOString();
    }
  }

  private summarizeEntries(entries: ContextEntry[]): string {
    // Simple summarization - in production, this would use LLM
    const messageCount = entries.filter(e => e.type === 'message').length;
    const taskCount = entries.filter(e => e.type === 'task').length;
    const toolCount = entries.filter(e => e.type === 'tool_result').length;

    return `[Context Summary] ${entries.length} entries: ${messageCount} messages, ${taskCount} tasks, ${toolCount} tool calls.`;
  }

  private updateMetadata(context: RoomContext, type: ContextEntryType): void {
    switch (type) {
      case 'message':
        context.metadata.totalMessages++;
        break;
      case 'task':
        context.metadata.totalTasks++;
        break;
      case 'tool_result':
        context.metadata.totalToolCalls++;
        break;
    }
  }

  // ============================================================
  // Query Helpers
  // ============================================================

  search(roomId: string, query: string): ContextEntry[] {
    const context = this.contexts.get(roomId);
    if (!context) return [];

    const queryLower = query.toLowerCase();
    
    return context.entries.filter(entry => {
      if (typeof entry.content === 'string') {
        return entry.content.toLowerCase().includes(queryLower);
      }
      if (typeof entry.content === 'object') {
        return JSON.stringify(entry.content).toLowerCase().includes(queryLower);
      }
      return false;
    });
  }

  getStats(roomId: string): {
    totalEntries: number;
    byType: Record<ContextEntryType, number>;
    oldestEntry?: string;
    newestEntry?: string;
  } {
    const context = this.contexts.get(roomId);
    if (!context) {
      return { totalEntries: 0, byType: {} as Record<ContextEntryType, number> };
    }

    const byType: Record<ContextEntryType, number> = {} as Record<ContextEntryType, number>;
    for (const entry of context.entries) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
    }

    return {
      totalEntries: context.entries.length,
      byType,
      oldestEntry: context.entries[0]?.createdAt,
      newestEntry: context.entries[context.entries.length - 1]?.createdAt,
    };
  }

  // ============================================================
  // Persistence Helpers
  // ============================================================

  exportContext(roomId: string): string | undefined {
    const context = this.contexts.get(roomId);
    if (!context) return undefined;
    return JSON.stringify(context);
  }

  importContext(roomId: string, data: string): boolean {
    try {
      const context = JSON.parse(data) as RoomContext;
      this.contexts.set(roomId, context);
      this.logger.info('Context imported', { roomId, entries: context.entries.length });
      return true;
    } catch (error) {
      this.logger.error('Failed to import context', error as Error, { roomId });
      return false;
    }
  }
}

// ============================================================
// Singleton for global access
// ============================================================

export const globalContextManager = new ContextManager();
