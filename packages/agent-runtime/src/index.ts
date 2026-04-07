/**
 * Agent Runtime - Base class and example agent implementations
 * 
 * Responsibilities:
 * - Subscribe to tasks from orchestrator
 * - Execute tasks with tool calling
 * - Report progress and results
 * - Handle heartbeats and status updates
 */

import { 
  connect, 
  NatsConnection,
  Msg 
} from 'nats';
import { 
  AgentType,
  AgentStatus,
  AgentInfo,
  Task,
  TaskStatus,
  createEventEnvelope,
  AgentStatusChangedPayload,
  AgentHeartbeatPayload,
  TaskProgressedPayload,
  RoomSubjects,
  AgentSubjects,
  OrchestratorSubjects,
  QueueGroups,
  EventEnvelope
} from '@fluxroom/shared';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// Base Agent Class
// ============================================================

export abstract class BaseAgent {
  protected nc: NatsConnection;
  protected agentId: string;
  protected agentType: AgentType;
  protected status: AgentStatus = 'idle';
  protected currentTaskId?: string;
  protected currentRoomId?: string;
  protected heartbeatInterval?: NodeJS.Timeout;

  constructor(nc: NatsConnection, agentId: string, agentType: AgentType) {
    this.nc = nc;
    this.agentId = agentId;
    this.agentType = agentType;
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  async start(): Promise<void> {
    console.log(`[${this.agentType}] Agent ${this.agentId} starting...`);
    
    // Subscribe to commands
    await this.subscribeToCommands();
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Register status
    await this.updateStatus('idle');
    
    console.log(`[${this.agentType}] Agent ${this.agentId} ready`);
  }

  async stop(): Promise<void> {
    console.log(`[${this.agentType}] Agent ${this.agentId} stopping...`);
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    await this.updateStatus('offline');
  }

  // ============================================================
  // Command Handling
  // ============================================================

  private async subscribeToCommands(): Promise<void> {
    // Subscribe to commands for this agent type (broadcast)
    await this.nc.subscribe(
      AgentSubjects.command(this.agentType),
      { queue: QueueGroups.agentRuntime(this.agentType) },
      (msg: Msg) => this.handleCommand(msg)
    );
    
    // Subscribe to direct commands for this agent instance
    await this.nc.subscribe(
      AgentSubjects.agentCommand(this.agentId),
      {},
      (msg: Msg) => this.handleCommand(msg)
    );

    console.log(`[${this.agentType}] Subscribed to commands`);
  }

  private async handleCommand(msg: Msg): Promise<void> {
    try {
      const command = JSON.parse(msg.data.toString());
      console.log(`[${this.agentType}] Received command:`, command);
      
      switch (command.command) {
        case 'execute_task':
          await this.executeTask(command.taskId, command.goal, command.priority);
          break;
        case 'cancel_task':
          await this.cancelTask(command.taskId);
          break;
        case 'status':
          await this.reportStatus();
          break;
        default:
          console.log(`[${this.agentType}] Unknown command: ${command.command}`);
      }
    } catch (e) {
      console.error(`[${this.agentType}] Failed to handle command:`, e);
    }
  }

  // ============================================================
  // Task Execution
  // ============================================================

  protected async executeTask(taskId: string, goal: string, priority: string): Promise<void> {
    this.currentTaskId = taskId;
    this.status = 'working';
    
    try {
      // Update status
      await this.updateStatus('working');
      
      // Simulate work with progress updates
      const steps = this.getExecutionSteps(goal);
      
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        console.log(`[${this.agentType}] Task ${taskId}: ${step}`);
        
        // Report progress
        await this.reportProgress(taskId, ((i + 1) / steps.length) * 100, step);
        
        // Simulate work time
        await this.sleep(1000 + Math.random() * 2000);
        
        // Check if cancelled
        if (this.status === 'idle') {
          console.log(`[${this.agentType}] Task ${taskId} was cancelled`);
          return;
        }
      }
      
      // Complete task
      await this.completeTask(taskId, {
        success: true,
        result: `Task completed successfully`,
        stepsExecuted: steps.length,
      });
      
    } catch (error) {
      await this.failTask(taskId, String(error));
    } finally {
      this.currentTaskId = undefined;
      this.status = 'idle';
      await this.updateStatus('idle');
    }
  }

  protected cancelTask(taskId: string): void {
    if (this.currentTaskId === taskId) {
      console.log(`[${this.agentType}] Cancelling task ${taskId}`);
      this.status = 'idle';
      this.currentTaskId = undefined;
    }
  }

  protected async completeTask(
    taskId: string, 
    result: { success: boolean; result?: string; stepsExecuted?: number }
  ): Promise<void> {
    // Publish result
    await this.nc.publish(OrchestratorSubjects.taskResult, JSON.stringify({
      taskId,
      result,
      status: 'completed',
      completedBy: this.agentId,
      completedAt: new Date().toISOString(),
    }));
    
    console.log(`[${this.agentType}] Task ${taskId} completed`);
  }

  protected async failTask(taskId: string, error: string): Promise<void> {
    await this.nc.publish(OrchestratorSubjects.taskResult, JSON.stringify({
      taskId,
      result: { success: false, error },
      status: 'failed',
      failedBy: this.agentId,
      failedAt: new Date().toISOString(),
    }));
    
    this.status = 'error';
    await this.updateStatus('error');
  }

  protected async reportProgress(
    taskId: string, 
    progress: number, 
    message?: string
  ): Promise<void> {
    const event = createEventEnvelope<TaskProgressedPayload>(
      'task.progressed',
      { taskId, progress, message },
      { id: this.agentId, type: 'agent', name: `${this.agentType} Agent` },
      { taskId }
    );
    
    await this.nc.publish(RoomSubjects.event(this.currentRoomId || 'unknown'), JSON.stringify(event));
  }

  // ============================================================
  // Status & Heartbeat
  // ============================================================

  protected async updateStatus(status: AgentStatus): Promise<void> {
    this.status = status;
    
    const event = createEventEnvelope<AgentStatusChangedPayload>(
      'agent.status_changed',
      { 
        agentId: this.agentId, 
        agentType: this.agentType, 
        status,
        roomId: this.currentRoomId,
        taskId: this.currentTaskId,
      },
      { id: this.agentId, type: 'agent', name: `${this.agentType} Agent` },
    );
    
    await this.nc.publish(AgentSubjects.agentStatus(this.agentId), JSON.stringify(event));
  }

  protected async reportStatus(): Promise<void> {
    console.log(`[${this.agentType}] Status report:`, {
      agentId: this.agentId,
      type: this.agentType,
      status: this.status,
      currentTask: this.currentTaskId,
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      const payload: AgentHeartbeatPayload = {
        agentId: this.agentId,
        roomId: this.currentRoomId,
        taskId: this.currentTaskId,
        load: this.status === 'working' ? 0.8 : 0.1,
        lastError: undefined,
      };
      
      await this.nc.publish(
        AgentSubjects.agentHeartbeat(this.agentId), 
        JSON.stringify(payload)
      );
    }, 10000); // Every 10 seconds
  }

  // ============================================================
  // Abstract Methods
  // ============================================================

  protected abstract getExecutionSteps(goal: string): string[];
  
  protected abstract sleep(ms: number): Promise<void>;
}

// ============================================================
// Planner Agent
// ============================================================

class PlannerAgent extends BaseAgent {
  constructor(nc: NatsConnection) {
    super(nc, `planner-${uuidv4().slice(0, 6)}`, 'planner');
  }

  protected getExecutionSteps(goal: string): string[] {
    return [
      `Analyzing goal: ${goal}`,
      'Researching requirements',
      'Breaking down into sub-tasks',
      'Creating execution plan',
      'Validating plan completeness',
      'Finalizing task hierarchy',
    ];
  }

  protected async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================
// Executor Agent
// ============================================================

class ExecutorAgent extends BaseAgent {
  constructor(nc: NatsConnection) {
    super(nc, `executor-${uuidv4().slice(0, 6)}`, 'executor');
  }

  protected getExecutionSteps(goal: string): string[] {
    return [
      `Understanding task: ${goal}`,
      'Setting up environment',
      'Implementing core functionality',
      'Writing tests',
      'Running validation',
      'Code review',
    ];
  }

  protected async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================
// Reviewer Agent
// ============================================================

class ReviewerAgent extends BaseAgent {
  constructor(nc: NatsConnection) {
    super(nc, `reviewer-${uuidv4().slice(0, 6)}`, 'reviewer');
  }

  protected getExecutionSteps(goal: string): string[] {
    return [
      `Reviewing: ${goal}`,
      'Checking code quality',
      'Validating security',
      'Testing edge cases',
      'Checking performance',
      'Final approval',
    ];
  }

  protected async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================
// Bootstrap
// ============================================================

async function bootstrap() {
  console.log('[AgentRuntime] Starting...');
  
  const nc = await connect({ servers: process.env.NATS_URL || 'nats://localhost:4222' });
  console.log('[AgentRuntime] Connected to NATS');
  
  // Create agents
  const agents: BaseAgent[] = [
    new PlannerAgent(nc),
    new ExecutorAgent(nc),
    new ExecutorAgent(nc), // Multiple executors for scaling
    new ReviewerAgent(nc),
  ];
  
  // Start all agents
  await Promise.all(agents.map(a => a.start()));
  
  console.log('[AgentRuntime] All agents started');
  console.log(`[AgentRuntime] Agents: ${agents.map(a => a['agentId']).join(', ')}`);
  console.log('[AgentRuntime] Waiting for tasks...');

  // Keep running
  process.on('SIGINT', async () => {
    console.log('[AgentRuntime] Shutting down...');
    await Promise.all(agents.map(a => a.stop()));
    await nc.close();
    process.exit(0);
  });
}

bootstrap().catch(console.error);
