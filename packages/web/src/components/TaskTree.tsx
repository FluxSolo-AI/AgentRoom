import { useRoomStore } from '../store';
import { Task } from '@fluxroom/shared';

function TaskTree() {
  const tasks = useRoomStore((state) => state.tasks);

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'assigned': return '📌';
      case 'in_progress': return '🔄';
      case 'blocked': return '🚫';
      case 'waiting_human': return '👤';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '📋';
    }
  };

  const getPriorityClass = (priority: Task['priority']) => {
    return priority;
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ');
  };

  // Group tasks by parent
  const rootTasks = tasks.filter(t => !t.parentTaskId);
  const subTasks = tasks.filter(t => t.parentTaskId);

  return (
    <div className="task-tree">
      <h2>
        📊 Tasks
        <span style={{ fontSize: '12px', color: '#888', fontWeight: 400 }}>
          ({tasks.length})
        </span>
      </h2>
      
      <div className="task-list">
        {rootTasks.map((task) => (
          <div key={task.id}>
            <TaskItem task={task} />
            
            {/* Render subtasks */}
            {subTasks
              .filter(st => st.parentTaskId === task.id)
              .map(subTask => (
                <div key={subTask.id} style={{ marginLeft: '16px', marginTop: '8px' }}>
                  <TaskItem task={subTask} isSubtask />
                </div>
              ))
            }
          </div>
        ))}
      </div>
    </div>
  );
}

interface TaskItemProps {
  task: Task;
  isSubtask?: boolean;
}

function TaskItem({ task, isSubtask }: TaskItemProps) {
  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'assigned': return '📌';
      case 'in_progress': return '🔄';
      case 'blocked': return '🚫';
      case 'waiting_human': return '👤';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '📋';
    }
  };

  return (
    <div className={`task-item ${task.priority} ${task.status}`}>
      <div className="task-header">
        <span className="task-title">
          {getStatusIcon(task.status)} {isSubtask ? '└ ' : ''}{task.title}
        </span>
        <span className="task-status">{formatStatus(task.status)}</span>
      </div>
      
      <div className="task-meta">
        {task.assignedTo && (
          <span className="task-assignee">
            @{task.assignedTo}
          </span>
        )}
        <span style={{ color: task.priority === 'critical' ? '#ef4444' : 
                          task.priority === 'high' ? '#f59e0b' : '#666' }}>
          {task.priority}
        </span>
        {task.requiresHuman && (
          <span style={{ color: '#a78bfa' }}>👤 requires human</span>
        )}
      </div>
    </div>
  );
}

const formatStatus = (status: string) => {
  return status.replace(/_/g, ' ');
};

export default TaskTree;
