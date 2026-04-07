/**
 * Agent Tool System
 * 
 * Provides a framework for agents to discover and use tools.
 * Tools are registered capabilities that agents can invoke during task execution.
 */

import { createLogger, Logger } from './logger';

// ============================================================
// Tool Types
// ============================================================

export type ToolStatus = 'available' | 'busy' | 'disabled' | 'error';
export type ToolCategory = 
  | 'file' 
  | 'http' 
  | 'database' 
  | 'shell' 
  | 'search' 
  | 'code' 
  | 'communication'
  | 'storage'
  | 'custom';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  parameters: ToolParameter[];
  returns: {
    type: string;
    description: string;
  };
  timeout?: number; // ms
  retries?: number;
  requiresApproval?: boolean; // Human approval before execution
  rateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
}

export interface ToolExecution {
  id: string;
  toolId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: unknown;
  error?: string;
  executedBy: string; // agent ID
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  executionTime: number; // ms
  metadata?: Record<string, unknown>;
}

// ============================================================
// Base Tool Interface
// ============================================================

export abstract class BaseTool {
  abstract readonly definition: ToolDefinition;
  
  protected logger: Logger;
  protected status: ToolStatus = 'available';

  constructor(logger?: Logger) {
    this.logger = logger || createLogger(`tool:${this.definition.name}`);
  }

  abstract execute(params: Record<string, unknown>): Promise<ToolResult>;

  getStatus(): ToolStatus {
    return this.status;
  }

  setStatus(status: ToolStatus): void {
    this.status = status;
    this.logger.debug('Tool status changed', { toolId: this.definition.id, status });
  }
}

// ============================================================
// Tool Registry
// ============================================================

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();
  private definitions: Map<string, ToolDefinition> = new Map();
  private executions: Map<string, ToolExecution> = new Map();
  private logger: Logger;
  private rateLimitMap: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(logger?: Logger) {
    this.logger = logger || createLogger('tool-registry');
  }

  // ============================================================
  // Tool Registration
  // ============================================================

  register(tool: BaseTool): void {
    const { id, name } = tool.definition;
    
    if (this.tools.has(id)) {
      this.logger.warn('Tool already registered, overwriting', { toolId: id });
    }

    this.tools.set(id, tool);
    this.definitions.set(id, tool.definition);
    
    this.logger.info('Tool registered', { toolId: id, name, category: tool.definition.category });
  }

  unregister(toolId: string): boolean {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return false;
    }

    this.tools.delete(toolId);
    this.definitions.delete(toolId);
    
    this.logger.info('Tool unregistered', { toolId });
    return true;
  }

  get(toolId: string): BaseTool | undefined {
    return this.tools.get(toolId);
  }

  getDefinition(toolId: string): ToolDefinition | undefined {
    return this.definitions.get(toolId);
  }

  listTools(filters?: {
    category?: ToolCategory;
    availableOnly?: boolean;
  }): ToolDefinition[] {
    let tools = Array.from(this.definitions.values());

    if (filters?.category) {
      tools = tools.filter(t => t.category === filters.category);
    }

    if (filters?.availableOnly) {
      tools = tools.filter(t => {
        const tool = this.tools.get(t.id);
        return tool?.getStatus() === 'available';
      });
    }

    return tools;
  }

  // ============================================================
  // Tool Execution
  // ============================================================

  async execute(
    toolId: string,
    parameters: Record<string, unknown>,
    executedBy: string
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolId);
    const definition = this.definitions.get(toolId);

    if (!tool || !definition) {
      return {
        success: false,
        error: `Tool not found: ${toolId}`,
        executionTime: 0,
      };
    }

    // Check rate limits
    const rateLimitResult = this.checkRateLimit(definition);
    if (!rateLimitResult.allowed) {
      this.logger.warn('Tool rate limited', { toolId, ...rateLimitResult });
      return {
        success: false,
        error: `Rate limit exceeded. Try again in ${rateLimitResult.waitMs}ms`,
        executionTime: 0,
      };
    }

    // Check status
    if (tool.getStatus() !== 'available') {
      return {
        success: false,
        error: `Tool is not available: ${tool.getStatus()}`,
        executionTime: 0,
      };
    }

    // Check for approval requirement
    if (definition.requiresApproval) {
      this.logger.warn('Tool requires approval', { toolId, executedBy });
      // In production, this would trigger a human intervention
      // For now, we'll continue but log the warning
    }

    // Create execution record
    const execution: ToolExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      toolId,
      toolName: definition.name,
      parameters,
      startedAt: new Date().toISOString(),
      status: 'running',
      executedBy,
    };

    this.executions.set(execution.id, execution);
    tool.setStatus('busy');

    const startTime = Date.now();

    try {
      this.logger.info('Executing tool', { 
        executionId: execution.id, 
        toolId, 
        executedBy 
      });

      const result = await tool.execute(parameters);
      
      execution.completedAt = new Date().toISOString();
      execution.status = result.success ? 'completed' : 'failed';
      execution.result = result.data;
      execution.error = result.error;

      tool.setStatus('available');

      this.logger.info('Tool execution completed', {
        executionId: execution.id,
        toolId,
        success: result.success,
        duration: Date.now() - startTime,
      });

      return {
        ...result,
        executionTime: Date.now() - startTime,
      };

    } catch (error) {
      execution.completedAt = new Date().toISOString();
      execution.status = 'failed';
      execution.error = (error as Error).message;
      
      tool.setStatus('error');

      this.logger.error('Tool execution failed', error as Error, {
        executionId: execution.id,
        toolId,
      });

      return {
        success: false,
        error: (error as Error).message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  getExecution(executionId: string): ToolExecution | undefined {
    return this.executions.get(executionId);
  }

  getExecutionsByAgent(agentId: string): ToolExecution[] {
    return Array.from(this.executions.values())
      .filter(e => e.executedBy === agentId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  // ============================================================
  // Rate Limiting
  // ============================================================

  private checkRateLimit(definition: ToolDefinition): { 
    allowed: boolean; 
    remaining: number; 
    resetAt: number;
    waitMs?: number;
  } {
    if (!definition.rateLimit) {
      return { allowed: true, remaining: -1, resetAt: 0 };
    }

    const { maxCalls, windowMs } = definition.rateLimit;
    const now = Date.now();
    const key = definition.id;

    let record = this.rateLimitMap.get(key);

    if (!record || now >= record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
      this.rateLimitMap.set(key, record);
    }

    const remaining = maxCalls - record.count;

    if (remaining <= 0) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: record.resetAt,
        waitMs: record.resetAt - now,
      };
    }

    record.count++;
    return { allowed: true, remaining: remaining - 1, resetAt: record.resetAt };
  }

  // ============================================================
  // Health & Metrics
  // ============================================================

  getHealth(): {
    totalTools: number;
    available: number;
    busy: number;
    error: number;
    totalExecutions: number;
  } {
    let available = 0, busy = 0, error = 0;

    for (const tool of this.tools.values()) {
      switch (tool.getStatus()) {
        case 'available': available++; break;
        case 'busy': busy++; break;
        case 'error': error++; break;
      }
    }

    return {
      totalTools: this.tools.size,
      available,
      busy,
      error,
      totalExecutions: this.executions.size,
    };
  }
}

// ============================================================
// Built-in Tool Templates
// ============================================================

export const BuiltInTools = {
  // File System Tools
  readFile: (): ToolDefinition => ({
    id: 'file.read',
    name: 'read_file',
    description: 'Read the contents of a file',
    category: 'file',
    parameters: [
      { name: 'path', type: 'string', description: 'File path', required: true },
      { name: 'encoding', type: 'string', description: 'File encoding', required: false, default: 'utf8' },
    ],
    returns: { type: 'string', description: 'File contents' },
    timeout: 30000,
  }),

  writeFile: (): ToolDefinition => ({
    id: 'file.write',
    name: 'write_file',
    description: 'Write content to a file',
    category: 'file',
    parameters: [
      { name: 'path', type: 'string', description: 'File path', required: true },
      { name: 'content', type: 'string', description: 'Content to write', required: true },
      { name: 'append', type: 'boolean', description: 'Append to file', required: false, default: false },
    ],
    returns: { type: 'boolean', description: 'Success status' },
    timeout: 30000,
    requiresApproval: true,
  }),

  listDirectory: (): ToolDefinition => ({
    id: 'file.list',
    name: 'list_directory',
    description: 'List files in a directory',
    category: 'file',
    parameters: [
      { name: 'path', type: 'string', description: 'Directory path', required: true },
      { name: 'recursive', type: 'boolean', description: 'List recursively', required: false, default: false },
    ],
    returns: { type: 'array', description: 'List of files' },
    timeout: 10000,
  }),

  // HTTP Tools
  httpRequest: (): ToolDefinition => ({
    id: 'http.request',
    name: 'http_request',
    description: 'Make an HTTP request',
    category: 'http',
    parameters: [
      { name: 'url', type: 'string', description: 'Request URL', required: true },
      { name: 'method', type: 'string', description: 'HTTP method', required: false, default: 'GET', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
      { name: 'headers', type: 'object', description: 'Request headers', required: false },
      { name: 'body', type: 'object', description: 'Request body', required: false },
    ],
    returns: { type: 'object', description: 'Response data' },
    timeout: 60000,
    rateLimit: { maxCalls: 100, windowMs: 60000 },
  }),

  // Shell Tools
  runCommand: (): ToolDefinition => ({
    id: 'shell.command',
    name: 'run_command',
    description: 'Execute a shell command',
    category: 'shell',
    parameters: [
      { name: 'command', type: 'string', description: 'Command to execute', required: true },
      { name: 'cwd', type: 'string', description: 'Working directory', required: false },
      { name: 'timeout', type: 'number', description: 'Timeout in ms', required: false, default: 30000 },
    ],
    returns: { type: 'object', description: 'Command output' },
    timeout: 120000,
    requiresApproval: true,
    rateLimit: { maxCalls: 10, windowMs: 60000 },
  }),

  // Search Tools
  webSearch: (): ToolDefinition => ({
    id: 'search.web',
    name: 'web_search',
    description: 'Search the web',
    category: 'search',
    parameters: [
      { name: 'query', type: 'string', description: 'Search query', required: true },
      { name: 'limit', type: 'number', description: 'Max results', required: false, default: 10 },
    ],
    returns: { type: 'array', description: 'Search results' },
    timeout: 30000,
    rateLimit: { maxCalls: 50, windowMs: 60000 },
  }),
} as const;

// ============================================================
// Tool Implementation Examples
// ============================================================

export class ReadFileTool extends BaseTool {
  readonly definition = BuiltInTools.readFile();

  async execute(params: Record<string, unknown>): Promise<ToolResult<string>> {
    const { path, encoding = 'utf8' } = params;

    try {
      // In production, this would use fs.promises
      // For now, we just return a mock result
      this.logger.debug('Reading file', { path, encoding });
      
      return {
        success: true,
        data: `[Mock content of ${path}]`,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

export class HttpRequestTool extends BaseTool {
  readonly definition = BuiltInTools.httpRequest();

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { url, method = 'GET', headers, body } = params;

    try {
      this.logger.debug('Making HTTP request', { url, method });

      // In production, this would use fetch or axios
      // For now, we just return a mock result
      return {
        success: true,
        data: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { message: 'OK' },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

export class RunCommandTool extends BaseTool {
  readonly definition = BuiltInTools.runCommand();

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { command, cwd, timeout = 30000 } = params;

    this.logger.info('Running command', { command, cwd, timeout });

    // In production, this would use child_process
    // This is a placeholder for security reasons
    return {
      success: true,
      data: {
        stdout: `[Mock output of: ${command}]`,
        stderr: '',
        exitCode: 0,
      },
    };
  }
}
