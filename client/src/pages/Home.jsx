import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';

export default function Home() {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState(null);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const socket = useSocket();
  const navigate = useNavigate();
  const pendingAction = useRef(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('player_name');
    if (saved) {
      setPlayerName(saved);
      setEditingName(false);
    } else {
      setEditingName(true);
    }
  }, []);

  useEffect(() => {
    function onConnect() {
      if (pendingAction.current) {
        pendingAction.current();
        pendingAction.current = null;
      }
    }

    function onRoomCreated({ code }) {
      setConnecting(false);
      sessionStorage.setItem('room_code', code);
      navigate(`/lobby/${code}`);
    }

    function onRoomJoined({ code }) {
      setConnecting(false);
      sessionStorage.setItem('room_code', code);
      navigate(`/lobby/${code}`);
    }

    function onError({ message }) {
      setConnecting(false);
      setError(message);
    }

    socket.on('connect', onConnect);
    socket.on('room-created', onRoomCreated);
    socket.on('room-joined', onRoomJoined);
    socket.on('error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('room-created', onRoomCreated);
      socket.off('room-joined', onRoomJoined);
      socket.off('error', onError);
    };
  }, [navigate, socket]);

  const handleCreateRoom = () => {
    if (!playerName.trim()) return setError('Enter your name');
    setError('');
    setConnecting(true);
    sessionStorage.setItem('player_name', playerName.trim());

    if (socket.connected) {
      socket.emit('create-room', { playerName: playerName.trim() });
    } else {
      pendingAction.current = () => {
        socket.emit('create-room', { playerName: playerName.trim() });
      };
      socket.connect();
    }
  };

  const handleJoinRoom = () => {
    if (!playerName.trim()) return setError('Enter your name');
    if (!roomCode.trim()) return setError('Enter a room code');
    setError('');
    setConnecting(true);
    sessionStorage.setItem('player_name', playerName.trim());
    sessionStorage.setItem('room_code', roomCode.trim().toUpperCase());

    const join = () => {
      socket.emit('join-room', { code: roomCode.trim().toUpperCase(), playerName: playerName.trim() });
    };

    if (socket.connected) {
      join();
    } else {
      pendingAction.current = join;
      socket.connect();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-lg w-full space-y-8">
        <div className="text-center space-y-2">
          <p className="text-[#1DB954] text-xs tracking-[0.3em] uppercase">{'>'} music_quiz v1.0</p>
          <h1 className="text-5xl font-bold text-white glow-text">Trackle</h1>
          <p className="text-gray-500 text-sm">{'>'} Import Spotify playlists. Guess the songs. Compete with friends.</p>
        </div>

        <div className="border border-[#1DB954]/30 bg-[#0a0a0a] p-6 space-y-5">
          <div>
            <label className="block text-[#1DB954] text-xs mb-2 uppercase tracking-wider">{'>'} player_name</label>
            <div className={`flex items-center px-4 py-3 border border-[#1DB954]/40 ${editingName ? 'bg-black' : 'bg-[#0a0a0a]'}`}>
              {editingName ? (
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => { setPlayerName(e.target.value); setError(''); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (!playerName.trim()) return setError('Enter your name');
                      sessionStorage.setItem('player_name', playerName.trim());
                      setEditingName(false);
                    }
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  placeholder="enter_name..."
                  maxLength={20}
                  autoFocus
                  className="flex-1 bg-transparent text-[#1DB954] placeholder-gray-700 focus:outline-none text-sm"
                />
              ) : (
                <span className="text-[#1DB954] text-sm font-mono flex-1">{playerName}</span>
              )}
              <button
                onClick={() => {
                  if (editingName) {
                    if (!playerName.trim()) return setError('Enter your name');
                    sessionStorage.setItem('player_name', playerName.trim());
                    setEditingName(false);
                  } else {
                    setEditingName(true);
                  }
                }}
                className="ml-2 text-gray-600 hover:text-[#1DB954] transition-colors shrink-0"
                title={editingName ? 'Save name' : 'Edit name'}
              >
                {editingName ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {!mode && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode('create')}
                className="py-3 border border-[#1DB954] text-[#1DB954] hover:bg-[#1DB954] hover:text-black font-semibold text-sm transition-all uppercase tracking-wider"
              >
                [ create ]
              </button>
              <button
                onClick={() => setMode('join')}
                className="py-3 border border-gray-600 text-gray-400 hover:border-[#1DB954] hover:text-[#1DB954] font-semibold text-sm transition-all uppercase tracking-wider"
              >
                [ join ]
              </button>
            </div>
          )}

          {mode === 'join' && (
            <div className="space-y-4">
              <div>
                <label className="block text-[#1DB954] text-xs mb-2 uppercase tracking-wider">{'>'} room_code</label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => { setRoomCode(e.target.value.toUpperCase()); setError(''); }}
                  placeholder="XXXXXX"
                  maxLength={6}
                  className="w-full px-4 py-3 bg-black border border-[#1DB954]/40 text-[#1DB954] placeholder-gray-700 focus:outline-none focus:border-[#1DB954] transition-colors text-center text-2xl tracking-[0.4em] uppercase font-mono"
                />
              </div>
              <button
                onClick={handleJoinRoom}
                disabled={connecting}
                className="w-full py-3 bg-[#1DB954] text-black font-semibold transition-all hover:bg-[#1ed760] disabled:opacity-50 uppercase tracking-wider text-sm"
              >
                {connecting ? '[ connecting... ]' : '[ join_room ]'}
              </button>
              <button
                onClick={() => { setMode(null); setRoomCode(''); setError(''); }}
                className="w-full py-2 text-gray-500 hover:text-white transition-colors text-xs uppercase tracking-wider"
              >
                {'<'} back
              </button>
            </div>
          )}

          {mode === 'create' && (
            <div className="space-y-4">
              <button
                onClick={handleCreateRoom}
                disabled={connecting}
                className="w-full py-3 bg-[#1DB954] text-black font-semibold transition-all hover:bg-[#1ed760] disabled:opacity-50 uppercase tracking-wider text-sm"
              >
                {connecting ? '[ connecting... ]' : '[ create_room ]'}
              </button>
              <button
                onClick={() => { setMode(null); setError(''); }}
                className="w-full py-2 text-gray-500 hover:text-white transition-colors text-xs uppercase tracking-wider"
              >
                {'<'} back
              </button>
            </div>
          )}

          {error && (
            <p className="text-red-400 text-xs font-mono">[!] {error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
