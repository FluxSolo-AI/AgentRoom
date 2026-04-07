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
  QueueGroups,
  createLogger,
  validateTaskInput,
  validateRoomId,
  validateTaskId,
  PersistenceService,
} from '@fluxroom/shared';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// Types
// ============================================================

interface OrchestratorConfig {
  maxRetries: number;
  defaultTimeout: number; // ms
  humanApprovalThreshold: TaskPriority;
}

interface TaskCommand {
  command: string;
  taskId?: string;
  goal?: string;
  priority?: string;
}

// ============================================================
// Orchestrator Service
// ============================================================

export class OrchestratorService {
  private nc: NatsConnection;
  private tasks: Map<string, Task> = new Map();
  private interventions: Map<string, Intervention> = new Map();
  private config: OrchestratorConfig;
  private logger;
  private persistence?: PersistenceService;
  private subscriptions: Msg[] = [];

  constructor(
    nc: NatsConnection, 
    config?: Partial<OrchestratorConfig>,
    options?: { persistence?: PersistenceService }
  ) {
    this.nc = nc;
    this.config = {
      maxRetries: 3,
      defaultTimeout: 5 * 60 * 1000, // 5 minutes
      humanApprovalThreshold: 'critical',
      ...config,
    };
    this.persistence = options?.persistence;
    this.logger = createLogger('orchestrator');
  }

  // ============================================================
  // Health Check
  // ============================================================

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded';
    uptime: number;
    activeTasks: number;
    pendingInterventions: number;
    persistence: boolean;
  }> {
    const activeTasks = Array.from(this.tasks.values())
      .filter(t => t.status === 'in_progress' || t.status === 'assigned').length;
    const pendingInterventions = Array.from(this.interventions.values())
      .filter(i => i.status === 'open').length;

    return {
      status: 'healthy',
      uptime: process.uptime(),
      activeTasks,
      pendingInterventions,
      persistence: !!this.persistence,
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
  ): Promise<{ task?: Task; error?: string }> {
    // Validate input
    const validation = validateTaskInput({ title, goal, priority: options?.priority });
    if (!validation.valid) {
      this.logger.warn('Invalid task input', { errors: validation.errors });
      return { error: validation.errors.join(', ') };
    }

    // Validate room ID
    const roomValidation = validateRoomId(roomId);
    if (!roomValidation.valid) {
      return { error: roomValidation.errors.join(', ') };
    }

    // Validate parent task if provided
    if (options?.parentTaskId) {
      const parentValidation = validateTaskId(options.parentTaskId);
      if (!parentValidation.valid) {
        return { error: parentValidation.errors.join(', ') };
      }
    }

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

    // Create and publish event
    const event = createEventEnvelope<TaskCreatedPayload>(
      'task.created',
      { 
        title, 
        goal, 
        parentTaskId: task.parentTaskId, 
        assignedTo: task.assignedTo, 
        assignedAgentType: task.assignedAgentType, 
        priority: task.priority, 
        requiresHuman: task.requiresHuman 
      },
      { id: 'orchestrator', type: 'system', name: 'Orchestrator' },
      { roomId, taskId: task.id, traceId: task.traceId }
    );

    await this.nc.publish(RoomSubjects.taskCreated(roomId), JSON.stringify(event));
    await this.nc.publish(OrchestratorSubjects.taskDispatch, JSON.stringify(event));

    if (this.persistence) {
      await this.persistence.publishEvent(RoomSubjects.taskCreated(roomId), event);
    }

    this.logger.info('Task created', { 
      taskId: task.id, 
      roomId, 
      title, 
      priority: task.priority,
      requiresHuman: task.requiresHuman 
    });

    // Auto-assign if agent specified
    if (!task.assignedTo && !task.assignedAgentType && !task.requiresHuman) {
      await this.routeTask(task.id);
    }

    return { task };
  }

  async getTask(taskId: string): Promise<Task | undefined> {
    return this.tasks.get(taskId);
  }

  async updateTaskStatus(
    taskId: string, 
    status: TaskStatus
  ): Promise<{ task?: Task; error?: string }> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { error: 'Task not found' };
    }

    task.status = status;
    task.updatedAt = new Date().toISOString();

    if (status === 'completed') {
      task.completedAt = new Date().toISOString();
    }

    this.tasks.set(taskId, task);
    
    this.logger.info('Task status updated', { taskId, status });
    return { task };
  }

  async assignTask(
    taskId: string, 
    agentId: string, 
    agentType?: string
  ): Promise<{ task?: Task; error?: string }> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { error: 'Task not found' };
    }

    task.assignedTo = agentId;
    task.assignedAgentType = agentType || task.assignedAgentType;
    task.status = 'assigned';
    task.updatedAt = new Date().toISOString();

    this.tasks.set(taskId, task);

    // Publish event
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

    const subject = agentType 
      ? AgentSubjects.command(agentType) 
      : AgentSubjects.agentCommand(agentId);
    
    await this.nc.publish(subject, JSON.stringify(command));

    this.logger.info('Task assigned', { taskId, agentId, agentType });
    return { task };
  }

  async getTasksByRoom(roomId: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(t => t.roomId === roomId);
  }

  async getActiveTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter(t => t.status === 'in_progress' || t.status === 'assigned');
  }

  async cancelTask(taskId: string): Promise<{ success: boolean; error?: string }> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    task.status = 'cancelled';
    task.updatedAt = new Date().toISOString();

    this.logger.info('Task cancelled', { taskId });
    return { success: true };
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
  ): Promise<{ intervention?: Intervention; error?: string }> {
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
      const task = this.tasks.get(taskId);
      if (task) {
        task.status = 'waiting_human';
        task.updatedAt = new Date().toISOString();
      }
    }

    // Create and publish event
    const event = createEventEnvelope<InterventionRequestedPayload>(
      'intervention.requested',
      { interventionType, taskId, reason: reason || '', timeoutAt: intervention.timeoutAt },
      { id: 'orchestrator', type: 'system', name: 'Orchestrator' },
      { roomId, taskId, interventionId: intervention.id }
    );

    await this.nc.publish(RoomSubjects.interventionRequested(roomId), JSON.stringify(event));
    await this.nc.publish(OrchestratorSubjects.humanIntervention, JSON.stringify(event));

    if (this.persistence) {
      await this.persistence.publishEvent(RoomSubjects.interventionRequested(roomId), event);
    }

    this.logger.warn('Intervention requested', { 
      interventionId: intervention.id, 
      interventionType, 
      taskId, 
      reason 
    });
    
    return { intervention };
  }

  async resolveIntervention(
    interventionId: string,
    resolvedBy: string,
    action: 'approve' | 'reject' | 'takeover',
    resumePolicy?: Intervention['resumePolicy'],
    message?: string
  ): Promise<{ intervention?: Intervention; error?: string }> {
    const intervention = this.interventions.get(interventionId);
    if (!intervention) {
      return { error: 'Intervention not found' };
    }

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
        task.updatedAt = new Date().toISOString();
      }
    }

    // Publish event
    const event = createEventEnvelope<InterventionResolvedPayload>(
      'intervention.resolved',
      { interventionType: intervention.interventionType, resolvedBy, resumePolicy, message },
      { id: resolvedBy, type: 'human', name: resolvedBy },
      { roomId: intervention.roomId, taskId: intervention.taskId, interventionId: intervention.id }
    );

    await this.nc.publish(RoomSubjects.interventionResolved(intervention.roomId), JSON.stringify(event));

    this.logger.info('Intervention resolved', { 
      interventionId, 
      resolvedBy, 
      action 
    });
    
    return { intervention };
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
  // Event Handlers
  // ============================================================

  setupEventHandlers(): void {
    // Handle task completion from agents
    const sub = this.nc.subscribe(OrchestratorSubjects.taskResult, { 
      queue: QueueGroups.orchestrator 
    });
    
    this.subscriptions.push(sub);

    (async () => {
      for await (const msg of sub) {
        try {
          const data = JSON.parse(msg.data.toString());
          const { taskId, result, status } = data;

          if (taskId) {
            await this.updateTaskStatus(taskId, status || 'completed');
            this.logger.info('Task completed', { taskId, result });
          }
        } catch (error) {
          this.logger.error('Failed to handle task result', error as Error);
        }
      }
    })();
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
  // Graceful Shutdown
  // ============================================================

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down...');
    
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    
    this.logger.info('Shutdown complete');
  }
}

// ============================================================
// Bootstrap
// ============================================================

async function bootstrap() {
  const logger = createLogger('orchestrator');
  logger.info('Starting Orchestrator Service...');

  const nc = await connect({ 
    servers: process.env.NATS_URL || 'nats://localhost:4222',
    timeout: 10000,
    reconnect: true,
    maxReconnectAttempts: 10,
  });
  logger.info('Connected to NATS');

  const orchestrator = new OrchestratorService(nc, {
    maxRetries: 3,
    defaultTimeout: 5 * 60 * 1000,
    humanApprovalThreshold: 'high',
  });

  orchestrator.setupEventHandlers();

  // Create demo tasks
  const demoRoomId = process.env.DEMO_ROOM_ID || 'demo-room';
  
  await orchestrator.createTask(
    demoRoomId,
    'Analyze requirements',
    'Analyze the user requirements and create a detailed plan',
    { assignedAgentType: 'planner', priority: 'high' }
  );

  await orchestrator.createTask(
    demoRoomId,
    'Critical decision required',
    'This task requires human approval due to high priority',
    { priority: 'critical' }
  );

  logger.info('Demo tasks created');

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Received shutdown signal...');
    await orchestrator.shutdown();
    await nc.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  console.error('Failed to start Orchestrator Service:', error);
  process.exit(1);
});
