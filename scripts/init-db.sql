-- AgentRoom Database Schema
-- Phase 3: Persistence Layer

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_by VARCHAR(64) NOT NULL,
    context_ref TEXT,
    policy_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Participants table
CREATE TABLE IF NOT EXISTS participants (
    id VARCHAR(64) PRIMARY KEY,
    room_id VARCHAR(64) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    participant_type VARCHAR(20) NOT NULL,
    role VARCHAR(50) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    runtime_ref VARCHAR(64),
    presence_status VARCHAR(20) DEFAULT 'offline',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(64) PRIMARY KEY,
    room_id VARCHAR(64) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    sender_id VARCHAR(64) NOT NULL,
    sender_type VARCHAR(20) NOT NULL,
    sender_name VARCHAR(255) NOT NULL,
    message_type VARCHAR(20) NOT NULL,
    thread_id VARCHAR(64),
    reply_to VARCHAR(64),
    content TEXT NOT NULL,
    trace_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(64) PRIMARY KEY,
    room_id VARCHAR(64) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    parent_task_id VARCHAR(64) REFERENCES tasks(id) ON DELETE SET NULL,
    title VARCHAR(500) NOT NULL,
    goal TEXT NOT NULL,
    assigned_to VARCHAR(64),
    assigned_agent_type VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'medium',
    requires_human BOOLEAN DEFAULT FALSE,
    deadline_at TIMESTAMP WITH TIME ZONE,
    trace_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Interventions table
CREATE TABLE IF NOT EXISTS interventions (
    id VARCHAR(64) PRIMARY KEY,
    room_id VARCHAR(64) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    task_id VARCHAR(64) REFERENCES tasks(id) ON DELETE SET NULL,
    intervention_type VARCHAR(50) NOT NULL,
    requested_by VARCHAR(64) NOT NULL,
    resolved_by VARCHAR(64),
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    reason TEXT,
    resume_policy VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    timeout_at TIMESTAMP WITH TIME ZONE
);

-- Events log (for audit and replay)
CREATE TABLE IF NOT EXISTS event_log (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    room_id VARCHAR(64),
    task_id VARCHAR(64),
    intervention_id VARCHAR(64),
    sender_id VARCHAR(64),
    sender_type VARCHAR(20),
    sender_name VARCHAR(255),
    trace_id VARCHAR(64),
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_room_id ON tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_interventions_room_id ON interventions(room_id);
CREATE INDEX IF NOT EXISTS idx_interventions_status ON interventions(status);
CREATE INDEX IF NOT EXISTS idx_event_log_room_id ON event_log(room_id);
CREATE INDEX IF NOT EXISTS idx_event_log_created_at ON event_log(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_rooms_updated_at ON rooms;
CREATE TRIGGER update_rooms_updated_at
    BEFORE UPDATE ON rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
