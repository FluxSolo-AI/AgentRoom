import { create } from 'zustand';
import { Room, Participant, RoomMessage, Task, Intervention } from '@fluxroom/shared';

// ============================================================
// Room Store - Central state management
// ============================================================

interface RoomState {
  // Current room
  currentRoom: Room | null;
  
  // Participants
  participants: Participant[];
  
  // Messages (timeline)
  messages: RoomMessage[];
  
  // Tasks
  tasks: Task[];
  
  // Interventions (pending human actions)
  interventions: Intervention[];
  
  // Connection status
  connected: boolean;
  
  // Actions
  setRoom: (room: Room | null) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (participantId: string) => void;
  addMessage: (message: RoomMessage) => void;
  addTask: (task: Task) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  addIntervention: (intervention: Intervention) => void;
  resolveIntervention: (interventionId: string) => void;
  setConnected: (connected: boolean) => void;
  
  // Demo initialization
  initDemoData: () => void;
}

export const useRoomStore = create<RoomState>((set, get) => ({
  // Initial state
  currentRoom: null,
  participants: [],
  messages: [],
  tasks: [],
  interventions: [],
  connected: false,

  // Actions
  setRoom: (room) => set({ currentRoom: room }),
  
  addParticipant: (participant) => set((state) => ({
    participants: [...state.participants, participant],
  })),
  
  removeParticipant: (participantId) => set((state) => ({
    participants: state.participants.filter((p) => p.id !== participantId),
  })),
  
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),
  
  addTask: (task) => set((state) => ({
    tasks: [...state.tasks, task],
  })),
  
  updateTask: (taskId, updates) => set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId ? { ...t, ...updates } : t
    ),
  })),
  
  addIntervention: (intervention) => set((state) => ({
    interventions: [...state.interventions, intervention],
  })),
  
  resolveIntervention: (interventionId) => set((state) => ({
    interventions: state.interventions.filter((i) => i.id !== interventionId),
  })),
  
  setConnected: (connected) => set({ connected }),

  // Demo initialization
  initDemoData: () => {
    const now = new Date().toISOString();
    
    const demoRoom: Room = {
      id: 'room_demo01',
      name: 'Project Alpha - Sprint Planning',
      type: 'task_room',
      status: 'active',
      createdBy: 'user_demo',
      createdAt: now,
      updatedAt: now,
    };

    const demoParticipants: Participant[] = [
      {
        id: 'p_planner01',
        roomId: demoRoom.id,
        participantType: 'agent',
        role: 'planner',
        displayName: 'Planner Agent',
        runtimeRef: 'planner-01',
        presenceStatus: 'online',
        joinedAt: now,
      },
      {
        id: 'p_executor01',
        roomId: demoRoom.id,
        participantType: 'agent',
        role: 'executor',
        displayName: 'Executor Agent',
        runtimeRef: 'executor-01',
        presenceStatus: 'busy',
        joinedAt: now,
      },
      {
        id: 'p_reviewer01',
        roomId: demoRoom.id,
        participantType: 'agent',
        role: 'reviewer',
        displayName: 'Reviewer Agent',
        runtimeRef: 'reviewer-01',
        presenceStatus: 'online',
        joinedAt: now,
      },
      {
        id: 'p_user01',
        roomId: demoRoom.id,
        participantType: 'human',
        role: 'owner',
        displayName: 'Demo User',
        presenceStatus: 'online',
        joinedAt: now,
      },
    ];

    const demoMessages: RoomMessage[] = [
      {
        id: 'msg_001',
        roomId: demoRoom.id,
        senderId: 'system',
        senderType: 'system',
        senderName: 'Room Service',
        messageType: 'system',
        content: 'Welcome to Project Alpha Sprint Planning room!',
        createdAt: new Date(Date.now() - 300000).toISOString(),
        traceId: 'trace_001',
      },
      {
        id: 'msg_002',
        roomId: demoRoom.id,
        senderId: 'p_user01',
        senderType: 'human',
        senderName: 'Demo User',
        messageType: 'text',
        content: 'Let\'s plan the sprint. We need to complete the user authentication feature.',
        createdAt: new Date(Date.now() - 240000).toISOString(),
        traceId: 'trace_002',
      },
      {
        id: 'msg_003',
        roomId: demoRoom.id,
        senderId: 'p_planner01',
        senderType: 'agent',
        senderName: 'Planner Agent',
        messageType: 'event',
        content: 'I\'ve analyzed the requirements and created 3 sub-tasks for this feature.',
        createdAt: new Date(Date.now() - 180000).toISOString(),
        traceId: 'trace_003',
      },
      {
        id: 'msg_004',
        roomId: demoRoom.id,
        senderId: 'p_executor01',
        senderType: 'agent',
        senderName: 'Executor Agent',
        messageType: 'text',
        content: 'Starting implementation of the login component. Estimated time: 30 minutes.',
        createdAt: new Date(Date.now() - 120000).toISOString(),
        traceId: 'trace_004',
      },
      {
        id: 'msg_005',
        roomId: demoRoom.id,
        senderId: 'p_executor01',
        senderType: 'agent',
        senderName: 'Executor Agent',
        messageType: 'event',
        content: 'Task "Implement Login API" is now 60% complete.',
        createdAt: new Date(Date.now() - 60000).toISOString(),
        traceId: 'trace_005',
      },
    ];

    const demoTasks: Task[] = [
      {
        id: 'task_001',
        roomId: demoRoom.id,
        title: 'User Authentication Feature',
        goal: 'Implement complete user authentication system including login, logout, and session management',
        status: 'in_progress',
        priority: 'high',
        requiresHuman: false,
        createdAt: new Date(Date.now() - 300000).toISOString(),
        updatedAt: new Date(Date.now() - 60000).toISOString(),
        traceId: 'trace_001',
      },
      {
        id: 'task_002',
        roomId: demoRoom.id,
        parentTaskId: 'task_001',
        title: 'Implement Login API',
        goal: 'Create REST API endpoints for user login with JWT tokens',
        assignedTo: 'executor-01',
        assignedAgentType: 'executor',
        status: 'in_progress',
        priority: 'high',
        requiresHuman: false,
        createdAt: new Date(Date.now() - 240000).toISOString(),
        updatedAt: new Date(Date.now() - 60000).toISOString(),
        traceId: 'trace_002',
      },
      {
        id: 'task_003',
        roomId: demoRoom.id,
        parentTaskId: 'task_001',
        title: 'Design Login UI',
        goal: 'Create responsive login form with validation',
        assignedTo: 'executor-01',
        assignedAgentType: 'executor',
        status: 'pending',
        priority: 'medium',
        requiresHuman: false,
        createdAt: new Date(Date.now() - 240000).toISOString(),
        updatedAt: new Date(Date.now() - 240000).toISOString(),
        traceId: 'trace_003',
      },
      {
        id: 'task_004',
        roomId: demoRoom.id,
        parentTaskId: 'task_001',
        title: 'Review Security Implementation',
        goal: 'Security audit of authentication implementation',
        assignedTo: 'reviewer-01',
        assignedAgentType: 'reviewer',
        status: 'pending',
        priority: 'high',
        requiresHuman: false,
        createdAt: new Date(Date.now() - 240000).toISOString(),
        updatedAt: new Date(Date.now() - 240000).toISOString(),
        traceId: 'trace_004',
      },
    ];

    const demoInterventions: Intervention[] = [
      {
        id: 'intv_001',
        roomId: demoRoom.id,
        taskId: 'task_004',
        interventionType: 'approve',
        requestedBy: 'system',
        status: 'open',
        reason: 'Security review requires human approval due to high priority',
        createdAt: new Date(Date.now() - 60000).toISOString(),
        timeoutAt: new Date(Date.now() + 300000).toISOString(),
      },
    ];

    set({
      currentRoom: demoRoom,
      participants: demoParticipants,
      messages: demoMessages,
      tasks: demoTasks,
      interventions: demoInterventions,
      connected: true,
    });
  },
}));
