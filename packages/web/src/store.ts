import { create } from 'zustand';
import { Room, Participant, RoomMessage, Task, Intervention } from '@fluxroom/shared';

// ============================================================
// WebSocket Client
// ============================================================

class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private handlers: Set<(event: any) => void> = new Set();

  connect(roomId?: string) {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this.reconnectAttempts = 0;
        
        if (roomId) {
          this.subscribe(roomId);
        }
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'event') {
            this.handlers.forEach(handler => handler(data));
          }
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e);
        }
      };
      
      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.attemptReconnect(roomId);
      };
      
      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };
    } catch (e) {
      console.error('[WebSocket] Failed to connect:', e);
      this.attemptReconnect(roomId);
    }
  }

  private attemptReconnect(roomId?: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[WebSocket] Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect(roomId);
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.log('[WebSocket] Max reconnection attempts reached');
    }
  }

  subscribe(roomId: string) {
    this.send({ type: 'subscribe', roomId });
  }

  unsubscribe(roomId: string) {
    this.send({ type: 'unsubscribe', roomId });
  }

  send(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  onEvent(handler: (event: any) => void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
const wsClient = new WebSocketClient();

// ============================================================
// Room Store
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
  
  // WebSocket client
  wsClient: WebSocketClient;
  
  // Actions
  setRoom: (room: Room | null) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (participantId: string) => void;
  addMessage: (message: RoomMessage) => void;
  updateMessage: (messageId: string, updates: Partial<RoomMessage>) => void;
  addTask: (task: Task) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  removeTask: (taskId: string) => void;
  addIntervention: (intervention: Intervention) => void;
  resolveIntervention: (interventionId: string) => void;
  setConnected: (connected: boolean) => void;
  connectToRoom: (roomId: string) => void;
  disconnectFromRoom: () => void;
  
  // Event handlers
  handleEvent: (data: any) => void;
  
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
  wsClient,

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
  
  updateMessage: (messageId, updates) => set((state) => ({
    messages: state.messages.map((m) =>
      m.id === messageId ? { ...m, ...updates } : m
    ),
  })),
  
  addTask: (task) => set((state) => ({
    tasks: [...state.tasks, task],
  })),
  
  updateTask: (taskId, updates) => set((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === taskId ? { ...t, ...updates } : t
    ),
  })),
  
  removeTask: (taskId) => set((state) => ({
    tasks: state.tasks.filter((t) => t.id !== taskId),
  })),
  
  addIntervention: (intervention) => set((state) => ({
    interventions: [...state.interventions, intervention],
  })),
  
  resolveIntervention: (interventionId) => set((state) => ({
    interventions: state.interventions.filter((i) => i.id !== interventionId),
  })),
  
  setConnected: (connected) => set({ connected }),

  // Connect to room via WebSocket
  connectToRoom: (roomId) => {
    const state = get();
    state.wsClient.connect(roomId);
    state.setConnected(true);
  },

  disconnectFromRoom: () => {
    const state = get();
    state.wsClient.disconnect();
    state.setConnected(false);
  },

  // Handle incoming events
  handleEvent: (data) => {
    const state = get();
    const event = data.event;
    
    if (!event) return;
    
    switch (event.eventType) {
      case 'participant.joined':
        state.addParticipant(event.payload.participant);
        break;
        
      case 'participant.left':
        state.removeParticipant(event.payload.participantId);
        break;
        
      case 'message.posted':
        state.addMessage({
          id: event.eventId,
          roomId: event.roomId,
          senderId: event.sender.id,
          senderType: event.sender.type,
          senderName: event.sender.name,
          messageType: 'text',
          content: event.payload.content,
          traceId: event.traceId,
          createdAt: event.timestamp,
        });
        break;
        
      case 'task.created':
        state.addTask({
          id: event.taskId,
          roomId: event.roomId,
          title: event.payload.title,
          goal: event.payload.goal,
          status: 'pending',
          priority: event.payload.priority,
          requiresHuman: event.payload.requiresHuman,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        });
        break;
        
      case 'task.assigned':
        state.updateTask(event.taskId, {
          status: 'assigned',
          assignedTo: event.payload.assignedTo,
        });
        break;
        
      case 'task.started':
        state.updateTask(event.taskId, { status: 'in_progress' });
        break;
        
      case 'task.progressed':
        // Could update progress bar here
        break;
        
      case 'task.completed':
        state.updateTask(event.taskId, {
          status: 'completed',
          completedAt: event.timestamp,
        });
        break;
        
      case 'task.failed':
        state.updateTask(event.taskId, { status: 'failed' });
        break;
        
      case 'intervention.requested':
        state.addIntervention({
          id: event.interventionId,
          roomId: event.roomId,
          taskId: event.taskId,
          interventionType: event.payload.interventionType,
          requestedBy: event.sender.id,
          status: 'open',
          reason: event.payload.reason,
          createdAt: event.timestamp,
          timeoutAt: event.payload.timeoutAt,
        });
        break;
        
      case 'intervention.resolved':
        state.resolveIntervention(event.interventionId);
        break;
        
      default:
        console.log('[Store] Unknown event type:', event.eventType);
    }
  },

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

    // Subscribe to WebSocket events (demo mode - no actual WS connection)
    const unsubscribe = wsClient.onEvent((event) => {
      get().handleEvent(event);
    });

    // Store unsubscribe for cleanup
    (window as any).__wsUnsubscribe = unsubscribe;
  },
}));
