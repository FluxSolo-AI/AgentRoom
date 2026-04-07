// ============================================================
// Core Entity Types for AgentRoom
// ============================================================

// Room Types
export type RoomType = 'task_room' | 'incident_room' | 'review_room';
export type RoomStatus = 'active' | 'paused' | 'waiting_human' | 'completed' | 'archived';
export type ParticipantType = 'human' | 'agent' | 'system';
export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  status: RoomStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contextRef?: string;
  policyId?: string;
}

export interface Participant {
  id: string;
  roomId: string;
  participantType: ParticipantType;
  role: string;
  displayName: string;
  runtimeRef?: string;
  presenceStatus: PresenceStatus;
  joinedAt: string;
}

// Message Types
export type MessageType = 'text' | 'command' | 'event' | 'intervention' | 'system';

export interface RoomMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderType: ParticipantType;
  senderName: string;
  messageType: MessageType;
  threadId?: string;
  replyTo?: string;
  content: string;
  attachments?: string[];
  traceId?: string;
  createdAt: string;
}

// Task Types
export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'blocked' | 'waiting_human' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
  id: string;
  roomId: string;
  parentTaskId?: string;
  title: string;
  goal: string;
  assignedTo?: string;
  assignedAgentType?: string;
  status: TaskStatus;
  priority: TaskPriority;
  requiresHuman: boolean;
  deadlineAt?: string;
  traceId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// Intervention Types
export type InterventionType = 'comment' | 'nudge' | 'approve' | 'reject' | 'takeover' | 'resume' | 'pause_room' | 'kill_task';
export type InterventionStatus = 'open' | 'accepted' | 'resolved' | 'rejected' | 'timeout' | 'escalated';
export type ResumePolicy = 'resume_from_last_step' | 'rerun_current_step' | 'create_followup_task' | 'close_task';

export interface Intervention {
  id: string;
  roomId: string;
  taskId?: string;
  interventionType: InterventionType;
  requestedBy: string;
  resolvedBy?: string;
  status: InterventionStatus;
  reason?: string;
  payload?: Record<string, unknown>;
  resumePolicy?: ResumePolicy;
  createdAt: string;
  resolvedAt?: string;
  timeoutAt?: string;
}

// Agent Types
export type AgentType = 'planner' | 'executor' | 'reviewer' | 'summarizer' | 'router' | 'guardrail';
export type AgentStatus = 'idle' | 'working' | 'waiting' | 'error' | 'offline';

export interface AgentInfo {
  id: string;
  type: AgentType;
  name: string;
  description: string;
  capabilities: string[];
  maxConcurrentTasks: number;
}
