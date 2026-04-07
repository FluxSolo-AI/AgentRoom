/**
 * API E2E Tests
 */

import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_URL || 'http://localhost:3001';

test.describe('API Endpoints', () => {
  test('health check returns 200', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health/live`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('metrics endpoint returns prometheus format', async ({ request }) => {
    const response = await request.get(`${API_BASE}/metrics`);
    expect(response.ok()).toBeTruthy();
    const text = await response.text();
    expect(text).toContain('fluxroom_rooms_total');
  });

  test('create room with valid data', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/rooms`, {
      data: {
        name: 'Test Room',
        type: 'task_room',
        createdBy: 'test-user',
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.room).toBeDefined();
    expect(body.room.name).toBe('Test Room');
  });

  test('create room with invalid type returns 400', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/rooms`, {
      data: {
        name: 'Test Room',
        type: 'invalid_type',
        createdBy: 'test-user',
      },
    });
    expect(response.status()).toBe(400);
  });

  test('list rooms', async ({ request }) => {
    // Create a room first
    await request.post(`${API_BASE}/api/rooms`, {
      data: { name: 'List Test', type: 'task_room', createdBy: 'test' },
    });

    const response = await request.get(`${API_BASE}/api/rooms`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.rooms).toBeDefined();
    expect(Array.isArray(body.rooms)).toBe(true);
  });

  test('get room by ID', async ({ request }) => {
    // Create a room
    const createRes = await request.post(`${API_BASE}/api/rooms`, {
      data: { name: 'Get Test', type: 'task_room', createdBy: 'test' },
    });
    const { room } = await createRes.json();

    const response = await request.get(`${API_BASE}/api/rooms/${room.id}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.room.id).toBe(room.id);
  });

  test('update room status', async ({ request }) => {
    // Create a room
    const createRes = await request.post(`${API_BASE}/api/rooms`, {
      data: { name: 'Update Test', type: 'task_room', createdBy: 'test' },
    });
    const { room } = await createRes.json();

    // Update status
    const response = await request.patch(`${API_BASE}/api/rooms/${room.id}`, {
      data: { status: 'paused' },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.room.status).toBe('paused');
  });

  test('delete room', async ({ request }) => {
    // Create a room
    const createRes = await request.post(`${API_BASE}/api/rooms`, {
      data: { name: 'Delete Test', type: 'task_room', createdBy: 'test' },
    });
    const { room } = await createRes.json();

    // Delete it
    const response = await request.delete(`${API_BASE}/api/rooms/${room.id}`);
    expect(response.status()).toBe(204);
  });

  test('create task in room', async ({ request }) => {
    // Create a room first
    const roomRes = await request.post(`${API_BASE}/api/rooms`, {
      data: { name: 'Task Test', type: 'task_room', createdBy: 'test' },
    });
    const { room } = await roomRes.json();

    // Create a task
    const response = await request.post(`${API_BASE}/api/rooms/${room.id}/tasks`, {
      data: {
        title: 'Test Task',
        goal: 'This is a test task',
        priority: 'high',
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.task).toBeDefined();
    expect(body.task.title).toBe('Test Task');
  });

  test('list tasks in room', async ({ request }) => {
    // Create a room
    const roomRes = await request.post(`${API_BASE}/api/rooms`, {
      data: { name: 'List Tasks Test', type: 'task_room', createdBy: 'test' },
    });
    const { room } = await roomRes.json();

    // Create a task
    await request.post(`${API_BASE}/api/rooms/${room.id}/tasks`, {
      data: { title: 'Task 1', goal: 'Goal 1' },
    });

    // List tasks
    const response = await request.get(`${API_BASE}/api/rooms/${room.id}/tasks`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.tasks).toBeDefined();
    expect(body.tasks.length).toBeGreaterThan(0);
  });
});
