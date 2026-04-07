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
  consumerOpts,
  createInbox 
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
  QueueGroups
} from '@fluxroom/shared';
import { v4 as uuidv4 } from 'uuid';

export class RoomService {
  private nc: NatsConnection;
  private js: JetStreamClient;
  private rooms: Map<string, Room> = new Map();
  private participants: Map<string, Map<string, Participant>> = new Map(); // roomId -> participantId -> participant
  private messages: Map<string, RoomMessage[]> = new Map(); // roomId -> messages

  constructor(nc: NatsConnection) {
    this.nc = nc;
    this.js = nc.jetstream();
  }

  // ============================================================
  // Room Management
  // ============================================================

  async createRoom(
    name: string,
    type: RoomType,
    createdBy: string,
    policyId?: string
  ): Promise<Room> {
    const room: Room = {
      id: `room_${uuidv4().slice(0, 8)}`,
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

    // Publish room.created event
    const event = createEventEnvelope<RoomCreatedPayload>(
      'room.created',
      { name, type, createdBy, policyId },
      { id: 'room-service', type: 'system', name: 'Room Service' },
      { roomId: room.id, traceId: `trace_${Date.now()}` }
    );

    await this.nc.publish(SystemSubjects.roomCreated, JSON.stringify(event));
    await this.nc.publish(RoomSubjects.event(room.id), JSON.stringify(event));

    console.log(`[RoomService] Room created: ${room.id} (${name})`);
    return room;
  }

  async getRoom(roomId: string): Promise<Room | undefined> {
    return this.rooms.get(roomId);
  }

  async updateRoomStatus(roomId: string, status: RoomStatus): Promise<Room | undefined> {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    room.status = status;
    room.updatedAt = new Date().toISOString();
    this.rooms.set(roomId, room);

    return room;
  }

  async listRooms(): Promise<Room[]> {
    return Array.from(this.rooms.values());
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
  ): Promise<Participant | undefined> {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

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

    // Publish participant.joined event
    const event = createEventEnvelope(
      'participant.joined',
      { participant },
      { id: participant.id, type: participantType, name: displayName },
      { roomId }
    );

    await this.nc.publish(RoomSubjects.participantJoined(roomId), JSON.stringify(event));

    console.log(`[RoomService] Participant joined: ${participant.id} (${displayName}) in room ${roomId}`);
    return participant;
  }

  async removeParticipant(roomId: string, participantId: string): Promise<boolean> {
    const roomParticipants = this.participants.get(roomId);
    if (!roomParticipants) return false;

    const participant = roomParticipants.get(participantId);
    if (!participant) return false;

    roomParticipants.delete(participantId);

    // Publish participant.left event
    const event = createEventEnvelope(
      'participant.left',
      { participantId },
      { id: participant.id, type: participant.participantType, name: participant.displayName },
      { roomId }
    );

    await this.nc.publish(RoomSubjects.participantLeft(roomId), JSON.stringify(event));

    return true;
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
  ): Promise<RoomMessage | undefined> {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

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

    // Publish message.posted event
    const event = createEventEnvelope<MessagePostedPayload>(
      'message.posted',
      { messageType, content, threadId, replyTo },
      { id: senderId, type: senderType, name: senderName },
      { roomId, traceId: message.traceId }
    );

    await this.nc.publish(RoomSubjects.message(roomId), JSON.stringify(event));
    await this.nc.publish(RoomSubjects.event(roomId), JSON.stringify(event));

    return message;
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

  async subscribeToRoomEvents(roomId: string, handler: (event: EventEnvelope) => void): Promise<() => void> {
    const sub = await this.nc.subscribe(
      RoomSubjects.event(roomId),
      { queue: QueueGroups.roomService }
    );

    const handlerFn = (msg: any) => {
      try {
        const event = JSON.parse(msg.data.toString());
        handler(event);
      } catch (e) {
        console.error('[RoomService] Failed to parse event:', e);
      }
    };

    (async () => {
      for await (const msg of sub) {
        handlerFn(msg);
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
  }> {
    const room = this.rooms.get(roomId);
    const participants = await this.getParticipants(roomId);
    const recentMessages = await this.getMessages(roomId, 50);

    return { room, participants, recentMessages };
  }
}

// ============================================================
// Bootstrap
// ============================================================

async function bootstrap() {
  console.log('[RoomService] Starting...');
  
  const nc = await connect({ servers: process.env.NATS_URL || 'nats://localhost:4222' });
  console.log('[RoomService] Connected to NATS');
  
  const roomService = new RoomService(nc);

  // Create a demo room for testing
  const demoRoom = await roomService.createRoom(
    'Demo Room',
    'task_room',
    'system',
    undefined
  );

  console.log(`[RoomService] Demo room created: ${demoRoom.id}`);
  
  // Add demo participants
  await roomService.addParticipant(demoRoom.id, 'agent', 'Planner Agent', 'planner', 'planner-01');
  await roomService.addParticipant(demoRoom.id, 'agent', 'Executor Agent', 'executor', 'executor-01');
  await roomService.addParticipant(demoRoom.id, 'human', 'Demo User', 'owner');

  // Post welcome message
  await roomService.postMessage(
    demoRoom.id,
    'room-service',
    'system',
    'Room Service',
    `Welcome to ${demoRoom.name}! This is a demo room for testing.`,
    'system'
  );

  console.log('[RoomService] Demo room initialized');
  console.log(`[RoomService] Room ID: ${demoRoom.id}`);
  console.log('[RoomService] Waiting for events...');

  // Keep the service running
  process.on('SIGINT', async () => {
    console.log('[RoomService] Shutting down...');
    await nc.close();
    process.exit(0);
  });
}

bootstrap().catch(console.error);
