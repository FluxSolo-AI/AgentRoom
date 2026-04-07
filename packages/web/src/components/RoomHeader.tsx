import { Room } from '@fluxroom/shared';

interface RoomHeaderProps {
  room: Room;
  connected: boolean;
}

function RoomHeader({ room, connected }: RoomHeaderProps) {
  const statusText = room.status === 'active' ? 'Active' : room.status;
  const roomTypeText = room.type.replace('_', ' ');

  return (
    <header className="room-header">
      <div>
        <h1>{room.name}</h1>
        <div className="room-meta">
          <span>{roomTypeText}</span>
          <span>•</span>
          <span>ID: {room.id}</span>
        </div>
      </div>
      
      <div className="status">
        <div className={`status-indicator ${connected ? 'connected' : ''}`} />
        <span>{connected ? 'Connected' : 'Disconnected'}</span>
        <span>•</span>
        <span>{statusText}</span>
      </div>
    </header>
  );
}

export default RoomHeader;
