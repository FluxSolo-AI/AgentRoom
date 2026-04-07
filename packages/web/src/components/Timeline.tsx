import { useRoomStore } from '../store';
import { RoomMessage } from '@fluxroom/shared';

function Timeline() {
  const messages = useRoomStore((state) => state.messages);

  const getMessageIcon = (message: RoomMessage) => {
    if (message.senderType === 'system') return '⚙️';
    if (message.senderType === 'agent') {
      if (message.messageType === 'event') return '📋';
      return '🤖';
    }
    return '👤';
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  const getMessageClass = (message: RoomMessage) => {
    const classes = ['message'];
    
    if (message.senderType === 'system') classes.push('system');
    else if (message.senderType === 'agent') classes.push('agent');
    else if (message.senderType === 'human') classes.push('human');
    
    if (message.messageType === 'event') classes.push('event');
    
    return classes.join(' ');
  };

  return (
    <div className="timeline">
      <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '16px' }}>
        📜 Timeline
      </h2>
      
      {messages.map((message) => (
        <div key={message.id} className={getMessageClass(message)}>
          <div className="message-avatar" style={{ 
            background: message.senderType === 'agent' 
              ? 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)'
              : message.senderType === 'human'
              ? 'linear-gradient(135deg, #f472b6 0%, #ec4899 100%)'
              : 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)'
          }}>
            {getMessageIcon(message)}
          </div>
          
          <div className="message-content">
            <div className="message-header">
              <span className="message-sender">{message.senderName}</span>
              <span className="message-time">{formatTime(message.createdAt)}</span>
            </div>
            
            <p className="message-body">
              {message.content}
            </p>
            
            {message.messageType !== 'text' && (
              <span className="message-type-badge">
                {message.messageType}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default Timeline;
