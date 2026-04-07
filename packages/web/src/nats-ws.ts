/**
 * Simple WebSocket server that bridges NATS to browser clients
 * 
 * This is a lightweight implementation for development.
 * In production, consider using a proper gateway service.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { parse } from 'url';

const PORT = Number(process.env.WS_PORT) || 8080;

// Room subscriptions for each client
const clientSubscriptions = new Map<WebSocket, Set<string>>();

const server = createServer();
const wss = new WebSocketServer({ server });

console.log(`[WebSocket Server] Starting on port ${PORT}...`);

wss.on('connection', (ws: WebSocket) => {
  console.log('[WebSocket Server] Client connected');
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

  switch (message.type) {
    case 'subscribe':
      // Subscribe to room events
      if (message.roomId) {
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
      if (message.roomId) {
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
