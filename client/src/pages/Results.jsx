import { useLocation, useParams, useNavigate } from 'react-router-dom';

export default function Results() {
  const { code } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();

  const players = state?.players || [];

  const handlePlayAgain = () => {
    navigate(`/lobby/${code}`);
  };

  const handleGoHome = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center space-y-2">
          <p className="text-[#1DB954] text-xs tracking-[0.3em] uppercase">{'>'} game_complete</p>
          <h1 className="text-4xl font-bold text-white glow-text">Final Standings</h1>
        </div>

        <div className="border border-[#1DB954]/20 bg-[#0a0a0a] p-4 space-y-1">
          {players.map((player, i) => (
            <div
              key={player.id}
              className={`flex items-center gap-4 px-4 py-3 ${
                i === 0 ? 'border border-[#1DB954]/40 bg-[#1DB954]/5' : 'border-l-2 border-transparent'
              }`}
            >
              <div className={`w-8 h-8 flex items-center justify-center text-xs font-bold ${
                i === 0 ? 'bg-[#1DB954] text-black' : i === 1 ? 'bg-gray-600 text-white' : i === 2 ? 'bg-amber-800 text-white' : 'bg-white/5 text-gray-500'
              }`}>
                {player.rank}
              </div>
              <div className="flex-1">
                <p className={`font-semibold ${i === 0 ? 'text-[#1DB954]' : 'text-gray-200'}`}>{player.name}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-white">{player.score}</p>
                <p className="text-[10px] text-gray-600 uppercase">pts</p>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <button
            onClick={handlePlayAgain}
            className="w-full py-3 bg-[#1DB954] text-black font-semibold transition-all hover:bg-[#1ed760] uppercase tracking-wider text-sm"
          >
            [ play_again ]
          </button>
          <button
            onClick={handleGoHome}
            className="w-full py-3 border border-gray-700 text-gray-400 hover:border-[#1DB954] hover:text-[#1DB954] font-semibold uppercase tracking-wider text-sm transition-all"
          >
            [ home ]
          </button>
        </div>
      </div>
    </div>
  );
}
