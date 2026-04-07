/**
 * Orchestrator Service - Task orchestration and policy management
 * 
 * Responsibilities:
 * - Create and manage tasks
 * - Split tasks into subtasks
 * - Route tasks to appropriate agents
 * - Maintain task state machine
 * - Handle timeout, retry, escalation, and human approval policies
 */

import { 
  connect, 
  NatsConnection,
  Msg 
} from 'nats';
import { 
  Task, 
  TaskStatus,
  TaskPriority,
  Intervention,
  InterventionType,
  InterventionStatus,
  createEventEnvelope,
  TaskCreatedPayload,
  TaskAssignedPayload,
  TaskProgressedPayload,
  InterventionRequestedPayload,
  InterventionResolvedPayload,
  RoomSubjects,
  AgentSubjects,
  OrchestratorSubjects,
  QueueGroups
} from '@fluxroom/shared';
import { v4 as uuidv4 } from 'uuid';

interface OrchestratorConfig {
  maxRetries: number;
  defaultTimeout: number; // ms
  humanApprovalThreshold: TaskPriority;
}

export class OrchestratorService {
  private nc: NatsConnection;
  private tasks: Map<string, Task> = new Map();
  private interventions: Map<string, Intervention> = new Map();
  private config: OrchestratorConfig;

  constructor(nc: NatsConnection, config?: Partial<OrchestratorConfig>) {
    this.nc = nc;
    this.config = {
      maxRetries: 3,
      defaultTimeout: 5 * 60 * 1000, // 5 minutes
      humanApprovalThreshold: 'critical',
      ...config,
    };
  }

  // ============================================================
  // Task Management
  // ============================================================

  async createTask(
    roomId: string,
    title: string,
    goal: string,
    options?: {
      parentTaskId?: string;
      assignedTo?: string;
      assignedAgentType?: string;
      priority?: TaskPriority;
      requiresHuman?: boolean;
      deadlineAt?: string;
    }
  ): Promise<Task> {
    const task: Task = {
      id: `task_${uuidv4().slice(0, 8)}`,
      roomId,
      parentTaskId: options?.parentTaskId,
      title,
      goal,
      assignedTo: options?.assignedTo,
      assignedAgentType: options?.assignedAgentType,
      status: options?.assignedTo || options?.assignedAgentType ? 'assigned' : 'pending',
      priority: options?.priority || 'medium',
      requiresHuman: options?.requiresHuman || this.needsHumanApproval(options?.priority),
      deadlineAt: options?.deadlineAt,
      traceId: `trace_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.tasks.set(task.id, task);

    // Publish task.created event
    const event = createEventEnvelope<TaskCreatedPayload>(
      'task.created',
      { title, goal, parentTaskId: task.parentTaskId, assignedTo: task.assignedTo, assignedAgentType: task.assignedAgentType, priority: task.priority, requiresHuman: task.requiresHuman },
      { id: 'orchestrator', type: 'system', name: 'Orchestrator' },
      { roomId, taskId: task.id, traceId: task.traceId }
    );

    await this.nc.publish(RoomSubjects.taskCreated(roomId), JSON.stringify(event));
    await this.nc.publish(OrchestratorSubjects.taskDispatch, JSON.stringify(event));

    console.log(`[Orchestrator] Task created: ${task.id} (${title}) in room ${roomId}`);

    // Auto-assign if no agent specified
    if (!task.assignedTo && !task.assignedAgentType && task.assignedTo !== 'human') {
      await this.routeTask(task.id);
    }

    return task;
  }

  async getTask(taskId: string): Promise<Task | undefined> {
    return this.tasks.get(taskId);
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task | undefined> {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    task.status = status;
    task.updatedAt = new Date().toISOString();

    if (status === 'completed') {
      task.completedAt = new Date().toISOString();
    }

    this.tasks.set(taskId, task);
    return task;
  }

  async assignTask(taskId: string, agentId: string, agentType?: string): Promise<Task | undefined> {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    task.assignedTo = agentId;
    task.assignedAgentType = agentType || task.assignedAgentType;
    task.status = 'assigned';
    task.updatedAt = new Date().toISOString();

    this.tasks.set(taskId, task);

    // Publish task.assigned event
    const event = createEventEnvelope<TaskAssignedPayload>(
      'task.assigned',
      { taskId, assignedTo: agentId, assignedAgentType: agentType },
      { id: 'orchestrator', type: 'system', name: 'Orchestrator' },
      { roomId: task.roomId, taskId }
    );

    await this.nc.publish(RoomSubjects.taskUpdated(task.roomId), JSON.stringify(event));

    // Send command to agent
    const command = {
      command: 'execute_task',
      taskId,
      goal: task.goal,
      priority: task.priority,
    };

    if (agentType) {
      await this.nc.publish(AgentSubjects.command(agentType), JSON.stringify(command));
    } else {
      await this.nc.publish(AgentSubjects.agentCommand(agentId), JSON.stringify(command));
    }

    console.log(`[Orchestrator] Task ${taskId} assigned to ${agentId} (${agentType || 'direct'})`);
    return task;
  }

  async getTasksByRoom(roomId: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(t => t.roomId === roomId);
  }

  // ============================================================
  // Task Routing
  // ============================================================

  async routeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Simple routing logic based on task characteristics
    let targetAgentType: string;

    if (task.title.toLowerCase().includes('plan') || task.title.toLowerCase().includes('analyze')) {
      targetAgentType = 'planner';
    } else if (task.title.toLowerCase().includes('review') || task.title.toLowerCase().includes('check')) {
      targetAgentType = 'reviewer';
    } else if (task.requiresHuman) {
      targetAgentType = 'human';
    } else {
      targetAgentType = 'executor';
    }

    if (targetAgentType === 'human') {
      // Request human intervention
      await this.requestIntervention(task.roomId, 'approve', task.id, 'Task requires human approval');
    } else {
      await this.assignTask(taskId, `${targetAgentType}-01`, targetAgentType);
    }
  }

  // ============================================================
  // Human Intervention
  // ============================================================

  async requestIntervention(
    roomId: string,
    interventionType: InterventionType,
    taskId?: string,
    reason?: string
  ): Promise<Intervention> {
    const intervention: Intervention = {
      id: `intv_${uuidv4().slice(0, 8)}`,
      roomId,
      taskId,
      interventionType,
      requestedBy: 'orchestrator',
      status: 'open',
      reason,
      timeoutAt: new Date(Date.now() + this.config.defaultTimeout).toISOString(),
      createdAt: new Date().toISOString(),
    };

    this.interventions.set(intervention.id, intervention);

    // Update task status if linked
    if (taskId) {
      await this.updateTaskStatus(taskId, 'waiting_human');
    }

    // Publish intervention.requested event
    const event = createEventEnvelope<InterventionRequestedPayload>(
      'intervention.requested',
      { interventionType, taskId, reason: reason || '', timeoutAt: intervention.timeoutAt },
      { id: 'orchestrator', type: 'system', name: 'Orchestrator' },
      { roomId, taskId, interventionId: intervention.id }
    );

    await this.nc.publish(RoomSubjects.interventionRequested(roomId), JSON.stringify(event));
    await this.nc.publish(OrchestratorSubjects.humanIntervention, JSON.stringify(event));

    console.log(`[Orchestrator] Intervention requested: ${intervention.id} (${interventionType}) for task ${taskId}`);
    return intervention;
  }

  async resolveIntervention(
    interventionId: string,
    resolvedBy: string,
    action: 'approve' | 'reject' | 'takeover',
    resumePolicy?: Intervention['resumePolicy'],
    message?: string
  ): Promise<Intervention | undefined> {
    const intervention = this.interventions.get(interventionId);
    if (!intervention) return undefined;

    intervention.resolvedBy = resolvedBy;
    intervention.status = action === 'reject' ? 'rejected' : 'resolved';
    intervention.resolvedAt = new Date().toISOString();

    if (resumePolicy) {
      intervention.resumePolicy = resumePolicy;
    }

    this.interventions.set(interventionId, intervention);

    // Update task if linked
    if (intervention.taskId) {
      const task = this.tasks.get(intervention.taskId);
      if (task) {
        if (action === 'approve') {
          task.status = 'pending';
          await this.routeTask(task.id);
        } else if (action === 'reject') {
          task.status = 'blocked';
        }
        this.tasks.set(task.id, task);
      }
    }

    // Publish intervention.resolved event
    const event = createEventEnvelope<InterventionResolvedPayload>(
      'intervention.resolved',
      { interventionType: intervention.interventionType, resolvedBy, resumePolicy, message },
      { id: resolvedBy, type: 'human', name: resolvedBy },
      { roomId: intervention.roomId, taskId: intervention.taskId, interventionId: intervention.id }
    );

    await this.nc.publish(RoomSubjects.interventionResolved(intervention.roomId), JSON.stringify(event));

    console.log(`[Orchestrator] Intervention resolved: ${intervention.id} by ${resolvedBy} (${action})`);
    return intervention;
  }

  async getIntervention(interventionId: string): Promise<Intervention | undefined> {
    return this.interventions.get(interventionId);
  }

  async getOpenInterventions(roomId?: string): Promise<Intervention[]> {
    const all = Array.from(this.interventions.values());
    return all.filter(i => 
      i.status === 'open' && 
      (!roomId || i.roomId === roomId)
    );
  }

  // ============================================================
  // Policy Helpers
  // ============================================================

  private needsHumanApproval(priority?: TaskPriority): boolean {
    const threshold = this.config.humanApprovalThreshold;
    const priorityOrder: TaskPriority[] = ['low', 'medium', 'high', 'critical'];
    const priorityIndex = priority ? priorityOrder.indexOf(priority) : 1;
    const thresholdIndex = priorityOrder.indexOf(threshold);
    return priorityIndex >= thresholdIndex;
  }

  // ============================================================
  // Event Handlers
  // ============================================================

  setupEventHandlers(): void {
    // Handle task completion from agents
    this.nc.subscribe(OrchestratorSubjects.taskResult, { queue: QueueGroups.orchestrator }, async (msg: Msg) => {
      try {
        const data = JSON.parse(msg.data.toString());
        const { taskId, result, status } = data;

        const task = this.tasks.get(taskId);
        if (task) {
          await this.updateTaskStatus(taskId, status || 'completed');
          console.log(`[Orchestrator] Task ${taskId} completed with result:`, result);
        }
      } catch (e) {
        console.error('[Orchestrator] Failed to handle task result:', e);
      }
    });
  }
}

// ============================================================
// Bootstrap
// ============================================================

async function bootstrap() {
  console.log('[Orchestrator] Starting...');

  const nc = await connect({ servers: process.env.NATS_URL || 'nats://localhost:4222' });
  console.log('[Orchestrator] Connected to NATS');

  const orchestrator = new OrchestratorService(nc, {
    maxRetries: 3,
    defaultTimeout: 5 * 60 * 1000,
    humanApprovalThreshold: 'high',
  });

  orchestrator.setupEventHandlers();

  // Create demo tasks
  const demoRoomId = process.env.DEMO_ROOM_ID || 'demo-room';
  
  const task1 = await orchestrator.createTask(
    demoRoomId,
    'Analyze requirements',
    'Analyze the user requirements and create a detailed plan',
    { assignedAgentType: 'planner', priority: 'high' }
  );

  const task2 = await orchestrator.createTask(
    demoRoomId,
    'Critical decision required',
    'This task requires human approval due to high priority',
    { priority: 'critical' }
  );

  console.log('[Orchestrator] Demo tasks created');
  console.log('[Orchestrator] Waiting for events...');

  process.on('SIGINT', async () => {
    console.log('[Orchestrator] Shutting down...');
    await nc.close();
    process.exit(0);
  });
}

bootstrap().catch(console.error);
