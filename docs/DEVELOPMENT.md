# AgentRoom - Development Guide

## Project Structure

```
fluxroom/
├── packages/
│   ├── shared/           # Shared types, events, NATS subjects, validation, logging
│   ├── room-service/     # Room management service
│   ├── orchestrator/      # Task orchestration service
│   ├── agent-runtime/    # Agent runtime (planner, executor, reviewer)
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

## Phase 3: Stability Features

### Implemented in Phase 3

- [x] **Input Validation Layer**
  - Room, task, message validation
  - ID format validation
  - Type-safe validation results

- [x] **Structured Logging**
  - Console logger (development)
  - JSON logger (production)
  - Service-specific loggers
  - Error tracking with stack traces

- [x] **Health Check Endpoints**
  - `/health` - Full health check
  - `/health/live` - Liveness probe
  - `/health/ready` - Readiness probe

- [x] **Metrics Endpoint**
  - Prometheus-compatible `/metrics`
  - Room/task counts
  - Memory/CPU usage

- [x] **API Gateway**
  - RESTful HTTP API
  - Room CRUD operations
  - Task management endpoints
  - Request validation
  - Error handling

- [x] **JetStream Persistence** (foundation)
  - Event streaming setup
  - Event replay capability
  - Stream management

### Planned for Phase 3

- [ ] PostgreSQL entity storage
- [ ] Redis caching
- [ ] Request rate limiting
- [ ] Distributed tracing

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

### 4. Access Services

| Service | URL |
|---------|-----|
| Web UI | http://localhost:3000 |
| API Gateway | http://localhost:3001 |
| Health Check | http://localhost:3001/health |
| Metrics | http://localhost:3001/metrics |
| NATS Monitor | http://localhost:8222 |

## API Reference

### Health Check

```bash
# Full health check
curl http://localhost:3001/health

# Liveness probe
curl http://localhost:3001/health/live

# Readiness probe  
curl http://localhost:3001/health/ready
```

### Metrics

```bash
curl http://localhost:3001/metrics
```

### Rooms API

```bash
# Create room
curl -X POST http://localhost:3001/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"name": "My Room", "type": "task_room", "createdBy": "user1"}'

# List rooms
curl http://localhost:3001/api/rooms

# Get room
curl http://localhost:3001/api/rooms/room_abc123

# Update room
curl -X PATCH http://localhost:3001/api/rooms/room_abc123 \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}'

# Delete room
curl -X DELETE http://localhost:3001/api/rooms/room_abc123
```

### Tasks API

```bash
# Create task
curl -X POST http://localhost:3001/api/rooms/room_abc123/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "My Task", "goal": "Do something", "priority": "high"}'

# List tasks
curl http://localhost:3001/api/rooms/room_abc123/tasks

# Get task
curl http://localhost:3001/api/tasks/task_xyz789

# Update task
curl -X PATCH http://localhost:3001/api/tasks/task_xyz789 \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}'
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
└──────┬───────┘   └──────┬───────┘   └──────────────┘
       │                  │
       └──────────┬─────────┘
                  │
                  ▼
          ┌──────────────┐
          │ PostgreSQL   │
          │ (Storage)   │
          └──────────────┘
```

### HTTP API Gateway

```
Browser ──► API Gateway ──► Room Service
                    │              │
                    │              ▼
                    │       ┌──────────────┐
                    │       │ NATS Server  │
                    │       └──────────────┘
                    ▼
          ┌──────────────┐
          │ Health/Meta  │
          │  Endpoints  │
          └──────────────┘
```

## Environment Variables

### API Gateway

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | HTTP server port |
| NODE_ENV | development | Environment mode |
| NATS_URL | nats://localhost:4222 | NATS server URL |
| ALLOWED_ORIGINS | http://localhost:3000 | CORS origins |
| LOG_LEVEL | debug | Logging level |

### Services

| Variable | Default | Description |
|----------|---------|-------------|
| NATS_URL | nats://localhost:4222 | NATS server URL |
| HEALTH_PORT | 8081 | Health check port |
| LOG_LEVEL | debug | Logging level |

## Testing

### Manual Test Flow

1. Start services: `npm run dev`
2. Check health: `curl http://localhost:3001/health`
3. Create room: `curl -X POST ...`
4. Watch events in NATS monitor: http://localhost:8222

### Demo Script

```bash
npm run demo
```

## Deployment

### Docker Compose (Full Stack)

```bash
docker-compose up -d
```

### Individual Services

```bash
# API Gateway
cd packages/api && npm run build && npm start

# Web UI
cd packages/web && npm run build

# Room Service
cd packages/room-service && npm run build && npm start
```

## Monitoring

### Health Checks

- **Liveness**: Is the process running?
- **Readiness**: Is the service ready to accept traffic?
- **Full**: All dependencies healthy?

### Metrics

Prometheus-compatible metrics at `/metrics`:

- `fluxroom_rooms_total` - Total rooms
- `fluxroom_tasks_total` - Total tasks
- `fluxroom_tasks_by_status{status}` - Tasks by status
- `fluxroom_memory_heap_used_bytes` - Memory usage
- `fluxroom_uptime_seconds` - Process uptime

## Next Steps

### Phase 4: Intelligence (Planned)

- [ ] Dynamic task routing with ML
- [ ] Agent load balancing
- [ ] Predictive intervention
- [ ] Context optimization

### Phase 5: Scale (Planned)

- [ ] Multi-region support
- [ ] Horizontal scaling
- [ ] Load balancing
- [ ] CDN integration
