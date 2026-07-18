import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Quiz from './pages/Quiz';
import Results from './pages/Results';
import './App.css';

function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <div style={{ backgroundColor: '#000', color: '#fff', minHeight: '100vh', fontFamily: "'JetBrains Mono', monospace" }}>
          <div className="scanline-overlay" />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/lobby/:code" element={<Lobby />} />
            <Route path="/quiz/:code" element={<Quiz />} />
            <Route path="/results/:code" element={<Results />} />
          </Routes>
        </div>
      </BrowserRouter>
    </SocketProvider>
  );
}

export default App;
