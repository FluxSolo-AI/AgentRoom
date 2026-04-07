# AgentRoom - Development Guide

## Project Structure

```
fluxroom/
├── packages/
│   ├── shared/           # Shared types, events, NATS subjects
│   ├── room-service/     # Room management service
│   ├── orchestrator/      # Task orchestration service
│   ├── agent-runtime/    # Agent runtime (planner, executor, reviewer)
│   └── web/              # Web UI + WebSocket server
├── docker-compose.yaml   # NATS server
└── docs/
    ├── architecture.md   # Full architecture document
    └── DEVELOPMENT.md     # This file
```

## Quick Start

### 1. Start NATS Server

```bash
docker-compose up -d
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start All Services

```bash
npm run dev
```

This will start:
- Room Service (port: connects to NATS)
- Orchestrator Service (port: connects to NATS)
- Agent Runtime (4 agents: planner, executor×2, reviewer)
- Web UI (http://localhost:3000)

## Architecture

### Service Communication

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Web UI     │────▶│ NATS Server  │◀────│   Agents    │
│  (Browser)  │     │              │     │  Runtime    │
└─────────────┘     └──────────────┘     └─────────────┘
       │                   ▲
       │                   │
       ▼                   │
┌─────────────┐     ┌──────────────┐
│  WebSocket │────▶│ Orchestrator │
│   Server   │     │   Service    │
└─────────────┘     └──────────────┘
                           ▲
                           │
                    ┌──────────────┐
                    │ Room Service │
                    └──────────────┘
```

### Event Flow

1. User creates room via Web UI
2. Room Service publishes `room.created` event
3. Orchestrator subscribes and creates tasks
4. Tasks are dispatched to appropriate agents via NATS
5. Agents execute and publish progress/completion events
6. WebSocket server broadcasts events to subscribed clients
7. Web UI updates in real-time

## Implemented Features

### Phase 1: Collaboration Loop ✅

- [x] **Room Model**
  - Create rooms with type (task_room, incident_room, review_room)
  - Room status management
  - Room metadata

- [x] **Participant Management**
  - Add/remove participants (human, agent, system)
  - Presence tracking

- [x] **Message Timeline**
  - Post messages with types
  - Thread support
  - Event publishing

- [x] **Task Management**
  - Create tasks with goals
  - Task hierarchy (parent/child)
  - Task status machine
  - Priority levels
  - Task assignment

- [x] **Human Intervention**
  - Request intervention
  - Intervention status tracking
  - Auto-timeout support

### Phase 2: Real-time & Agents ✅

- [x] **Agent Runtime**
  - Base agent class
  - Planner Agent
  - Executor Agent
  - Reviewer Agent
  - Heartbeat system
  - Progress reporting

- [x] **WebSocket Server**
  - Real-time event broadcasting
  - Room subscriptions
  - Client reconnection

- [x] **Web UI Enhancements**
  - Real-time updates via WebSocket
  - Connection status
  - Event handlers for all event types

### Phase 3: Stability (Planned)

- [ ] JetStream persistence
- [ ] Retry and idempotency
- [ ] Dead letter handling
- [ ] Task timeout and escalation
- [ ] Audit log storage

## API Reference

### NATS Subjects

#### Room Events
```
room.{roomId}.message     - Room messages
room.{roomId}.event       - All room events
room.{roomId}.task.created - Task creation
room.{roomId}.task.updated - Task updates
room.{roomId}.intervention.requested - Human intervention
```

#### Agent Commands
```
agent.{agentType}.command - Broadcast to agent type
agent.{agentId}.command   - Direct to specific agent
agent.{agentId}.status    - Agent status updates
agent.{agentId}.heartbeat - Agent heartbeat
```

#### Orchestrator
```
orchestrator.task.dispatch - Task routing
orchestrator.task.result  - Task completion
orchestrator.human.intervention - Human action routing
```

### WebSocket Messages

#### Client → Server
```json
{ "type": "subscribe", "roomId": "room_123" }
{ "type": "unsubscribe", "roomId": "room_123" }
{ "type": "ping" }
```

#### Server → Client
```json
{ "type": "event", "subject": "room.room_123.event", "event": {...} }
{ "type": "subscribed", "roomId": "room_123" }
{ "type": "pong" }
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| NATS_URL | nats://localhost:4222 | NATS server URL |
| WS_PORT | 8080 | WebSocket server port |
| DEMO_ROOM_ID | demo-room | Demo room ID |

## Running Individual Services

```bash
# Room Service only
npm run dev:room

# Orchestrator only
npm run dev:orch

# Agent Runtime only
npm run dev:agents

# Web UI only
npm run dev:web
```

## Testing

### Manual Test Flow

1. Start all services: `npm run dev`
2. Open http://localhost:3000
3. Create a task in the orchestrator (via API or CLI)
4. Watch the agent pick up the task
5. See progress in the Web UI
6. Approve/reject interventions

## Next Steps

1. **Persistence**: Add JetStream for event replay
2. **Tool System**: Add tool registration and execution
3. **Context Service**: Implement context management
4. **Policy Engine**: Add policy rules and enforcement
5. **Monitoring**: Add metrics and health checks
