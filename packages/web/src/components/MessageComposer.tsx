import { useState } from 'react';
import { useRoomStore } from '../store';
import { v4 as uuidv4 } from 'uuid';

function MessageComposer() {
  const [message, setMessage] = useState('');
  const addMessage = useRoomStore((state) => state.addMessage);
  const currentRoom = useRoomStore((state) => state.currentRoom);

  const handleSend = () => {
    if (!message.trim() || !currentRoom) return;

    addMessage({
      id: `msg_${uuidv4().slice(0, 12)}`,
      roomId: currentRoom.id,
      senderId: 'user_demo',
      senderType: 'human',
      senderName: 'Demo User',
      messageType: 'text',
      content: message.trim(),
      traceId: `trace_${Date.now()}`,
      createdAt: new Date().toISOString(),
    });

    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="message-composer">
      <div className="composer-input">
        <input
          type="text"
          placeholder="Type a message or command..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="composer-btn" onClick={handleSend}>
          Send
        </button>
      </div>
      
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginTop: '8px',
        fontSize: '11px',
        color: '#666'
      }}>
        <span>💡 Tip:</span>
        <span>Press Enter to send • @agent to mention • /help for commands</span>
      </div>
    </div>
  );
}

export default MessageComposer;
