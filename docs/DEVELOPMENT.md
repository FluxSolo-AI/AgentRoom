# AgentRoom - Development Guide

## Project Structure

```
fluxroom/
├── packages/
│   ├── shared/           # Shared types, events, tools, context, policy
│   ├── room-service/     # Room management service
│   ├── orchestrator/      # Task orchestration service
│   ├── agent-runtime/    # Agent runtime with tool integration
│   ├── api/              # HTTP REST API gateway
│   └── web/              # Web UI + WebSocket server
├── scripts/
│   ├── demo.ts           # Demo scenario script
│   └── init-db.sql       # PostgreSQL schema
├── docker-compose.yaml    # Full stack infrastructure
└── docs/
    ├── architecture.md   # Full architecture document
    └── DEVELOPMENT.md    # This file
```

## Phase 4: Intelligence Features

### Implemented in Phase 4

- [x] **Tool System**
  - Tool registry for capability management
  - Built-in tool definitions (file, http, shell, search)
  - Tool execution with rate limiting
  - Approval workflow for sensitive tools

- [x] **Context Management**
  - Per-room context isolation
  - Entry types (message, task, tool_result, observation, summary)
  - Window strategies (sliding, summary, breakdown)
  - Context search and stats

- [x] **Policy Engine**
  - Rule-based access control
  - Policy conditions and priorities
  - Violation tracking
  - Built-in default policies

- [x] **Agent Enhancements**
  - Tool-aware agents
  - Context integration
  - Policy enforcement
  - Execution planning

### Planned for Phase 4/5

- [ ] LLM integration for task planning
- [ ] Dynamic tool discovery
- [ ] Predictive intervention
- [ ] Multi-region support

## Quick Start

### 1. Start Infrastructure

```bash
docker-compose up -d nats postgres redis
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start All Services

```bash
npm run dev
```

## Tool System

### Available Tools

| Tool ID | Name | Category | Description |
|---------|------|----------|-------------|
| `file.read` | read_file | file | Read file contents |
| `file.write` | write_file | file | Write content to file |
| `file.list` | list_directory | file | List directory contents |
| `http.request` | http_request | http | Make HTTP requests |
| `shell.command` | run_command | shell | Execute shell commands |
| `search.web` | web_search | search | Search the web |

### Using Tools in Agents

```typescript
// Check policy before execution
const policyResult = policies.canExecuteTool(toolId, toolName, toolCategory);
if (!policyResult.allowed) {
  if (policyResult.requiresApproval) {
    // Trigger human intervention
  }
  return { success: false, error: 'Policy denied' };
}

// Execute tool
const result = await executeTool('file.read', { path: '/tmp/data.txt' });
```

## Context Management

### Adding Context Entries

```typescript
// Add task to context
context.addEntry(roomId, 'task', {
  taskId: 'task_123',
  goal: 'Build feature X',
  status: 'in_progress',
}, agentId, { taskId: 'task_123' });

// Add tool result
context.addEntry(roomId, 'tool_result', {
  toolId: 'file.read',
  result: 'file contents...',
}, agentId, { taskId: 'task_123' });
```

### Querying Context

```typescript
// Get recent entries
const entries = context.getRecentEntries(roomId, 50);

// Get task-specific context
const taskEntries = context.getTaskContext(roomId, taskId);

// Search context
const results = context.search(roomId, 'authentication');

// Get context stats
const stats = context.getStats(roomId);
```

## Policy Engine

### Default Policies

| Policy | Effect | Priority | Description |
|--------|--------|----------|-------------|
| Shell Command Approval | require_human_approval | 100 | Shell commands need approval |
| File Write Approval | require_human_approval | 90 | File writes need approval |
| Critical Task Human Approval | require_human_approval | 80 | Critical tasks need approval |
| High Priority Logging | log_only | 50 | Log high priority operations |
| Default Allow | allow | 0 | Allow all other actions |

### Evaluating Policies

```typescript
// Check tool execution
const result = policies.canExecuteTool(toolId, toolName, toolCategory);

// Check task creation
const result = policies.canCreateTask(priority, requiresHuman);

// Check task execution
const result = policies.canExecuteTask(taskId, priority, assignedTo);
```

### Creating Custom Policies

```typescript
policies.addRule({
  name: 'Custom Policy',
  effect: 'deny',
  subjects: ['tool'],
  actions: ['execute'],
  conditions: [
    { field: 'tool.category', operator: 'equals', value: 'shell' },
  ],
  priority: 110,
  enabled: true,
});
```

## Architecture

### Service Communication

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
└─────────────────┬───────────────────────┬───────────────────┘
                  │                       │
                  ▼                       ▼
          ┌──────────────┐        ┌─────────────┐
          │   Web UI     │        │  WebSocket  │
          │  (React)    │        │   Server    │
          └──────┬───────┘        └──────┬──────┘
                 │                       │
                 └───────────┬───────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │   NATS Server      │
                  │  (Message Bus)     │
                  └─────────┬───────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│Room Service  │   │ Orchestrator │   │Agent Runtime │
│              │   │              │   │  + Tools     │
│              │   │              │   │  + Context   │
│              │   │              │   │  + Policy    │
└──────────────┘   └──────────────┘   └──────────────┘
       │                                    │
       └──────────┬─────────────────────────┘
                  │
                  ▼
          ┌──────────────┐
          │ PostgreSQL   │
          │ (Storage)   │
          └──────────────┘
```

## API Reference

### Tool Endpoints (via API Gateway)

```bash
# List available tools
curl http://localhost:3001/api/tools

# Execute tool
curl -X POST http://localhost:3001/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"toolId": "file.read", "parameters": {"path": "/tmp/test.txt"}}'
```

### Context Endpoints

```bash
# Get room context
curl http://localhost:3001/api/rooms/{roomId}/context

# Search context
curl "http://localhost:3001/api/rooms/{roomId}/context/search?q=authentication"

# Get context stats
curl http://localhost:3001/api/rooms/{roomId}/context/stats
```

### Policy Endpoints

```bash
# List policies
curl http://localhost:3001/api/policies

# Evaluate policy
curl -X POST http://localhost:3001/api/policies/evaluate \
  -H "Content-Type: application/json" \
  -d '{"subjectType": "tool", "action": "execute", "context": {"tool.category": "shell"}}'

# Get violations
curl http://localhost:3001/api/policies/violations
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| NATS_URL | nats://localhost:4222 | NATS server URL |
| LOG_LEVEL | debug | Logging level |
| NODE_ENV | development | Environment mode |
| DEMO_ROOM_ID | demo-room | Demo room ID |

## Monitoring

### Health Checks

```bash
# All services
curl http://localhost:3001/health

# NATS monitor
curl http://localhost:8222/healthz
```

### Metrics

```bash
curl http://localhost:3001/metrics
```

## Testing

### Demo Script

```bash
npm run demo
```

### Manual Testing

1. Start all services: `npm run dev`
2. Open Web UI: http://localhost:3000
3. Create tasks via API
4. Watch agents execute with tools
5. Review context and policy logs

## Next Steps

### Phase 5: Scale (Planned)

- [ ] Multi-region deployment
- [ ] Horizontal scaling of agents
- [ ] Load balancing
- [ ] CDN integration

### Phase 6: Intelligence (Planned)

- [ ] LLM-based task planning
- [ ] Dynamic tool generation
- [ ] Predictive analytics
- [ ] Self-healing systems
