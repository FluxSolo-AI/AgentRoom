# AgentRoom - Phase 1 Implementation

## Project Structure

```
fluxroom/
├── packages/
│   ├── shared/          # Shared types, events, NATS subjects
│   ├── room-service/    # Room management service
│   ├── orchestrator/    # Task orchestration service
│   ├── agent-runtime/   # Agent runtime (future)
│   └── web/            # Web UI
├── docker-compose.yaml  # NATS server
└── docs/
    ├── architecture.md # Full architecture document
    └── DEVELOPMENT.md   # This file
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
- Room Service (connects to NATS, manages rooms)
- Orchestrator Service (manages tasks and interventions)
- Web UI (http://localhost:3000)

## Implemented Features

### Phase 1: Collaboration Loop ✅

- [x] **Room Model**
  - Create rooms with type (task_room, incident_room, review_room)
  - Room status management (active, paused, waiting_human, completed, archived)
  - Room metadata (name, policy, context)

- [x] **Participant Management**
  - Add/remove participants (human, agent, system)
  - Presence tracking (online, away, busy, offline)
  - Participant roles

- [x] **Message Timeline**
  - Post messages with types (text, command, event, intervention, system)
  - Thread support
  - Event publishing to NATS

- [x] **Task Management**
  - Create tasks with goals
  - Task hierarchy (parent/child)
  - Task status machine (pending → assigned → in_progress → completed)
  - Priority levels (low, medium, high, critical)
  - Task assignment to agents

- [x] **Human Intervention**
  - Request intervention (approve, reject, takeover, pause, etc.)
  - Intervention status tracking
  - Auto-timeout support
  - Resolution with resume policies

- [x] **NATS Integration**
  - Event publishing
  - Subject naming convention
  - Queue groups for horizontal scaling

- [x] **Web UI**
  - Room header with status
  - Message timeline
  - Task tree with hierarchy
  - Intervention panel with action buttons
  - Message composer

## Next Steps

### Phase 2: Stability

- [ ] JetStream persistence
- [ ] Retry, idempotency, dead-letter handling
- [ ] Audit and replay
- [ ] Task timeout and escalation

### Phase 3: Intelligence

- [ ] Dynamic routing
- [ ] Agent load awareness
- [ ] Policy-driven approvals
- [ ] Long context retrieval

## NATS Subjects

See `packages/shared/src/nats.ts` for the subject naming convention.

## API Reference

### Room Events
```
room.{roomId}.message     - Room messages
room.{roomId}.event       - All room events
room.{roomId}.task.created - Task creation
room.{roomId}.task.updated - Task updates
room.{roomId}.intervention.requested - Human intervention requests
```

### Agent Commands
```
agent.{agentType}.command - Broadcast to agent type
agent.{agentId}.command   - Direct to specific agent
```

### Orchestrator
```
orchestrator.task.dispatch - Task routing
orchestrator.task.result  - Task completion results
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| NATS_URL | nats://localhost:4222 | NATS server URL |
| DEMO_ROOM_ID | demo-room | Demo room ID for testing |
