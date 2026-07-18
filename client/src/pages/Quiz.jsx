import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';

export default function Quiz() {
  const { code } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();
  const audioRef = useRef(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  const [gameState, setGameState] = useState('waiting');
  const [countdown, setCountdown] = useState(3);
  const [round, setRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [guess, setGuess] = useState('');
  const [artistGuessed, setArtistGuessed] = useState(false);
  const [songGuessed, setSongGuessed] = useState(false);
  const [artistName, setArtistName] = useState('');
  const [songName, setSongName] = useState('');
  const [players, setPlayers] = useState([]);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [roundResult, setRoundResult] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const roundStartTime = useRef(null);
  const maxTime = 30;

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    function onNewRound({ round: r, totalRounds: t, previewUrl, duration }) {
      setRound(r);
      setTotalRounds(t);
      setGuess('');
      setArtistGuessed(false);
      setSongGuessed(false);
      setArtistName('');
      setSongName('');
      setAnsweredCount(0);
      setRoundResult(null);

      if (audioRef.current) {
        audioRef.current.src = previewUrl;
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 0.5;
      }

      setGameState('countdown');
      setCountdown(3);

      let cd = 3;
      countdownRef.current = setInterval(() => {
        cd--;
        if (cd <= 0) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
          setGameState('playing');
          if (audioRef.current) {
            audioRef.current.play().catch(() => {});
          }
          roundStartTime.current = Date.now();
          const dur = Math.min(duration, maxTime);
          setTimeLeft(dur);

          let time = dur;
          timerRef.current = setInterval(() => {
            time -= 1;
            setTimeLeft(time);
            if (time <= 0) {
              clearInterval(timerRef.current);
              timerRef.current = null;
              socket.emit('round-timeout');
            }
          }, 1000);
        } else {
          setCountdown(cd);
        }
      }, 1000);
    }

    function onPlayerAnswered({ answeredCount: count }) {
      setAnsweredCount(count);
    }

    function onAnswerResult({ matched, matchedText, artistDone, songDone }) {
      if (matched === 'artist' && matchedText) setArtistName(matchedText);
      if (matched === 'song' && matchedText) setSongName(matchedText);
      if (artistDone) setArtistGuessed(true);
      if (songDone) setSongGuessed(true);
      if (artistDone && songDone) setGuess('');
    }

    function onRoundResult(data) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setGameState('results');
      setRoundResult(data);
      setPlayers(data.players);
      setLeaderboard(data.players);
    }

    function onGameOver({ players: p }) {
      navigate(`/results/${code}`, { state: { players: p } });
    }

    function onSocketError({ message }) {
      if (message === 'Room not found' || message === 'Game already in progress') {
        navigate('/');
      }
    }
    function onDisconnect() {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (audioRef.current) audioRef.current.pause();
      navigate('/');
    }

    socket.on('new-round', onNewRound);
    socket.on('player-answered', onPlayerAnswered);
    socket.on('answer-result', onAnswerResult);
    socket.on('round-result', onRoundResult);
    socket.on('game-over', onGameOver);
    socket.on('error', onSocketError);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('new-round', onNewRound);
      socket.off('player-answered', onPlayerAnswered);
      socket.off('answer-result', onAnswerResult);
      socket.off('round-result', onRoundResult);
      socket.off('game-over', onGameOver);
      socket.off('error', onSocketError);
      socket.off('disconnect', onDisconnect);
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, [code, navigate, socket]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!guess.trim() || gameState !== 'playing') return;
    if (artistGuessed && songGuessed) return;
    if (timeLeft <= 0) return;

    const timeElapsed = (Date.now() - roundStartTime.current) / 1000;
    socket.emit('submit-answer', { answer: guess.trim(), timeElapsed });
    setGuess('');
  };

  const handleSkip = () => {
    if (gameState !== 'playing') return;
    if (artistGuessed && songGuessed) return;
    if (timeLeft <= 0) return;
    socket.emit('skip-answer');
    setArtistGuessed(true);
    setSongGuessed(true);
    setGuess('');
  };

  const bothGuessed = artistGuessed && songGuessed;
  const timerExpired = timeLeft <= 0 && gameState === 'playing';
  const inputDisabled = bothGuessed || timerExpired;
  const timerPercentage = (timeLeft / maxTime) * 100;
  const timerColor = timeLeft > 15 ? '#1DB954' : timeLeft > 5 ? '#eab308' : '#ef4444';

  const sortedLeaderboard = [...leaderboard].sort((a, b) => b.score - a.score);

  return (
    <div className="min-h-screen flex flex-col">
      <audio ref={audioRef} />

      <header className="px-4 py-3 border-b border-[#1DB954]/20 bg-[#0a0a0a]">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <h1 onClick={() => navigate('/')} className="text-lg font-bold text-[#1DB954] glow-text cursor-pointer hover:text-[#1ed760] transition-colors">Trackle</h1>
          {round > 0 && (
            <div className="text-xs text-gray-500 uppercase tracking-wider">
              round {round}/{totalRounds}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
        {gameState === 'waiting' && (
          <div className="text-center space-y-2">
            <p className="text-gray-500 text-sm">{'>'} connecting...<span className="animate-blink">_</span></p>
          </div>
        )}

        {gameState === 'countdown' && (
          <div className="text-center space-y-3">
            <div className="text-8xl font-bold text-[#1DB954] glow-text">{countdown}</div>
            <p className="text-gray-500 text-sm uppercase tracking-wider">{'>'} get ready...</p>
          </div>
        )}

        {gameState === 'playing' && (
          <div className="w-full max-w-3xl space-y-5 flex flex-col lg:flex-row gap-6">
            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[#1DB954] text-sm">time:</span>
                  <span className="text-3xl font-bold" style={{ color: timerColor }}>{timeLeft}s</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 overflow-hidden">
                  <div
                    className="h-full transition-all duration-1000"
                    style={{ width: `${timerPercentage}%`, backgroundColor: timerColor }}
                  />
                </div>
              </div>

              <div className="text-xs text-gray-600 uppercase tracking-wider">
                {'>'} {answeredCount}/{players.length} players answered
              </div>

              {(artistGuessed || songGuessed) && (
                <div className="flex flex-wrap gap-2">
                  {artistGuessed && (
                    <span className="px-3 py-1 bg-[#1DB954]/20 border border-[#1DB954]/50 text-[#1DB954] text-xs">
                      artist: {artistName || '?'}
                    </span>
                  )}
                  {songGuessed && (
                    <span className="px-3 py-1 bg-[#1DB954]/20 border border-[#1DB954]/50 text-[#1DB954] text-xs">
                      song: {songName || '?'}
                    </span>
                  )}
                </div>
              )}

              {!inputDisabled ? (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[#1DB954] text-xs mb-1 uppercase tracking-wider">
                      {'>'} {artistGuessed ? 'song_name' : songGuessed ? 'artist_name' : 'enter_artist_or_song'}
                    </label>
                    <input
                      ref={inputRef}
                      type="text"
                      value={guess}
                      onChange={(e) => setGuess(e.target.value)}
                      placeholder={artistGuessed ? 'type song name...' : songGuessed ? 'type artist name...' : 'type artist or song name...'}
                      className="w-full px-4 py-3 bg-black border border-[#1DB954]/40 text-[#1DB954] placeholder-gray-700 focus:outline-none focus:border-[#1DB954] transition-colors text-sm"
                      autoFocus
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={!guess.trim()}
                      className="flex-1 py-2.5 bg-[#1DB954] text-black font-semibold transition-all hover:bg-[#1ed760] disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-wider text-sm"
                    >
                      [ submit ]
                    </button>
                    <button
                      type="button"
                      onClick={handleSkip}
                      className="px-6 py-2.5 border border-gray-600 text-gray-400 font-semibold transition-all hover:border-red-500 hover:text-red-400 uppercase tracking-wider text-sm"
                    >
                      [ skip ]
                    </button>
                  </div>
                </form>
              ) : (
                <div className="border border-[#1DB954]/30 p-3 bg-[#1DB954]/5 text-center">
                  <p className="text-[#1DB954] text-sm">
                    {timerExpired ? 'time expired!' : 'both locked! waiting for other players...'}
                  </p>
                </div>
              )}
            </div>

            <div className="lg:w-56 border border-[#1DB954]/20 bg-[#0a0a0a] p-3">
              <h3 className="text-[#1DB954] text-[10px] uppercase tracking-wider mb-2 font-semibold">{'>'} leaderboard</h3>
              <div className="space-y-1">
                {sortedLeaderboard.map((p, i) => (
                  <div key={p.id || i} className={`flex items-center justify-between text-xs py-1 ${p.id === socket.id ? 'text-[#1DB954]' : 'text-gray-400'}`}>
                    <span className="truncate">{i + 1}. {p.name}</span>
                    <span className="ml-2 tabular-nums">{p.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {gameState === 'results' && roundResult && (
          <div className="w-full max-w-2xl space-y-5">
            <div className="text-center space-y-2">
              <h2 className="text-xs text-gray-500 uppercase tracking-wider">round {round} result</h2>
              {roundResult.albumArt && (
                <img
                  src={roundResult.albumArt}
                  alt="Album Art"
                  className="w-36 h-36 mx-auto border border-[#1DB954]/30"
                />
              )}
              <div className="space-y-1">
                <p className="text-xl font-bold text-[#1DB954]">{roundResult.correctArtist}</p>
                <p className="text-lg text-gray-300">{roundResult.correctSong}</p>
              </div>
            </div>

            <div className="border border-[#1DB954]/20 bg-[#0a0a0a] p-4 space-y-1">
              {roundResult.results.map((r) => (
                <div
                  key={r.playerId}
                  className={`flex items-center justify-between px-3 py-1.5 text-sm ${r.playerId === socket.id ? 'text-[#1DB954] border-l-2 border-[#1DB954]' : 'text-gray-400 border-l-2 border-transparent'}`}
                >
                  <div className="flex items-center gap-2">
                    <span>{r.playerName}</span>
                    {r.artistCorrect && <span className="text-[10px] text-[#1DB954] bg-[#1DB954]/10 px-1">ART</span>}
                    {r.songCorrect && <span className="text-[10px] text-[#1DB954] bg-[#1DB954]/10 px-1">SNG</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">+{r.roundScore}</span>
                    <span className="text-gray-600 text-xs">({r.totalScore})</span>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-center text-gray-600 text-xs uppercase tracking-wider animate-pulse">{'>'} next round starting...<span className="animate-blink">_</span></p>
          </div>
        )}
      </div>
    </div>
  );
}
