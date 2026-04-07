// ============================================================
// Event Envelope and Event Types
// ============================================================

import { ParticipantType } from './types';

export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: EventType;
  roomId?: string;
  taskId?: string;
  interventionId?: string;
  sender: {
    id: string;
    type: ParticipantType;
    name: string;
  };
  traceId?: string;
  timestamp: string;
  payload: T;
}

export type EventType =
  // Room Events
  | 'room.created'
  | 'room.updated'
  | 'room.closed'
  | 'room.archived'
  | 'participant.joined'
  | 'participant.left'
  | 'participant.status_changed'
  
  // Message Events
  | 'message.posted'
  
  // Task Events
  | 'task.created'
  | 'task.assigned'
  | 'task.started'
  | 'task.progressed'
  | 'task.blocked'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled'
  
  // Intervention Events
  | 'intervention.requested'
  | 'intervention.accepted'
  | 'intervention.resolved'
  | 'intervention.rejected'
  | 'intervention.timeout'
  
  // Agent Events
  | 'agent.status_changed'
  | 'agent.heartbeat'
  | 'agent.error'
  
  // Policy Events
  | 'policy.violation.detected';

// ============================================================
// Event Payloads
// ============================================================

export interface RoomCreatedPayload {
  name: string;
  type: string;
  createdBy: string;
  policyId?: string;
}

export interface MessagePostedPayload {
  messageType: string;
  content: string;
  threadId?: string;
  replyTo?: string;
}

export interface TaskCreatedPayload {
  title: string;
  goal: string;
  parentTaskId?: string;
  assignedTo?: string;
  assignedAgentType?: string;
  priority: string;
  requiresHuman: boolean;
}

export interface TaskAssignedPayload {
  taskId: string;
  assignedTo: string;
  assignedAgentType?: string;
}

export interface TaskProgressedPayload {
  taskId: string;
  progress: number;
  message?: string;
}

export interface InterventionRequestedPayload {
  interventionType: string;
  taskId?: string;
  reason: string;
  payload?: Record<string, unknown>;
  timeoutAt?: string;
}

export interface InterventionResolvedPayload {
  interventionType: string;
  resolvedBy: string;
  resumePolicy?: string;
  message?: string;
}

export interface AgentStatusChangedPayload {
  agentId: string;
  agentType: string;
  status: string;
  roomId?: string;
  taskId?: string;
}

export interface AgentHeartbeatPayload {
  agentId: string;
  roomId?: string;
  taskId?: string;
  load: number;
  lastError?: string;
}

// ============================================================
// Helper function to create event envelope
// ============================================================

export function createEventEnvelope<T>(
  eventType: EventType,
  payload: T,
  sender: { id: string; type: ParticipantType; name: string },
  options?: {
    roomId?: string;
    taskId?: string;
    interventionId?: string;
    traceId?: string;
  }
): EventEnvelope<T> {
  return {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    eventType,
    roomId: options?.roomId,
    taskId: options?.taskId,
    interventionId: options?.interventionId,
    sender,
    traceId: options?.traceId,
    timestamp: new Date().toISOString(),
    payload,
  };
}
