import { useEffect } from 'react';
import { useRoomStore } from './store';
import RoomHeader from './components/RoomHeader';
import Timeline from './components/Timeline';
import TaskTree from './components/TaskTree';
import InterventionPanel from './components/InterventionPanel';
import MessageComposer from './components/MessageComposer';
import './styles.css';

function App() {
  const { currentRoom, connected, initDemoData } = useRoomStore();

  useEffect(() => {
    // Initialize demo data on mount
    initDemoData();
  }, [initDemoData]);

  if (!currentRoom) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <p>Loading AgentRoom...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <RoomHeader room={currentRoom} connected={connected} />
      
      <div className="main-content">
        <div className="left-panel">
          <Timeline />
        </div>
        
        <div className="center-panel">
          <TaskTree />
        </div>
        
        <div className="right-panel">
          <InterventionPanel />
        </div>
      </div>
      
      <MessageComposer />
    </div>
  );
}

export default App;
