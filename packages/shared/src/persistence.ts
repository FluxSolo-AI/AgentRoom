/**
 * JetStream Persistence Layer
 * 
 * Provides event persistence and replay capabilities using NATS JetStream.
 * 
 * NOTE: This is a simplified implementation. In production, you would
 * use the full nats.ws or nats.deno client with proper type definitions.
 */

import { createLogger, Logger } from './logger';

// ============================================================
// Constants
// ============================================================

const STREAM_NAME = 'EVENTS';

export const StreamNames = {
  EVENTS: STREAM_NAME,
  MESSAGES: 'MESSAGES',
  TASKS: 'TASKS',
} as const;

// ============================================================
// Types (simplified for compatibility)
// ============================================================

export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  roomId?: string;
  taskId?: string;
  interventionId?: string;
  sender: {
    id: string;
    type: 'human' | 'agent' | 'system';
    name: string;
  };
  traceId?: string;
  timestamp: string;
  payload: T;
}

interface StreamInfo {
  name: string;
  subjects: string[];
  state: {
    messages: number;
    bytes: number;
    first_seq: number;
    last_seq: number;
  };
}

// ============================================================
// Persistence Service (Simplified)
// ============================================================

export class PersistenceService {
  private logger: Logger;
  private initialized: boolean = false;

  constructor(logger?: Logger) {
    this.logger = logger || createLogger('persistence');
  }

  // ============================================================
  // Initialization
  // ============================================================

  async initialize(): Promise<void> {
    this.logger.info('Initializing persistence service...');
    
    // In production, this would:
    // 1. Connect to NATS
    // 2. Create JetStream manager
    // 3. Create streams if they don't exist
    
    this.initialized = true;
    this.logger.info('Persistence service initialized (mock mode)');
  }

  // ============================================================
  // Event Publishing
  // ============================================================

  async publishEvent<T>(
    subject: string,
    event: EventEnvelope<T>
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error('Persistence service not initialized');
    }

    this.logger.debug('Event published', {
      eventId: event.eventId,
      eventType: event.eventType,
      subject,
    });

    // In production, this would publish to JetStream:
    // await js.publish(subject, JSON.stringify(event), { msgID: event.eventId });
  }

  // ============================================================
  // Event Replay
  // ============================================================

  async replayEvents(
    options: {
      roomId?: string;
      since?: Date;
      limit?: number;
    } = {}
  ): Promise<EventEnvelope[]> {
    const { limit = 1000 } = options;
    
    this.logger.info('Event replay requested', options);
    
    // In production, this would:
    // 1. Create a consumer on the stream
    // 2. Fetch messages matching the criteria
    // 3. Return parsed EventEnvelope objects
    
    return [];
  }

  // ============================================================
  // Stream Health
  // ============================================================

  async getStreamHealth(): Promise<{
    stream: string;
    state: {
      messages: number;
      bytes: number;
      firstSeq: number;
      lastSeq: number;
    };
  } | null> {
    // In production, this would query JetStream for stream info
    return {
      stream: STREAM_NAME,
      state: {
        messages: 0,
        bytes: 0,
        firstSeq: 0,
        lastSeq: 0,
      },
    };
  }

  // ============================================================
  // Cleanup
  // ============================================================

  async purgeStream(name: string): Promise<void> {
    this.logger.info(`Purging stream: ${name}`);
    // In production: await jsm.streams.purge(name);
  }

  async deleteStream(name: string): Promise<void> {
    this.logger.info(`Deleting stream: ${name}`);
    // In production: await jsm.streams.delete(name);
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

// ============================================================
// Bootstrap Helper
// ============================================================

export async function createPersistenceService(
  natsUrl?: string,
  logger?: Logger
): Promise<PersistenceService> {
  const url = natsUrl || process.env.NATS_URL || 'nats://localhost:4222';
  
  const persistence = new PersistenceService(logger);
  await persistence.initialize();
  
  return persistence;
}
