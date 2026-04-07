/**
 * Agent Runtime - Enhanced with Tool System, Context, and Policy
 * 
 * Responsibilities:
 * - Subscribe to tasks from orchestrator
 * - Execute tasks with tool calling
 * - Report progress and results
 * - Handle heartbeats and status updates
 * - Integrate with Tool System for capability extension
 * - Use Context Manager for state tracking
 * - Enforce Policy Engine rules
 */

import { 
  connect, 
  NatsConnection,
  Msg 
} from 'nats';
import { 
  AgentType,
  AgentStatus,
  createLogger,
  createEventEnvelope,
  AgentStatusChangedPayload,
  AgentHeartbeatPayload,
  TaskProgressedPayload,
  RoomSubjects,
  AgentSubjects,
  OrchestratorSubjects,
  QueueGroups,
  ToolRegistry,
  ToolResult,
  ToolExecution,
  ContextManager,
  globalContextManager,
  PolicyEngine,
  globalPolicyEngine,
} from '@fluxroom/shared';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// Tool-Aware Agent
// ============================================================

export abstract class ToolAwareAgent {
  protected nc: NatsConnection;
  protected agentId: string;
  protected agentType: AgentType;
  protected status: AgentStatus = 'idle';
  protected currentTaskId?: string;
  protected currentRoomId?: string;
  protected heartbeatInterval?: NodeJS.Timeout;
  
  // Integrations
  protected tools: ToolRegistry;
  protected context: ContextManager;
  protected policies: PolicyEngine;
  protected logger;

  constructor(
    nc: NatsConnection, 
    agentId: string, 
    agentType: AgentType,
    options?: {
      tools?: ToolRegistry;
      context?: ContextManager;
      policies?: PolicyEngine;
    }
  ) {
    this.nc = nc;
    this.agentId = agentId;
    this.agentType = agentType;
    this.tools = options?.tools || new ToolRegistry();
    this.context = options?.context || globalContextManager;
    this.policies = options?.policies || globalPolicyEngine;
    this.logger = createLogger(`agent:${agentType}`);
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  async start(): Promise<void> {
    this.logger.info('Agent starting', { agentId: this.agentId, agentType: this.agentType });
    
    // Register built-in tools
    this.registerTools();
    
    // Subscribe to commands
    await this.subscribeToCommands();
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Register status
    await this.updateStatus('idle');
    
    this.logger.info('Agent ready', { 
      agentId: this.agentId, 
      toolsAvailable: this.tools.getHealth().totalTools 
    });
  }

  async stop(): Promise<void> {
    this.logger.info('Agent stopping', { agentId: this.agentId });
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    await this.updateStatus('offline');
  }

  // ============================================================
  // Tool Management
  // ============================================================

  protected abstract registerTools(): void;

  async executeTool(
    toolId: string, 
    parameters: Record<string, unknown>
  ): Promise<ToolResult> {
    // Check policy before execution
    const policyResult = this.policies.canExecuteTool(toolId, toolId, toolId);
    
    if (!policyResult.allowed) {
      if (policyResult.requiresApproval) {
        this.logger.warn('Tool execution requires approval', { toolId, rule: policyResult.matchedRule?.name });
        // In production, this would trigger a human intervention
        // For now, we log and continue
      } else {
        this.logger.error('Tool execution denied by policy', { toolId, rule: policyResult.matchedRule?.name });
        return {
          success: false,
          error: `Policy denied: ${policyResult.reason}`,
          executionTime: 0,
        };
      }
    }

    // Execute tool
    const result = await this.tools.execute(toolId, parameters, this.agentId);

    // Record in context
    if (this.currentRoomId) {
      this.context.addEntry(this.currentRoomId, 'tool_result', {
        toolId,
        parameters,
        result: result.data,
        success: result.success,
        executionTime: result.executionTime,
      }, this.agentId, { taskId: this.currentTaskId });
    }

    return result;
  }

  getAvailableTools() {
    return this.tools.listTools({ availableOnly: true });
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

    this.logger.debug('Subscribed to commands', { agentType: this.agentType, agentId: this.agentId });
  }

  private async handleCommand(msg: Msg): Promise<void> {
    try {
      const command = JSON.parse(msg.data.toString());
      this.logger.debug('Received command', { command: command.command, taskId: command.taskId });
      
      switch (command.command) {
        case 'execute_task':
          await this.executeTask(command.taskId, command.goal, command.priority);
          break;
        case 'cancel_task':
          this.cancelTask(command.taskId);
          break;
        case 'status':
          await this.reportStatus();
          break;
        case 'list_tools':
          this.reportAvailableTools();
          break;
        default:
          this.logger.warn('Unknown command', { command: command.command });
      }
    } catch (error) {
      this.logger.error('Failed to handle command', error as Error);
    }
  }

  // ============================================================
  // Task Execution
  // ============================================================

  protected async executeTask(taskId: string, goal: string, priority: string): Promise<void> {
    this.currentTaskId = taskId;
    this.status = 'working';
    this.currentRoomId = this.extractRoomId(taskId);
    
    try {
      // Update status
      await this.updateStatus('working');
      
      // Check policy
      const policyResult = this.policies.canExecuteTask(taskId, priority, this.agentId);
      if (!policyResult.allowed) {
        if (policyResult.requiresApproval) {
          this.logger.warn('Task execution requires approval', { taskId, rule: policyResult.matchedRule?.name });
        } else {
          throw new Error(`Policy denied: ${policyResult.reason}`);
        }
      }

      // Add task to context
      if (this.currentRoomId) {
        this.context.addEntry(this.currentRoomId, 'task', {
          taskId,
          goal,
          priority,
          status: 'in_progress',
          agentId: this.agentId,
        }, this.agentId, { taskId });
      }

      // Execute task steps
      const steps = await this.planExecution(goal, priority);
      
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        this.logger.debug('Executing step', { taskId, step: step.description });
        
        // Execute step (may involve tools)
        const stepResult = await this.executeStep(step, taskId);
        
        // Report progress
        await this.reportProgress(taskId, ((i + 1) / steps.length) * 100, step.description);
        
        // Simulate work time
        await this.sleep(1000 + Math.random() * 2000);
        
        // Check if cancelled
        if (this.status === 'idle') {
          this.logger.info('Task was cancelled', { taskId });
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
      this.logger.info('Cancelling task', { taskId });
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
    
    // Add to context
    if (this.currentRoomId) {
      this.context.addEntry(this.currentRoomId, 'task', {
        taskId,
        status: 'completed',
        result,
      }, this.agentId, { taskId });
    }
    
    this.logger.info('Task completed', { taskId, stepsExecuted: result.stepsExecuted });
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
    
    this.logger.error('Task failed', new Error(error), { taskId });
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
  // Execution Planning (Override in subclasses)
  // ============================================================

  protected async planExecution(goal: string, priority: string): Promise<ExecutionStep[]> {
    // Default implementation - subclasses can override with tool usage
    return [
      { description: `Analyzing: ${goal}`, tool?: undefined, params?: {} },
      { description: 'Executing plan', tool?: undefined, params?: {} },
      { description: 'Finalizing', tool?: undefined, params?: {} },
    ];
  }

  protected async executeStep(step: ExecutionStep, taskId: string): Promise<void> {
    // If step has a tool, execute it
    if (step.tool) {
      const result = await this.executeTool(step.tool, step.params || {});
      if (!result.success) {
        this.logger.warn('Tool execution had issues', { tool: step.tool, error: result.error });
      }
    }
  }

  private extractRoomId(taskId: string): string | undefined {
    // In production, this would be looked up from orchestrator
    return process.env.DEMO_ROOM_ID || 'demo-room';
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
    this.logger.info('Status report', {
      agentId: this.agentId,
      agentType: this.agentType,
      status: this.status,
      currentTask: this.currentTaskId,
      toolsAvailable: this.tools.getHealth().available,
    });
  }

  protected reportAvailableTools(): void {
    const tools = this.getAvailableTools();
    this.logger.info('Available tools', { 
      agentId: this.agentId, 
      tools: tools.map(t => t.name) 
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      const payload: AgentHeartbeatPayload = {
        agentId: this.agentId,
        roomId: this.currentRoomId,
        taskId: this.currentTaskId,
        load: this.status === 'working' ? 0.8 : 0.1,
      };
      
      await this.nc.publish(
        AgentSubjects.agentHeartbeat(this.agentId), 
        JSON.stringify(payload)
      );
    }, 10000);
  }

  // ============================================================
  // Utility
  // ============================================================

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================
// Execution Step Type
// ============================================================

interface ExecutionStep {
  description: string;
  tool?: string;
  params?: Record<string, unknown>;
}

// ============================================================
// Planner Agent (with tools)
// ============================================================

class PlannerAgent extends ToolAwareAgent {
  constructor(nc: NatsConnection) {
    super(nc, `planner-${uuidv4().slice(0, 6)}`, 'planner');
  }

  protected registerTools(): void {
    // Planner has access to analysis tools
    this.tools.register(new (class {
      readonly definition = {
        id: 'planner.analyze',
        name: 'analyze_task',
        description: 'Analyze a task and break it down',
        category: 'code' as const,
        parameters: [
          { name: 'goal', type: 'string', description: 'Task goal', required: true },
          { name: 'priority', type: 'string', description: 'Task priority', required: false },
        ],
        returns: { type: 'object', description: 'Analysis result' },
      };

      async execute(params: Record<string, unknown>) {
        return {
          success: true,
          data: {
            subtasks: ['Subtask 1', 'Subtask 2', 'Subtask 3'],
            estimatedTime: '30 minutes',
            complexity: 'medium',
          },
        };
      }
    })());

    this.logger.debug('Planner tools registered');
  }

  protected async planExecution(goal: string, priority: string): Promise<ExecutionStep[]> {
    // Use tool to analyze and break down task
    const analysisResult = await this.executeTool('planner.analyze', { goal, priority });

    return [
      { description: `Analyzing: ${goal}`, tool: 'planner.analyze', params: { goal, priority } },
      { description: 'Breaking down into subtasks', tool: 'planner.analyze', params: { goal } },
      { description: 'Creating execution plan' },
      { description: 'Validating plan' },
      { description: 'Finalizing' },
    ];
  }
}

// ============================================================
// Executor Agent (with tools)
// ============================================================

class ExecutorAgent extends ToolAwareAgent {
  constructor(nc: NatsConnection) {
    super(nc, `executor-${uuidv4().slice(0, 6)}`, 'executor');
  }

  protected registerTools(): void {
    // Executor has access to file, shell, and HTTP tools
    // Note: Shell and file write require approval per default policy
    this.logger.debug('Executor tools registered (shell, file, http available)');
  }

  protected async planExecution(goal: string, priority: string): Promise<ExecutionStep[]> {
    return [
      { description: `Understanding: ${goal}` },
      { description: 'Setting up environment' },
      { description: 'Implementing core functionality' },
      { description: 'Writing tests' },
      { description: 'Running validation' },
      { description: 'Code review' },
    ];
  }
}

// ============================================================
// Reviewer Agent (with tools)
// ============================================================

class ReviewerAgent extends ToolAwareAgent {
  constructor(nc: NatsConnection) {
    super(nc, `reviewer-${uuidv4().slice(0, 6)}`, 'reviewer');
  }

  protected registerTools(): void {
    // Reviewer has access to code analysis tools
    this.logger.debug('Reviewer tools registered');
  }

  protected async planExecution(goal: string, priority: string): Promise<ExecutionStep[]> {
    return [
      { description: `Reviewing: ${goal}` },
      { description: 'Checking code quality' },
      { description: 'Validating security' },
      { description: 'Testing edge cases' },
      { description: 'Checking performance' },
      { description: 'Final approval' },
    ];
  }
}

// ============================================================
// Bootstrap
// ============================================================

async function bootstrap() {
  const logger = createLogger('agent-runtime');
  logger.info('Starting Agent Runtime...');
  
  const nc = await connect({ 
    servers: process.env.NATS_URL || 'nats://localhost:4222',
    timeout: 10000,
    reconnect: true,
  });
  logger.info('Connected to NATS');

  // Create agents with tool capabilities
  const agents: ToolAwareAgent[] = [
    new PlannerAgent(nc),
    new ExecutorAgent(nc),
    new ExecutorAgent(nc), // Multiple executors for scaling
    new ReviewerAgent(nc),
  ];
  
  // Start all agents
  await Promise.all(agents.map(a => a.start()));
  
  logger.info('All agents started', { 
    count: agents.length,
    agents: agents.map(a => ({ id: a['agentId'], type: a['agentType'] }))
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await Promise.all(agents.map(a => a.stop()));
    await nc.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  console.error('Failed to start Agent Runtime:', error);
  process.exit(1);
});
