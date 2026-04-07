/**
 * Simple WebSocket server that bridges NATS to browser clients
 * 
 * This is a lightweight implementation for development.
 * In production, consider using a proper gateway service.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { IncomingMessage } from 'http';

const PORT = Number(process.env.WS_PORT) || 8080;

// Allowed origins for WebSocket connections (configurable via environment)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');

// Room subscriptions for each client
const clientSubscriptions = new Map<WebSocket, Set<string>>();

const server = createServer();
const wss = new WebSocketServer({ server });

console.log(`[WebSocket Server] Starting on port ${PORT}...`);
console.log(`[WebSocket Server] Allowed origins: ${allowedOrigins.join(', ')}`);

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  // Validate origin for security
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    console.log(`[WebSocket Server] Rejected connection from: ${origin}`);
    ws.close(1008, 'Origin not allowed');
    return;
  }

  console.log('[WebSocket Server] Client connected from:', origin || 'unknown');
  clientSubscriptions.set(ws, new Set());

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(ws, message);
    } catch (e) {
      console.error('[WebSocket Server] Failed to parse message:', e);
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket Server] Client disconnected');
    clientSubscriptions.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[WebSocket Server] WebSocket error:', error);
  });
});

function handleMessage(ws: WebSocket, message: any) {
  const subscriptions = clientSubscriptions.get(ws);
  if (!subscriptions) return;

  // Validate message structure
  if (!message || typeof message !== 'object') {
    console.log('[WebSocket Server] Invalid message format');
    return;
  }

  switch (message.type) {
    case 'subscribe':
      // Subscribe to room events
      if (message.roomId && typeof message.roomId === 'string') {
        subscriptions.add(`room.${message.roomId}.#`);
        console.log(`[WebSocket Server] Client subscribed to room: ${message.roomId}`);
        ws.send(JSON.stringify({
          type: 'subscribed',
          roomId: message.roomId,
        }));
      }
      break;

    case 'unsubscribe':
      // Unsubscribe from room
      if (message.roomId && typeof message.roomId === 'string') {
        subscriptions.delete(`room.${message.roomId}.#`);
        console.log(`[WebSocket Server] Client unsubscribed from room: ${message.roomId}`);
      }
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;

    default:
      console.log(`[WebSocket Server] Unknown message type: ${message.type}`);
  }
}

// Broadcast events to subscribed clients
export function broadcastEvent(roomId: string, subject: string, event: any) {
  const subjectPattern = `room.${roomId}.#`;
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      const subscriptions = clientSubscriptions.get(client);
      if (subscriptions?.has(subjectPattern)) {
        client.send(JSON.stringify({
          type: 'event',
          subject,
          roomId,
          event,
        }));
      }
    }
  });
}

server.listen(PORT, () => {
  console.log(`[WebSocket Server] Listening on ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[WebSocket Server] Shutting down...');
  wss.close();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[WebSocket Server] Received SIGTERM, shutting down...');
  wss.close();
  server.close();
  process.exit(0);
});
