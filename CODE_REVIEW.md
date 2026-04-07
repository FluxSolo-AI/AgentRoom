# 🔍 Code Review - AgentRoom

**Date**: 2026-04-08  
**Reviewer**: Codex  
**Scope**: Phase 1 & Phase 2 Implementation

---

## 📊 Summary

| Category | Status |
|----------|--------|
| TypeScript Compilation | ⚠️ Errors |
| Type Safety | ✅ Good |
| Error Handling | ⚠️ Needs Improvement |
| Security | ⚠️ Needs Attention |
| Code Structure | ✅ Well Organized |
| Documentation | ✅ Good |

---

## 🚨 Critical Issues

### 1. TypeScript Compilation Errors

**Problem**: Shared package needs to be built before other packages can reference it.

```
Cannot find module '@fluxroom/shared'
```

**Fix**: Run `npm run build -w @fluxroom/shared` before other packages.

**Recommendation**: Add a `prepare` script to package.json:
```json
"prepare": "npm run build"
```

### 2. WebSocket Origin Validation Missing

**File**: `packages/web/src/nats-ws.ts`

**Issue**: No origin validation for WebSocket connections - potential security vulnerability.

**Fix**:
```typescript
wss.on('connection', (ws: WebSocket, req) => {
  const origin = req.headers.origin;
  if (!allowedOrigins.includes(origin)) {
    ws.close(1008, 'Invalid origin');
    return;
  }
  // ...
});
```

---

## ⚠️ Warnings

### 3. No Input Validation

**Files**: All services

**Issue**: User inputs are not validated before processing.

**Examples**:
- `createRoom(name, type)` - no length/type checks
- `postMessage(content)` - no content validation
- Task goals can be arbitrarily long

**Recommendation**: Add validation layer:
```typescript
function validateRoomName(name: string): boolean {
  return typeof name === 'string' && name.length >= 1 && name.length <= 200;
}
```

### 4. In-Memory Storage with No Persistence

**Files**: All services

**Issue**: All data is stored in-memory Maps. Service restart = data loss.

**Current**:
```typescript
private rooms: Map<string, Room> = new Map();
```

**Recommendation**: 
1. Add JetStream persistence for events
2. Add Postgres/Redis for entity storage
3. Implement event replay on startup

### 5. Missing Error Boundaries

**File**: `packages/web/src/App.tsx`

**Issue**: React components can crash without error boundaries.

**Recommendation**:
```typescript
<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>
```

### 6. Potential Memory Leaks

**File**: `packages/web/src/nats-ws.ts`

**Issue**: WebSocket subscriptions are cleaned up on disconnect, but the `clientSubscriptions` Map entry persists.

**Fix**:
```typescript
ws.on('close', () => {
  console.log('[WebSocket Server] Client disconnected');
  clientSubscriptions.delete(ws);  // Already there ✅
});
```

Actually, this is handled correctly. ✅

---

## 💡 Recommendations

### High Priority

1. **Add Docker Compose for Full Stack**
   ```yaml
   # Add PostgreSQL for persistence
   postgres:
     image: postgres:15
     environment:
       POSTGRES_DB: fluxroom
   ```

2. **Add Health Checks**
   ```typescript
   // Add /health endpoint to all services
   app.get('/health', (req, res) => {
     res.json({ status: 'healthy', uptime: process.uptime() });
   });
   ```

3. **Add Request Timeout**
   ```typescript
   const nc = await connect({ 
     servers: NATS_URL,
     timeout: 10000,  // 10 second timeout
   });
   ```

### Medium Priority

4. **Replace console.log with Logger**
   ```typescript
   // Use structured logging
   logger.info('Room created', { roomId: room.id, type: room.type });
   logger.error('Failed to publish event', { error: e.message });
   ```

5. **Add Request ID to All Operations**
   ```typescript
   // For distributed tracing
   const traceId = headers['x-trace-id'] || uuidv4();
   ```

6. **Add Rate Limiting**
   ```typescript
   // WebSocket server
   const rateLimit = new Map<string, number>();
   // Allow max 100 messages per minute per client
   ```

### Low Priority

7. **Add API Documentation** (Swagger/OpenAPI)
8. **Add Unit Tests** (Jest/Vitest)
9. **Add E2E Tests** (Playwright)
10. **Add CI/CD Pipeline**

---

## ✅ Good Practices Found

| Practice | Location |
|----------|----------|
| TypeScript strict mode | tsconfig.json |
| Event envelope pattern | packages/shared/src/events.ts |
| Subject naming convention | packages/shared/src/nats.ts |
| Queue groups for scaling | All services |
| Structured error messages | All services |
| Graceful shutdown | All services |
| Heartbeat mechanism | agent-runtime |

---

## 🔧 Quick Fixes

### Fix 1: Build Order Issue

```bash
# Run this before development
npm run build -w @fluxroom/shared
```

### Fix 2: WebSocket Origin Validation

Add to `nats-ws.ts`:
```typescript
const allowedOrigins = ['http://localhost:3000', 'https://your-domain.com'];

wss.on('connection', (ws: WebSocket, req) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    console.log(`[WebSocket] Rejected connection from: ${origin}`);
    ws.close(1008, 'Origin not allowed');
    return;
  }
  // proceed with connection
});
```

### Fix 3: Add Shutdown Hooks

All services have SIGINT handlers but could be improved:

```typescript
const shutdown = async () => {
  console.log('[Service] Graceful shutdown...');
  
  // Close NATS connection
  await nc.close();
  
  // Save state to disk if needed
  await saveState();
  
  process.exit(0);
};

process.on('SIGTERM', shutdown);
```

---

## 📈 Performance Considerations

1. **Message Batching**: Consider batching messages for high-throughput scenarios
2. **Subscription Filtering**: Use NATS subject wildcards efficiently
3. **Connection Pooling**: Reuse NATS connections across requests
4. **Lazy Loading**: Load older messages on-demand in UI

---

## 📝 Test Coverage Checklist

- [ ] Unit tests for all services
- [ ] Integration tests for NATS communication
- [ ] E2E tests for Web UI
- [ ] Load testing with multiple agents
- [ ] Chaos testing (service failures)

---

## 🏁 Conclusion

The codebase is well-structured and follows good practices for a Phase 1/2 implementation. Main concerns are:

1. **Build order** - needs `prepare` script
2. **Persistence** - all data is in-memory
3. **Security** - WebSocket origin validation missing
4. **Validation** - no input validation

These are expected for an MVP. The architecture is solid and ready for Phase 3 (stability/persistence).

---

**Next Steps**:
1. Fix TypeScript build order
2. Add WebSocket origin validation
3. Implement JetStream persistence
4. Add input validation layer
