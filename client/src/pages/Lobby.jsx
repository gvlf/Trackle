import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';

export default function Lobby() {
  const { code } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [hostId, setHostId] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [loading, setLoading] = useState(false);
  const [trackCount, setTrackCount] = useState(0);
  const [error, setError] = useState('');
  const [roundCount, setRoundCount] = useState(0);
  const [fuzzyMode, setFuzzyMode] = useState('optimal');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const nameInputRef = useRef(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('spotify_access_token');
    if (saved) setAccessToken(saved);
  }, []);

  useEffect(() => {
    function onMessage(e) {
      if (e.data?.access_token) {
        setAccessToken(e.data.access_token);
        sessionStorage.setItem('spotify_access_token', e.data.access_token);
      }
      if (e.data?.error) {
        setError('Spotify authorization failed: ' + e.data.error);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    function onRoomInfo({ code: roomCode, isHost: host, players: p, trackCount: tc }) {
      if (roomCode === code) {
        setIsHost(host);
        setPlayers(p);
        setHostId(p[0]?.id || null);
        if (tc !== undefined) setTrackCount(tc);
      }
    }

    function onPlayerJoined({ players: p }) { setPlayers(p); }
    function onPlayerLeft({ players: p }) {
      setPlayers(p);
      if (selectedPlaylist) setSelectedPlaylist(null);
    }
    function onHostChanged({ hostId: newHostId }) {
      setHostId(newHostId);
      setIsHost(newHostId === socket.id);
    }
    function onPlaylistSelected({ trackCount: count }) { setTrackCount(count); }
    function onGameStarted() { navigate(`/quiz/${code}`); }
    function onSocketError({ message }) {
      if (message === 'Room not found') {
        setError('Room not found. Returning to home...');
        setTimeout(() => navigate('/'), 2000);
      }
    }
    function onDisconnect() {
      setError('Disconnected from server. Returning to home...');
      setTimeout(() => navigate('/'), 2000);
    }

    socket.on('room-joined', onRoomInfo);
    socket.on('room-created', onRoomInfo);
    socket.on('room-info', onRoomInfo);
    socket.on('player-joined', onPlayerJoined);
    socket.on('player-left', onPlayerLeft);
    socket.on('host-changed', onHostChanged);
    socket.on('playlist-selected', onPlaylistSelected);
    socket.on('game-started', onGameStarted);
    socket.on('error', onSocketError);
    socket.on('disconnect', onDisconnect);

    socket.emit('get-room-info');

    return () => {
      socket.off('room-joined', onRoomInfo);
      socket.off('room-created', onRoomInfo);
      socket.off('room-info', onRoomInfo);
      socket.off('player-joined', onPlayerJoined);
      socket.off('player-left', onPlayerLeft);
      socket.off('host-changed', onHostChanged);
      socket.off('playlist-selected', onPlaylistSelected);
      socket.off('game-started', onGameStarted);
      socket.off('error', onSocketError);
      socket.off('disconnect', onDisconnect);
    };
  }, [code, navigate, socket, selectedPlaylist]);

  useEffect(() => {
    if (accessToken) fetchPlaylists();
  }, [accessToken]);

  const fetchPlaylists = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/playlists`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await resp.json();
      if (!Array.isArray(data)) {
        setError(data.error || 'Failed to load playlists');
        setPlaylists([]);
      } else {
        setPlaylists(data);
      }
    } catch (err) {
      setError('Failed to load playlists');
    }
    setLoading(false);
  };

  const handleSelectPlaylist = async (playlist) => {
    setSelectedPlaylist(playlist);
    setLoading(true);
    try {
      const resp = await fetch(`/api/playlists/${playlist.id}/tracks`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await resp.json();
      if (!resp.ok || !Array.isArray(data)) {
        setError(data.error || 'Failed to load tracks');
        setSelectedPlaylist(null);
      } else if (data.length === 0) {
        setError('No tracks with audio previews found for this playlist. Try a different playlist.');
        setSelectedPlaylist(null);
      } else {
        socket.emit('select-playlist', { tracks: data });
        if (!roundCount) setRoundCount(data.length);
      }
    } catch (err) {
      setError('Failed to load tracks');
      setSelectedPlaylist(null);
    }
    setLoading(false);
  };

  const handleStartGame = () => {
    socket.emit('start-game', { roundCount: roundCount || trackCount, fuzzyMode });
  };

  const handleSaveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed.length > 20) return;
    socket.emit('change-name', { playerName: trimmed });
    sessionStorage.setItem('player_name', trimmed);
    setEditingName(false);
  };

  const handleSpotifyLogin = () => {
    fetch(`/auth/login?popup=true`)
      .then((r) => r.json())
      .then(({ url }) => {
        const w = 500, h = 700;
        const left = (screen.width - w) / 2;
        const top = (screen.height - h) / 2;
        window.open(url, 'spotify-auth', `width=${w},height=${h},left=${left},top=${top}`);
      });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="max-w-2xl w-full space-y-5">
        <div className="text-center space-y-2">
          <h1 onClick={() => navigate('/')} className="text-3xl font-bold text-white glow-text cursor-pointer hover:text-[#1DB954] transition-colors">Trackle</h1>
          <div className="inline-flex items-center gap-3 border border-[#1DB954]/30 px-5 py-2 bg-[#0a0a0a]">
            <span className="text-gray-500 text-xs uppercase tracking-wider">room:</span>
            <span className="text-xl font-bold tracking-[0.3em] text-[#1DB954]">{code}</span>
          </div>
          <p className="text-gray-600 text-xs">{'>'} share this code with friends to join</p>
        </div>

        <div className="border border-[#1DB954]/20 bg-[#0a0a0a] p-5">
          <h2 className="text-[#1DB954] text-xs font-semibold mb-3 uppercase tracking-wider">{'>'} players ({players.length}/8)</h2>
          <div className="space-y-1">
            {players.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 px-3 py-2 ${p.id === socket.id ? 'border-l-2 border-[#1DB954] bg-[#1DB954]/5' : 'border-l-2 border-transparent'}`}>
                <span className="text-gray-600 text-xs">$</span>
                {p.id === socket.id ? (
                  <>
                    <div className="flex items-center flex-1 min-w-0">
                      {editingName ? (
                        <input
                          ref={nameInputRef}
                          type="text"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveName();
                            if (e.key === 'Escape') setEditingName(false);
                          }}
                          maxLength={20}
                          autoFocus
                          className="flex-1 bg-transparent text-[#1DB954] text-sm font-mono focus:outline-none min-w-0"
                        />
                      ) : (
                        <span className="text-[#1DB954] text-sm font-mono truncate">{p.name}</span>
                      )}
                      <button
                        onClick={() => {
                          if (editingName) {
                            handleSaveName();
                          } else {
                            setNameInput(p.name);
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
                    <span className="text-[10px] text-gray-600 uppercase shrink-0">(you)</span>
                  </>
                ) : (
                  <span className="text-sm text-gray-300">{p.name}</span>
                )}
                {hostId === p.id && (
                  <span className="text-[#1DB954] text-[10px] uppercase tracking-wider ml-auto font-bold shrink-0">
                    {'*'} host
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {isHost && (
          <div className="border border-[#1DB954]/20 bg-[#0a0a0a] p-5 space-y-4">
            <h2 className="text-[#1DB954] text-xs font-semibold uppercase tracking-wider">{'>'} playlist_selection</h2>

            {!accessToken ? (
              <button
                onClick={handleSpotifyLogin}
                className="w-full py-3 bg-[#1DB954] text-black font-semibold transition-all hover:bg-[#1ed760] flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                [ connect_spotify ]
              </button>
            ) : loading ? (
              <div className="text-center py-6">
                <p className="text-gray-500 text-sm animate-pulse">{'>'} loading...</p>
              </div>
            ) : selectedPlaylist ? (
              <div className="border border-[#1DB954]/30 p-3 bg-[#1DB954]/5">
                <p className="text-[#1DB954] text-sm font-semibold">{selectedPlaylist.name}</p>
                <p className="text-gray-500 text-xs">{trackCount} tracks loaded</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {playlists.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPlaylist(p)}
                    className="w-full flex items-center gap-3 px-3 py-2 border-l-2 border-transparent hover:border-[#1DB954] hover:bg-[#1DB954]/5 transition-all text-left"
                  >
                    {p.image ? (
                      <img src={p.image} alt="" className="w-10 h-10 object-cover" />
                    ) : (
                      <div className="w-10 h-10 bg-white/5 flex items-center justify-center">
                        <span className="text-gray-600 text-xs">mus</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-200 truncate">{p.name}</p>
                      <p className="text-xs text-gray-600">{p.trackCount} tracks / {p.owner}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {trackCount > 0 && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[#1DB954] text-xs mb-1 uppercase tracking-wider">{'>'} round_count</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={trackCount}
                      value={roundCount || ''}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        setRoundCount(isNaN(v) ? 0 : Math.min(v, trackCount));
                      }}
                      placeholder={`1-${trackCount}`}
                      className="w-32 px-3 py-2 bg-black border border-[#1DB954]/40 text-[#1DB954] placeholder-gray-700 focus:outline-none focus:border-[#1DB954] text-sm font-mono"
                    />
                    <span className="text-gray-600 text-xs">/ {trackCount} available</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[#1DB954] text-xs mb-1 uppercase tracking-wider">{'>'} fuzzy_match</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setFuzzyMode('optimal')}
                      className={`py-2 px-3 text-xs uppercase tracking-wider border transition-all ${
                        fuzzyMode === 'optimal'
                          ? 'border-[#1DB954] bg-[#1DB954]/10 text-[#1DB954]'
                          : 'border-gray-700 text-gray-500 hover:border-gray-500'
                      }`}
                    >
                      optimal
                    </button>
                    <button
                      onClick={() => setFuzzyMode('standard')}
                      className={`py-2 px-3 text-xs uppercase tracking-wider border transition-all ${
                        fuzzyMode === 'standard'
                          ? 'border-[#1DB954] bg-[#1DB954]/10 text-[#1DB954]'
                          : 'border-gray-700 text-gray-500 hover:border-gray-500'
                      }`}
                    >
                      standard
                    </button>
                  </div>
                  <p className="text-gray-700 text-[10px] mt-1">
                    {fuzzyMode === 'optimal' ? 'strict matching, typo-tolerant, strips articles & accents' : 'simpler matching, more forgiving overall'}
                  </p>
                </div>
                <button
                  onClick={handleStartGame}
                  className="w-full py-3 bg-[#1DB954] text-black font-semibold transition-all hover:bg-[#1ed760] uppercase tracking-wider text-sm"
                >
                  [ start_game ]
                </button>
              </div>
            )}
          </div>
        )}

        {!isHost && (
          <div className="border border-gray-700/50 bg-[#0a0a0a] p-6 text-center">
            <p className="text-gray-500 text-sm">{'>'} waiting for host to select playlist and start game<span className="animate-blink">_</span></p>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-xs font-mono">[!] {error}</p>
        )}
      </div>
    </div>
  );
}
