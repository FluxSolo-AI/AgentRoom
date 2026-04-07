/**
 * API Gateway - HTTP REST API for AgentRoom
 * 
 * Provides:
 * - RESTful endpoints for room, task, and intervention management
 * - Health check endpoints for monitoring
 * - Webhook support for external integrations
 * - Rate limiting for protection against abuse
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createLogger, validateRoomInput, validateTaskInput, validateRoomId } from '@fluxroom/shared';

// ============================================================
// Configuration
// ============================================================

const PORT = Number(process.env.PORT) || 3001;
const LOG_FORMAT = process.env.NODE_ENV === 'production' ? 'json' : 'console';

const logger = createLogger('api', { format: LOG_FORMAT as 'console' | 'json' });

// ============================================================
// Rate Limiting (Simple in-memory implementation)
// ============================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100; // requests per window

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  let entry = rateLimitMap.get(ip);
  
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(ip, entry);
  }
  
  entry.count++;
  
  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX.toString());
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX - entry.count).toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000).toString());
  
  if (entry.count > RATE_LIMIT_MAX) {
    res.status(429).json({ error: 'Too many requests, please try again later.' });
    return;
  }
  
  next();
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now >= entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 60000); // Clean up every minute

// ============================================================
// Express App
// ============================================================

const app = express();

// Apply rate limiting
app.use(rateLimitMiddleware);

// CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });
  
  next();
});

// ============================================================
// Health Check Endpoints
// ============================================================

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latency?: number;
  error?: string;
}

app.get('/health', async (req: Request, res: Response) => {
  const checks: ServiceHealth[] = [];
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Check NATS connectivity (mock for now)
  const natsCheck: ServiceHealth = { name: 'nats', status: 'unknown' };
  try {
    // In production, actually check NATS connection
    natsCheck.status = 'healthy';
    natsCheck.latency = Math.floor(Math.random() * 10);
  } catch (error) {
    natsCheck.status = 'unhealthy';
    natsCheck.error = (error as Error).message;
    overallStatus = 'unhealthy';
  }
  checks.push(natsCheck);

  // Check memory usage
  const memoryUsage = process.memoryUsage();
  const memoryCheck: ServiceHealth = {
    name: 'memory',
    status: memoryUsage.heapUsed / memoryUsage.heapTotal < 0.9 ? 'healthy' : 'degraded',
    latency: 0,
  };
  checks.push(memoryCheck);

  const response = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
  };

  res.status(overallStatus === 'unhealthy' ? 503 : 200).json(response);
});

app.get('/health/live', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.get('/health/ready', (req: Request, res: Response) => {
  res.json({ status: 'ready' });
});

// ============================================================
// Room Endpoints
// ============================================================

// In-memory storage for demo (in production, use the Room Service)
const rooms = new Map<string, any>();

app.post('/api/rooms', (req: Request, res: Response) => {
  const { name, type, createdBy, policyId } = req.body;

  // Validate input
  const validation = validateRoomInput({ name, type, createdBy, policyId });
  if (!validation.valid) {
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: validation.errors 
    });
  }

  const roomId = `room_${Date.now().toString(36)}`;
  const room = {
    id: roomId,
    name,
    type,
    status: 'active',
    createdBy,
    policyId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  rooms.set(roomId, room);
  
  logger.info('Room created via API', { roomId, name, type });
  
  res.status(201).json({ room });
});

app.get('/api/rooms', (req: Request, res: Response) => {
  const roomList = Array.from(rooms.values());
  res.json({ rooms: roomList, count: roomList.length });
});

app.get('/api/rooms/:roomId', (req: Request, res: Response) => {
  const { roomId } = req.params;

  const validation = validateRoomId(roomId);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Invalid room ID' });
  }

  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  res.json({ room });
});

app.patch('/api/rooms/:roomId', (req: Request, res: Response) => {
  const { roomId } = req.params;
  const { status } = req.body;

  const validation = validateRoomId(roomId);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Invalid room ID' });
  }

  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (status) {
    room.status = status;
    room.updatedAt = new Date().toISOString();
    rooms.set(roomId, room);
  }

  res.json({ room });
});

app.delete('/api/rooms/:roomId', (req: Request, res: Response) => {
  const { roomId } = req.params;

  const validation = validateRoomId(roomId);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Invalid room ID' });
  }

  if (!rooms.has(roomId)) {
    return res.status(404).json({ error: 'Room not found' });
  }

  rooms.delete(roomId);
  
  logger.info('Room deleted via API', { roomId });
  
  res.status(204).send();
});

// ============================================================
// Task Endpoints
// ============================================================

const tasks = new Map<string, any>();

app.post('/api/rooms/:roomId/tasks', (req: Request, res: Response) => {
  const { roomId } = req.params;
  const { title, goal, priority, requiresHuman, parentTaskId, assignedAgentType } = req.body;

  const validation = validateTaskInput({ title, goal, priority });
  if (!validation.valid) {
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: validation.errors 
    });
  }

  const taskId = `task_${Date.now().toString(36)}`;
  const task = {
    id: taskId,
    roomId,
    parentTaskId,
    title,
    goal,
    assignedAgentType,
    status: assignedAgentType ? 'assigned' : 'pending',
    priority: priority || 'medium',
    requiresHuman: requiresHuman || false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  tasks.set(taskId, task);
  
  logger.info('Task created via API', { taskId, roomId, title });
  
  res.status(201).json({ task });
});

app.get('/api/rooms/:roomId/tasks', (req: Request, res: Response) => {
  const { roomId } = req.params;
  
  const roomTasks = Array.from(tasks.values())
    .filter(t => t.roomId === roomId);
  
  res.json({ tasks: roomTasks, count: roomTasks.length });
});

app.get('/api/tasks/:taskId', (req: Request, res: Response) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);
  
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  res.json({ task });
});

 app.patch('/api/tasks/:taskId', (req: Request, res: Response) => {
  const { taskId } = req.params;
  const { status, assignedTo } = req.body;
  
  const task = tasks.get(taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (status) task.status = status;
  if (assignedTo) task.assignedTo = assignedTo;
  task.updatedAt = new Date().toISOString();
  
  tasks.set(taskId, task);
  
  logger.info('Task updated via API', { taskId, status, assignedTo });
  
  res.json({ task });
});

// ============================================================
// Metrics Endpoint (Prometheus-style)
// ============================================================

app.get('/metrics', (req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  const metrics = `
# HELP fluxroom_rooms_total Total number of rooms
# TYPE fluxroom_rooms_total gauge
fluxroom_rooms_total ${rooms.size}

# HELP fluxroom_tasks_total Total number of tasks
# TYPE fluxroom_tasks_total gauge
fluxroom_tasks_total ${tasks.size}

# HELP fluxroom_tasks_by_status Tasks by status
# TYPE fluxroom_tasks_by_status gauge
${['pending', 'in_progress', 'completed', 'failed'].map(status => 
  `fluxroom_tasks_by_status{status="${status}"} ${
    Array.from(tasks.values()).filter(t => t.status === status).length
  }`
).join('\n')}

# HELP fluxroom_memory_heap_used_bytes Memory heap used
# TYPE fluxroom_memory_heap_used_bytes gauge
fluxroom_memory_heap_used_bytes ${memoryUsage.heapUsed}

# HELP fluxroom_memory_heap_total_bytes Memory heap total
# TYPE fluxroom_memory_heap_total_bytes gauge
fluxroom_memory_heap_total_bytes ${memoryUsage.heapTotal}

# HELP fluxroom_uptime_seconds Process uptime in seconds
# TYPE fluxroom_uptime_seconds counter
fluxroom_uptime_seconds ${process.uptime()}

# HELP fluxroom_cpu_user_seconds_total CPU user time
# TYPE fluxroom_cpu_user_seconds_total counter
fluxroom_cpu_user_seconds_total ${cpuUsage.user / 1000000}

# HELP fluxroom_cpu_system_seconds_total CPU system time
# TYPE fluxroom_cpu_system_seconds_total counter
fluxroom_cpu_system_seconds_total ${cpuUsage.system / 1000000}
`.trim();

  res.set('Content-Type', 'text/plain');
  res.send(metrics);
});

// ============================================================
// Error Handling
// ============================================================

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', err, {
    method: req.method,
    path: req.path,
  });

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// ============================================================
// Start Server
// ============================================================

app.listen(PORT, () => {
  logger.info(`API Gateway listening on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`Metrics: http://localhost:${PORT}/metrics`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  process.exit(0);
});
