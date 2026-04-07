/**
 * Room Service - Core service for room management
 * 
 * Responsibilities:
 * - Room CRUD operations
 * - Participant management
 * - Room message timeline projection
 * - Provide efficient query interfaces for UI
 */

import { 
  connect, 
  NatsConnection, 
  JetStreamClient,
} from 'nats';
import { 
  Room, 
  RoomType, 
  RoomStatus,
  Participant, 
  ParticipantType,
  RoomMessage,
  MessageType,
  createEventEnvelope,
  EventEnvelope,
  RoomCreatedPayload,
  MessagePostedPayload,
  RoomSubjects,
  SystemSubjects,
  QueueGroups,
  createLogger,
  validateRoomInput,
  validateRoomId,
  ValidationResult,
  PersistenceService,
} from '@fluxroom/shared';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// Room Service
// ============================================================

export class RoomService {
  private nc: NatsConnection;
  private js: JetStreamClient;
  private persistence?: PersistenceService;
  private rooms: Map<string, Room> = new Map();
  private participants: Map<string, Map<string, Participant>> = new Map();
  private messages: Map<string, RoomMessage[]> = new Map();
  private logger;
  private shutdownHandlers: (() => Promise<void>)[] = [];

  constructor(nc: NatsConnection, options?: { persistence?: PersistenceService }) {
    this.nc = nc;
    this.js = nc.jetstream();
    this.persistence = options?.persistence;
    this.logger = createLogger('room-service');
  }

  // ============================================================
  // Health Check
  // ============================================================

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded';
    uptime: number;
    rooms: number;
    persistence: boolean;
  }> {
    return {
      status: 'healthy',
      uptime: process.uptime(),
      rooms: this.rooms.size,
      persistence: !!this.persistence,
    };
  }

  // ============================================================
  // Room Management
  // ============================================================

  async createRoom(
    name: string,
    type: RoomType,
    createdBy: string,
    policyId?: string
  ): Promise<{ room?: Room; error?: string }> {
    // Validate input
    const validation = validateRoomInput({ name, type, createdBy, policyId });
    if (!validation.valid) {
      this.logger.warn('Invalid room input', { errors: validation.errors });
      return { error: validation.errors.join(', ') };
    }

    const roomId = `room_${uuidv4().slice(0, 8)}`;
    const room: Room = {
      id: roomId,
      name,
      type,
      status: 'active',
      createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      policyId,
    };

    this.rooms.set(room.id, room);
    this.participants.set(room.id, new Map());
    this.messages.set(room.id, []);

    // Create event envelope
    const event = createEventEnvelope<RoomCreatedPayload>(
      'room.created',
      { name, type, createdBy, policyId },
      { id: 'room-service', type: 'system', name: 'Room Service' },
      { roomId: room.id, traceId: `trace_${Date.now()}` }
    );

    // Publish to NATS
    await this.nc.publish(SystemSubjects.roomCreated, JSON.stringify(event));
    await this.nc.publish(RoomSubjects.event(room.id), JSON.stringify(event));

    // Persist if available
    if (this.persistence) {
      await this.persistence.publishEvent(RoomSubjects.event(room.id), event);
    }

    this.logger.info('Room created', { roomId, name, type, createdBy });
    return { room };
  }

  async getRoom(roomId: string): Promise<Room | undefined> {
    const validation = validateRoomId(roomId);
    if (!validation.valid) {
      this.logger.warn('Invalid room ID', { roomId, error: validation.errors });
      return undefined;
    }
    return this.rooms.get(roomId);
  }

  async updateRoomStatus(
    roomId: string, 
    status: RoomStatus
  ): Promise<{ room?: Room; error?: string }> {
    const validation = validateRoomId(roomId);
    if (!validation.valid) {
      return { error: validation.errors.join(', ') };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return { error: 'Room not found' };
    }

    room.status = status;
    room.updatedAt = new Date().toISOString();
    this.rooms.set(roomId, room);

    this.logger.info('Room status updated', { roomId, status });
    return { room };
  }

  async listRooms(): Promise<Room[]> {
    return Array.from(this.rooms.values());
  }

  async deleteRoom(roomId: string): Promise<{ success: boolean; error?: string }> {
    const validation = validateRoomId(roomId);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') };
    }

    if (!this.rooms.has(roomId)) {
      return { success: false, error: 'Room not found' };
    }

    this.rooms.delete(roomId);
    this.participants.delete(roomId);
    this.messages.delete(roomId);

    this.logger.info('Room deleted', { roomId });
    return { success: true };
  }

  // ============================================================
  // Participant Management
  // ============================================================

  async addParticipant(
    roomId: string,
    participantType: ParticipantType,
    displayName: string,
    role: string,
    runtimeRef?: string
  ): Promise<{ participant?: Participant; error?: string }> {
    // Validate inputs
    const roomValidation = validateRoomId(roomId);
    if (!roomValidation.valid) {
      return { error: roomValidation.errors.join(', ') };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return { error: 'Room not found' };
    }

    const participant: Participant = {
      id: `p_${uuidv4().slice(0, 8)}`,
      roomId,
      participantType,
      role,
      displayName,
      runtimeRef,
      presenceStatus: 'online',
      joinedAt: new Date().toISOString(),
    };

    const roomParticipants = this.participants.get(roomId)!;
    roomParticipants.set(participant.id, participant);

    // Publish event
    const event = createEventEnvelope(
      'participant.joined',
      { participant },
      { id: participant.id, type: participantType, name: displayName },
      { roomId }
    );

    await this.nc.publish(RoomSubjects.participantJoined(roomId), JSON.stringify(event));

    if (this.persistence) {
      await this.persistence.publishEvent(RoomSubjects.participantJoined(roomId), event);
    }

    this.logger.info('Participant joined', { 
      roomId, 
      participantId: participant.id, 
      displayName,
      participantType 
    });
    
    return { participant };
  }

  async removeParticipant(
    roomId: string, 
    participantId: string
  ): Promise<{ success: boolean; error?: string }> {
    const roomValidation = validateRoomId(roomId);
    if (!roomValidation.valid) {
      return { success: false, error: roomValidation.errors.join(', ') };
    }

    const roomParticipants = this.participants.get(roomId);
    if (!roomParticipants) {
      return { success: false, error: 'Room not found' };
    }

    const participant = roomParticipants.get(participantId);
    if (!participant) {
      return { success: false, error: 'Participant not found' };
    }

    roomParticipants.delete(participantId);

    // Publish event
    const event = createEventEnvelope(
      'participant.left',
      { participantId },
      { id: participant.id, type: participant.participantType, name: participant.displayName },
      { roomId }
    );

    await this.nc.publish(RoomSubjects.participantLeft(roomId), JSON.stringify(event));

    this.logger.info('Participant left', { roomId, participantId });
    return { success: true };
  }

  async getParticipants(roomId: string): Promise<Participant[]> {
    const roomParticipants = this.participants.get(roomId);
    return roomParticipants ? Array.from(roomParticipants.values()) : [];
  }

  async updateParticipantStatus(
    roomId: string,
    participantId: string,
    status: Participant['presenceStatus']
  ): Promise<boolean> {
    const roomParticipants = this.participants.get(roomId);
    if (!roomParticipants) return false;

    const participant = roomParticipants.get(participantId);
    if (!participant) return false;

    participant.presenceStatus = status;
    this.logger.debug('Participant status updated', { roomId, participantId, status });
    return true;
  }

  // ============================================================
  // Message Management
  // ============================================================

  async postMessage(
    roomId: string,
    senderId: string,
    senderType: ParticipantType,
    senderName: string,
    content: string,
    messageType: MessageType = 'text',
    threadId?: string,
    replyTo?: string
  ): Promise<{ message?: RoomMessage; error?: string }> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { error: 'Room not found' };
    }

    const message: RoomMessage = {
      id: `msg_${uuidv4().slice(0, 12)}`,
      roomId,
      senderId,
      senderType,
      senderName,
      messageType,
      content,
      threadId,
      replyTo,
      traceId: `trace_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    const roomMessages = this.messages.get(roomId)!;
    roomMessages.push(message);

    // Limit message history
    if (roomMessages.length > 10000) {
      roomMessages.splice(0, roomMessages.length - 10000);
    }

    // Publish event
    const event = createEventEnvelope<MessagePostedPayload>(
      'message.posted',
      { messageType, content, threadId, replyTo },
      { id: senderId, type: senderType, name: senderName },
      { roomId, traceId: message.traceId }
    );

    await this.nc.publish(RoomSubjects.message(roomId), JSON.stringify(event));
    await this.nc.publish(RoomSubjects.event(roomId), JSON.stringify(event));

    if (this.persistence) {
      await this.persistence.publishEvent(RoomSubjects.event(roomId), event);
    }

    return { message };
  }

  async getMessages(roomId: string, limit = 100, before?: string): Promise<RoomMessage[]> {
    const roomMessages = this.messages.get(roomId) || [];
    
    if (before) {
      return roomMessages
        .filter(m => m.createdAt < before)
        .slice(-limit);
    }
    
    return roomMessages.slice(-limit);
  }

  // ============================================================
  // Event Subscription
  // ============================================================

  async subscribeToRoomEvents(
    roomId: string, 
    handler: (event: EventEnvelope) => void
  ): Promise<() => void> {
    const sub = await this.nc.subscribe(
      RoomSubjects.event(roomId),
      { queue: QueueGroups.roomService }
    );

    (async () => {
      for await (const msg of sub) {
        try {
          const event = JSON.parse(msg.data.toString());
          handler(event);
        } catch (error) {
          this.logger.error('Failed to parse event', error as Error, { roomId });
        }
      }
    })();

    return () => sub.unsubscribe();
  }

  // ============================================================
  // Snapshot for UI
  // ============================================================

  async getRoomSnapshot(roomId: string): Promise<{
    room: Room | undefined;
    participants: Participant[];
    recentMessages: RoomMessage[];
  } | { error: string }> {
    const validation = validateRoomId(roomId);
    if (!validation.valid) {
      return { error: validation.errors.join(', ') };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return { error: 'Room not found' };
    }

    const participants = await this.getParticipants(roomId);
    const recentMessages = await this.getMessages(roomId, 50);

    return { room, participants, recentMessages };
  }

  // ============================================================
  // Graceful Shutdown
  // ============================================================

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down...');
    
    for (const handler of this.shutdownHandlers) {
      await handler();
    }
    
    this.logger.info('Shutdown complete');
  }
}

// ============================================================
// Bootstrap
// ============================================================

async function bootstrap() {
  const logger = createLogger('room-service');
  logger.info('Starting Room Service...');

  const nc = await connect({ 
    servers: process.env.NATS_URL || 'nats://localhost:4222',
    timeout: 10000,
    reconnect: true,
    maxReconnectAttempts: 10,
  });
  logger.info('Connected to NATS');

  const roomService = new RoomService(nc);

  // Health check endpoint (for monitoring)
  const healthPort = Number(process.env.HEALTH_PORT) || 8081;
  
  // Create demo room
  const result = await roomService.createRoom(
    'Demo Room',
    'task_room',
    'system',
    undefined
  );

  if (result.room) {
    logger.info('Demo room created', { roomId: result.room.id });
    
    await roomService.addParticipant(result.room.id, 'agent', 'Planner Agent', 'planner', 'planner-01');
    await roomService.addParticipant(result.room.id, 'agent', 'Executor Agent', 'executor', 'executor-01');
    await roomService.addParticipant(result.room.id, 'human', 'Demo User', 'owner');

    await roomService.postMessage(
      result.room.id,
      'room-service',
      'system',
      'Room Service',
      `Welcome! This is a demo room.`,
      'system'
    );
  }

  logger.info('Room Service ready', { roomId: result.room?.id });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Received shutdown signal...');
    await roomService.shutdown();
    await nc.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  console.error('Failed to start Room Service:', error);
  process.exit(1);
});
