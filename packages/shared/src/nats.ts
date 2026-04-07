// ============================================================
// NATS Subject Naming Convention
// 
// Principle: Domain-oriented naming, not implementation-oriented
// - Room dimension and Agent dimension are separated
// - Broadcast subjects and point-to-point command subjects are separated
// ============================================================

// Room-scoped subjects
export const RoomSubjects = {
  // Messages and events in a room
  message: (roomId: string) => `room.${roomId}.message`,
  event: (roomId: string) => `room.${roomId}.event`,
  
  // Task lifecycle
  taskCreated: (roomId: string) => `room.${roomId}.task.created`,
  taskUpdated: (roomId: string) => `room.${roomId}.task.updated`,
  taskCompleted: (roomId: string) => `room.${roomId}.task.completed`,
  
  // Intervention
  interventionRequested: (roomId: string) => `room.${roomId}.intervention.requested`,
  interventionResolved: (roomId: string) => `room.${roomId}.intervention.resolved`,
  
  // Participant
  participantJoined: (roomId: string) => `room.${roomId}.participant.joined`,
  participantLeft: (roomId: string) => `room.${roomId}.participant.left`,
} as const;

// Agent-scoped subjects
export const AgentSubjects = {
  // Command to agent type (broadcast to all agents of this type)
  command: (agentType: string) => `agent.${agentType}.command`,
  event: (agentType: string) => `agent.${agentType}.event`,
  
  // Command to specific agent instance
  agentCommand: (agentId: string) => `agent.${agentId}.command`,
  agentStatus: (agentId: string) => `agent.${agentId}.status`,
  agentHeartbeat: (agentId: string) => `agent.${agentId}.heartbeat`,
} as const;

// Orchestrator subjects
export const OrchestratorSubjects = {
  // Task management
  taskDispatch: 'orchestrator.task.dispatch',
  taskResult: 'orchestrator.task.result',
  
  // Policy
  policyAlert: 'orchestrator.policy.alert',
  
  // Human intervention routing
  humanIntervention: 'orchestrator.human.intervention',
} as const;

// System subjects
export const SystemSubjects = {
  // Room management
  roomCreated: 'system.room.created',
  roomClosed: 'system.room.closed',
  
  // Agent registration
  agentRegistered: 'system.agent.registered',
  agentUnregistered: 'system.agent.unregistered',
  
  // Heartbeat
  heartbeat: 'system.heartbeat',
} as const;

// ============================================================
// Queue Groups for Horizontal Scaling
// ============================================================

export const QueueGroups = {
  roomService: 'fluxroom.room-service',
  orchestrator: 'fluxroom.orchestrator',
  agentRuntime: (agentType: string) => `fluxroom.agent.${agentType}`,
  humanIntervention: 'fluxroom.human-intervention',
} as const;

// ============================================================
// Subject Pattern Helpers
// ============================================================

export function isRoomSubject(subject: string): boolean {
  return subject.startsWith('room.');
}

export function isAgentSubject(subject: string): boolean {
  return subject.startsWith('agent.');
}

export function isOrchestratorSubject(subject: string): boolean {
  return subject.startsWith('orchestrator.');
}

export function extractRoomId(subject: string): string | null {
  const match = subject.match(/^room\.([^.]+)/);
  return match ? match[1] : null;
}

export function extractAgentType(subject: string): string | null {
  const match = subject.match(/^agent\.([^.]+)/);
  return match ? match[1] : null;
}
