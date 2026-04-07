/**
 * Demo Script - Creates sample rooms, tasks, and interactions
 * 
 * Run this to see the system in action.
 */

import { connect, NatsConnection } from 'nats';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';

async function demo() {
  console.log('🔄 Connecting to NATS...');
  const nc = await connect({ servers: NATS_URL });
  console.log('✅ Connected to NATS\n');

  const roomId = 'demo_room_' + Date.now();

  console.log('📋 Creating demo scenario...\n');

  // 1. Create room
  console.log('🏠 Creating room:', roomId);
  nc.publish('system.room.created', JSON.stringify({
    eventId: 'evt_' + Date.now(),
    eventType: 'room.created',
    roomId,
    sender: { id: 'demo-script', type: 'system', name: 'Demo Script' },
    timestamp: new Date().toISOString(),
    payload: {
      name: 'Demo Room - Feature Development',
      type: 'task_room',
      createdBy: 'demo-user',
    },
  }));

  await sleep(500);

  // 2. Create main task
  console.log('📝 Creating main task...');
  nc.publish('room.' + roomId + '.task.created', JSON.stringify({
    eventId: 'evt_' + Date.now(),
    eventType: 'task.created',
    roomId,
    taskId: 'task_001',
    sender: { id: 'orchestrator', type: 'system', name: 'Orchestrator' },
    timestamp: new Date().toISOString(),
    payload: {
      title: 'Build User Dashboard',
      goal: 'Create a comprehensive user dashboard with analytics and settings',
      priority: 'high',
      requiresHuman: false,
    },
  }));

  await sleep(500);

  // 3. Add participants
  console.log('👥 Adding participants...');
  nc.publish('room.' + roomId + '.participant.joined', JSON.stringify({
    eventId: 'evt_' + Date.now(),
    eventType: 'participant.joined',
    roomId,
    sender: { id: 'planner-01', type: 'agent', name: 'Planner Agent' },
    timestamp: new Date().toISOString(),
    payload: {
      participant: {
        id: 'p_planner',
        roomId,
        participantType: 'agent',
        role: 'planner',
        displayName: 'Planner Agent',
        presenceStatus: 'online',
      },
    },
  }));

  await sleep(200);

  nc.publish('room.' + roomId + '.participant.joined', JSON.stringify({
    eventId: 'evt_' + Date.now(),
    eventType: 'participant.joined',
    roomId,
    sender: { id: 'executor-01', type: 'agent', name: 'Executor Agent' },
    timestamp: new Date().toISOString(),
    payload: {
      participant: {
        id: 'p_executor',
        roomId,
        participantType: 'agent',
        role: 'executor',
        displayName: 'Executor Agent',
        presenceStatus: 'busy',
      },
    },
  }));

  await sleep(500);

  // 4. Post messages
  console.log('💬 Posting messages...');
  nc.publish('room.' + roomId + '.message', JSON.stringify({
    eventId: 'evt_' + Date.now(),
    eventType: 'message.posted',
    roomId,
    sender: { id: 'demo-user', type: 'human', name: 'Demo User' },
    timestamp: new Date().toISOString(),
    payload: {
      content: 'We need to build a user dashboard. Let\'s start with the main layout.',
      messageType: 'text',
    },
  }));

  await sleep(500);

  // 5. Create subtasks
  console.log('📋 Creating subtasks...');
  const subtasks = [
    { id: 'task_002', title: 'Design Dashboard Layout', agentType: 'planner' },
    { id: 'task_003', title: 'Implement API endpoints', agentType: 'executor' },
    { id: 'task_004', title: 'Build UI components', agentType: 'executor' },
    { id: 'task_005', title: 'Add authentication', agentType: 'executor' },
    { id: 'task_006', title: 'Security review', agentType: 'reviewer' },
  ];

  for (const task of subtasks) {
    nc.publish('room.' + roomId + '.task.created', JSON.stringify({
      eventId: 'evt_' + Date.now(),
      eventType: 'task.created',
      roomId,
      taskId: task.id,
      sender: { id: 'planner-01', type: 'agent', name: 'Planner Agent' },
      timestamp: new Date().toISOString(),
      payload: {
        title: task.title,
        goal: `Complete: ${task.title}`,
        parentTaskId: 'task_001',
        assignedAgentType: task.agentType,
        priority: task.id === 'task_006' ? 'critical' : 'high',
        requiresHuman: task.id === 'task_006',
      },
    }));
    await sleep(300);
  }

  await sleep(500);

  // 6. Assign and start tasks
  console.log('🎯 Assigning tasks to agents...');
  nc.publish('room.' + roomId + '.task.updated', JSON.stringify({
    eventId: 'evt_' + Date.now(),
    eventType: 'task.assigned',
    roomId,
    taskId: 'task_002',
    sender: { id: 'orchestrator', type: 'system', name: 'Orchestrator' },
    timestamp: new Date().toISOString(),
    payload: {
      taskId: 'task_002',
      assignedTo: 'planner-01',
      assignedAgentType: 'planner',
    },
  }));

  await sleep(300);

  nc.publish('room.' + roomId + '.task.updated', JSON.stringify({
    eventId: 'evt_' + Date.now(),
    eventType: 'task.started',
    roomId,
    taskId: 'task_002',
    sender: { id: 'planner-01', type: 'agent', name: 'Planner Agent' },
    timestamp: new Date().toISOString(),
    payload: {},
  }));

  await sleep(500);

  // 7. Report progress
  console.log('📊 Reporting progress...');
  nc.publish('room.' + roomId + '.event', JSON.stringify({
    eventId: 'evt_' + Date.now(),
    eventType: 'task.progressed',
    roomId,
    taskId: 'task_002',
    sender: { id: 'planner-01', type: 'agent', name: 'Planner Agent' },
    timestamp: new Date().toISOString(),
    payload: {
      taskId: 'task_002',
      progress: 50,
      message: 'Designing the main layout structure',
    },
  }));

  await sleep(500);

  // 8. Request human intervention for critical task
  console.log('⚠️ Requesting human intervention...');
  nc.publish('room.' + roomId + '.intervention.requested', JSON.stringify({
    eventId: 'evt_' + Date.now(),
    eventType: 'intervention.requested',
    roomId,
    taskId: 'task_006',
    interventionId: 'intv_001',
    sender: { id: 'orchestrator', type: 'system', name: 'Orchestrator' },
    timestamp: new Date().toISOString(),
    payload: {
      interventionType: 'approve',
      taskId: 'task_006',
      reason: 'Security review requires human approval due to critical priority',
      timeoutAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
  }));

  await sleep(500);

  // 9. Complete a task
  console.log('✅ Completing task...');
  nc.publish('room.' + roomId + '.task.updated', JSON.stringify({
    eventId: 'evt_' + Date.now(),
    eventType: 'task.completed',
    roomId,
    taskId: 'task_002',
    sender: { id: 'planner-01', type: 'agent', name: 'Planner Agent' },
    timestamp: new Date().toISOString(),
    payload: {
      taskId: 'task_002',
      result: 'Dashboard layout design completed with wireframes',
    },
  }));

  console.log('\n✨ Demo scenario created!');
  console.log('📺 Watch the Web UI to see the events in real-time.');
  console.log('   Room ID:', roomId);
  console.log('\n🛠️  Try resolving the intervention in the UI!');

  await sleep(2000);
  await nc.close();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

demo().catch(console.error);
