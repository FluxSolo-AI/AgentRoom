/**
 * JetStream Persistence Layer
 * 
 * Provides event persistence and replay capabilities using NATS JetStream.
 */

import { 
  connect, 
  NatsConnection, 
  JetStreamClient,
  JetStreamManager,
  StreamConfig,
  ConsumerConfig,
  NatsError
} from 'nats';
import { EventEnvelope, createLogger, Logger } from '@fluxroom/shared';

// ============================================================
// Constants
// ============================================================

const STREAM_NAME = 'EVENTS';
const STREAM_SUBJECTS = ['room.>', 'orchestrator.>', 'agent.>', 'system.>'];
const CONSUMER_GROUP = 'fluxroom-persistence';

export const StreamNames = {
  EVENTS: STREAM_NAME,
  MESSAGES: 'MESSAGES',
  TASKS: 'TASKS',
} as const;

// ============================================================
// Persistence Service
// ============================================================

export class PersistenceService {
  private nc: NatsConnection;
  private js: JetStreamClient;
  private jsm: JetStreamManager;
  private logger: Logger;

  constructor(nc: NatsConnection, logger?: Logger) {
    this.nc = nc;
    this.js = nc.jetstream();
    this.jsm = nc.jetstreamManager();
    this.logger = logger || createLogger('persistence');
  }

  // ============================================================
  // Stream Management
  // ============================================================

  async initialize(): Promise<void> {
    this.logger.info('Initializing persistence streams...');

    try {
      // Create main events stream
      await this.createStreamIfNotExists(
        STREAM_NAME,
        STREAM_SUBJECTS,
        {
          maxBytes: 1024 * 1024 * 1024, // 1GB
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          storage: 'file',
          replicas: 1,
        }
      );

      this.logger.info('Persistence streams initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize persistence streams', error as Error);
      throw error;
    }
  }

  private async createStreamIfNotExists(
    name: string,
    subjects: string[],
    config?: Partial<StreamConfig>
  ): Promise<void> {
    try {
      const stream = await this.jsm.streams.info(name);
      this.logger.debug(`Stream ${name} already exists`, { 
        subjects: stream.subjects,
        state: stream.state 
      });
    } catch (error) {
      if ((error as NatsError).message?.includes('not found')) {
        const streamConfig: StreamConfig = {
          name,
          subjects,
          ...config,
        };
        
        await this.jsm.streams.add(streamConfig);
        this.logger.info(`Created stream: ${name}`, { subjects });
      } else {
        throw error;
      }
    }
  }

  // ============================================================
  // Event Publishing with Persistence
  // ============================================================

  async publishEvent<T>(
    subject: string,
    event: EventEnvelope<T>
  ): Promise<void> {
    try {
      // Publish with acknowledgement
      const pa = await this.js.publish(subject, JSON.stringify(event), {
        msgID: event.eventId,
      });

      this.logger.debug('Event published', {
        eventId: event.eventId,
        eventType: event.eventType,
        subject,
        seq: pa.seq,
      });
    } catch (error) {
      this.logger.error('Failed to publish event', error as Error, {
        eventId: event.eventId,
        subject,
      });
      throw error;
    }
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
    const { roomId, since, limit = 1000 } = options;
    
    let subject = roomId ? `room.${roomId}.>` : 'room.>';
    const events: EventEnvelope[] = [];

    try {
      // Get the stream info to find the starting sequence
      const stream = await this.jsm.streams.info(STREAM_NAME);
      let startSeq = 1;

      if (since) {
        // Find messages since the given date
        // Note: This is a simplified implementation
        // In production, you'd want to use a more efficient method
        startSeq = stream.state.first_seq;
      }

      // Create a consumer for replay
      const consumer = await this.js.consumers.get(STREAM_NAME);
      
      // Fetch events
      const messages = await consumer.fetch({
        expires: 5000,
        max_messages: limit,
      });

      for await (const msg of messages) {
        try {
          const event = JSON.parse(msg.data.toString()) as EventEnvelope;
          
          // Filter by room if specified
          if (roomId && event.roomId !== roomId) {
            msg.ack();
            continue;
          }
          
          // Filter by date if specified
          if (since) {
            const eventTime = new Date(event.timestamp);
            if (eventTime < since) {
              msg.ack();
              continue;
            }
          }
          
          events.push(event);
        } catch (parseError) {
          this.logger.warn('Failed to parse event during replay', {
            error: (parseError as Error).message,
          });
        }
        msg.ack();
      }

      this.logger.info('Event replay completed', {
        count: events.length,
        roomId,
        since,
      });

      return events;
    } catch (error) {
      this.logger.error('Event replay failed', error as Error, { roomId, since });
      throw error;
    }
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
  }> {
    const stream = await this.jsm.streams.info(STREAM_NAME);
    
    return {
      stream: stream.name,
      state: {
        messages: stream.state.messages,
        bytes: stream.state.bytes,
        firstSeq: Number(stream.state.first_seq),
        lastSeq: Number(stream.state.last_seq),
      },
    };
  }

  // ============================================================
  // Cleanup
  // ============================================================

  async purgeStream(name: string): Promise<void> {
    try {
      await this.jsm.streams.purge(name);
      this.logger.info(`Purged stream: ${name}`);
    } catch (error) {
      this.logger.error(`Failed to purge stream: ${name}`, error as Error);
      throw error;
    }
  }

  async deleteStream(name: string): Promise<void> {
    try {
      await this.jsm.streams.delete(name);
      this.logger.info(`Deleted stream: ${name}`);
    } catch (error) {
      this.logger.error(`Failed to delete stream: ${name}`, error as Error);
      throw error;
    }
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
  
  const nc = await connect({ servers: url });
  const persistence = new PersistenceService(nc, logger);
  await persistence.initialize();
  
  return persistence;
}
