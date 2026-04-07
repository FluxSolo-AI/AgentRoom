import { useRoomStore } from '../store';
import { Intervention } from '@fluxroom/shared';

function InterventionPanel() {
  const interventions = useRoomStore((state) => state.interventions);
  const resolveIntervention = useRoomStore((state) => state.resolveIntervention);
  const tasks = useRoomStore((state) => state.tasks);

  const getTaskTitle = (taskId?: string) => {
    if (!taskId) return null;
    const task = tasks.find(t => t.id === taskId);
    return task?.title;
  };

  const getInterventionIcon = (type: Intervention['interventionType']) => {
    switch (type) {
      case 'approve': return '✅';
      case 'reject': return '❌';
      case 'takeover': return '👤';
      case 'comment': return '💬';
      case 'nudge': return '👆';
      case 'resume': return '▶️';
      case 'pause_room': return '⏸️';
      case 'kill_task': return '🛑';
      default: return '⚠️';
    }
  };

  const formatInterventionType = (type: string) => {
    return type.replace(/_/g, ' ');
  };

  const handleApprove = (interventionId: string) => {
    console.log('Approving intervention:', interventionId);
    resolveIntervention(interventionId);
  };

  const handleReject = (interventionId: string) => {
    console.log('Rejecting intervention:', interventionId);
    resolveIntervention(interventionId);
  };

  const handleTakeover = (interventionId: string) => {
    console.log('Taking over intervention:', interventionId);
    resolveIntervention(interventionId);
  };

  return (
    <div className="intervention-panel">
      <h2>
        🛠️ Interventions
        {interventions.length > 0 && (
          <span className="badge">{interventions.length}</span>
        )}
      </h2>
      
      {interventions.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '32px 16px',
          color: '#666',
          fontSize: '13px'
        }}>
          <p style={{ fontSize: '32px', marginBottom: '8px' }}>🎉</p>
          <p>No pending interventions</p>
          <p style={{ fontSize: '11px', marginTop: '4px' }}>
            System is running smoothly
          </p>
        </div>
      ) : (
        interventions.map((intervention) => (
          <div key={intervention.id} className="intervention-card">
            <div className="intervention-header">
              <span className="intervention-type">
                {getInterventionIcon(intervention.interventionType)}{' '}
                {formatInterventionType(intervention.interventionType)}
              </span>
            </div>
            
            {intervention.taskId && (
              <div style={{ 
                fontSize: '11px', 
                color: '#60a5fa', 
                marginBottom: '8px',
                background: '#1a1a2e',
                padding: '4px 8px',
                borderRadius: '4px'
              }}>
                📋 {getTaskTitle(intervention.taskId)}
              </div>
            )}
            
            <p className="intervention-reason">
              {intervention.reason || 'No reason provided'}
            </p>
            
            <div className="intervention-actions">
              {intervention.interventionType === 'approve' && (
                <>
                  <button 
                    className="btn btn-approve"
                    onClick={() => handleApprove(intervention.id)}
                  >
                    ✅ Approve
                  </button>
                  <button 
                    className="btn btn-reject"
                    onClick={() => handleReject(intervention.id)}
                  >
                    ❌ Reject
                  </button>
                </>
              )}
              
              {intervention.interventionType === 'takeover' && (
                <button 
                  className="btn btn-takeover"
                  onClick={() => handleTakeover(intervention.id)}
                >
                  👤 Take Over
                </button>
              )}
              
              {!['approve', 'takeover'].includes(intervention.interventionType) && (
                <button 
                  className="btn btn-approve"
                  onClick={() => handleApprove(intervention.id)}
                >
                  Resolve
                </button>
              )}
            </div>
            
            {intervention.timeoutAt && (
              <div style={{ 
                fontSize: '10px', 
                color: '#666', 
                marginTop: '8px',
                textAlign: 'center'
              }}>
                ⏱️ Auto-timeout: {new Date(intervention.timeoutAt).toLocaleTimeString()}
              </div>
            )}
          </div>
        ))
      )}
      
      <div style={{ 
        marginTop: '24px',
        padding: '16px',
        background: '#1a1a2e',
        borderRadius: '8px',
        fontSize: '11px',
        color: '#666'
      }}>
        <h4 style={{ color: '#888', marginBottom: '8px' }}>💡 About Interventions</h4>
        <p>
          Interventions pause agent execution for human review. 
          You can approve, reject, or take over the task.
        </p>
      </div>
    </div>
  );
}

export default InterventionPanel;
