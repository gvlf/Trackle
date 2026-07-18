import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import crypto from 'crypto';
import { SpotifyService } from './spotify.js';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

const rooms = new Map();
const spotify = new SpotifyService();

function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function normalizeAnswer(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function calculateScore(timeElapsed, maxPoints = 300) {
  const decayRate = maxPoints / 30;
  const score = Math.max(0, Math.round(maxPoints - decayRate * timeElapsed));
  return score;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function leaveCurrentRoom(socket) {
  const { roomCode } = socket.data || {};
  if (!roomCode) return;
  const room = rooms.get(roomCode);
  if (!room) return;

  socket.leave(roomCode);
  room.players = room.players.filter(p => p.id !== socket.id);

  if (room.players.length === 0) {
    if (room.roundTimer) clearTimeout(room.roundTimer);
    rooms.delete(roomCode);
    return;
  }

  if (room.host === socket.id) {
    room.host = room.players[0].id;
    io.to(roomCode).emit('host-changed', { hostId: room.host });
  }

  io.to(roomCode).emit('player-left', {
    playerId: socket.id,
    playerName: socket.data?.playerName,
    players: room.players,
  });

  if (room.state === 'playing' && room.guesses.has(socket.id)) {
    room.guesses.delete(socket.id);
    if (room.guesses.size === room.players.length) {
      endRound(roomCode);
    }
  }
}

// --- Auth & API routes ---

app.get('/auth/login', (req, res) => {
  const isPopup = req.query.popup === 'true';
  const randomState = crypto.randomBytes(16).toString('hex');
  const state = isPopup ? `popup:${randomState}` : randomState;
  const scopes = 'playlist-read-private playlist-read-collaborative user-read-private';
  const authUrl = `https://accounts.spotify.com/authorize?` +
    `client_id=${process.env.SPOTIFY_CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(process.env.SPOTIFY_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&state=${state}` +
    `&show_dialog=true`;
  res.json({ url: authUrl, state });
});

app.get('/auth/callback', async (req, res) => {
  const { code, error, state } = req.query;
  const isPopup = state?.startsWith('popup:');

  if (error) {
    if (isPopup) {
      return res.send(`<script>window.opener.postMessage({error:"${error}"}, "*");window.close();</script>`);
    }
    return res.redirect(`${process.env.CLIENT_URL}?auth_error=${error}`);
  }
  try {
    const tokenData = await spotify.exchangeCode(code);
    if (isPopup) {
      const html = `<script>
        window.opener.postMessage({access_token:"${tokenData.access_token}",refresh_token:"${tokenData.refresh_token}"}, "*");
        window.close();
      </script>`;
      return res.send(html);
    }
    res.redirect(`${process.env.CLIENT_URL}?access_token=${tokenData.access_token}&refresh_token=${tokenData.refresh_token}`);
  } catch (err) {
    console.error('Auth callback error:', err.message);
    if (isPopup) {
      return res.send(`<script>window.opener.postMessage({error:"token_exchange_failed"}, "*");window.close();</script>`);
    }
    res.redirect(`${process.env.CLIENT_URL}?auth_error=token_exchange_failed`);
  }
});

app.get('/api/playlists', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No access token provided' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const playlists = await spotify.getUserPlaylists(token);
    res.json(playlists);
  } catch (err) {
    console.error('Fetch playlists error:', err.message);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

app.get('/api/playlists/:id/tracks', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No access token provided' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const tracks = await spotify.getPlaylistTracks(token, req.params.id);
    if (tracks.length === 0) {
      return res.status(422).json({ error: 'No tracks with audio previews found. This playlist may contain tracks not available on any preview service.' });
    }
    res.json(tracks);
  } catch (err) {
    console.error('Fetch tracks error:', err.message);
    if (err.message.includes('403')) {
      return res.status(403).json({ error: 'Access denied. This may not be your playlist, or Spotify has restricted access to it.' });
    }
    res.status(500).json({ error: 'Failed to fetch playlist tracks' });
  }
});

// --- Socket handlers ---

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('create-room', ({ playerName }) => {
    leaveCurrentRoom(socket);
    const code = generateRoomCode();
    const room = {
      code,
      host: socket.id,
      players: [{ id: socket.id, name: playerName, score: 0, answered: false }],
      tracks: [],
      currentRound: 0,
      totalRounds: 0,
      state: 'lobby',
      roundStartTime: null,
      guesses: new Map(),
      roundTimer: null,
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data = { roomCode: code, playerName };
    socket.emit('room-created', { code, isHost: true, players: room.players });
    console.log(`Room ${code} created by ${playerName}`);
  });

  socket.on('join-room', ({ code, playerName }) => {
    const room = rooms.get(code);
    if (!room) {
      return socket.emit('error', { message: 'Room not found' });
    }
    if (room.state !== 'lobby') {
      return socket.emit('error', { message: 'Game already in progress' });
    }
    if (room.players.length >= 8) {
      return socket.emit('error', { message: 'Room is full (max 8 players)' });
    }
    if (room.players.some(p => p.name === playerName)) {
      return socket.emit('error', { message: 'Name already taken' });
    }
    leaveCurrentRoom(socket);
    room.players.push({ id: socket.id, name: playerName, score: 0, answered: false });
    socket.join(code);
    socket.data = { roomCode: code, playerName };
    io.to(code).emit('player-joined', { players: room.players });
    socket.emit('room-joined', { code, isHost: false, players: room.players });
    console.log(`${playerName} joined room ${code}`);
  });

  socket.on('rejoin-room', ({ code, playerName }) => {
    const room = rooms.get(code);
    if (!room) return socket.emit('error', { message: 'Room not found' });
    if (room.state !== 'lobby') return socket.emit('error', { message: 'Game already in progress' });

    const existing = room.players.find(p => p.name === playerName);
    if (existing) {
      existing.id = socket.id;
    } else {
      if (room.players.length >= 8) return socket.emit('error', { message: 'Room is full' });
      room.players.push({ id: socket.id, name: playerName, score: 0, answered: false });
    }
    socket.join(code);
    socket.data = { roomCode: code, playerName };

    io.to(code).emit('player-joined', { players: room.players });
    socket.emit('room-info', {
      code,
      isHost: room.host === socket.id,
      players: room.players,
      trackCount: room.tracks.length,
    });
    console.log(`${playerName} rejoined room ${code}`);
  });

  socket.on('change-name', ({ playerName }) => {
    const { roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room || room.state !== 'lobby') return;
    if (!playerName || !playerName.trim()) return;
    const trimmed = playerName.trim();
    if (trimmed.length > 20) return;
    if (room.players.some(p => p.name === trimmed && p.id !== socket.id)) {
      return socket.emit('error', { message: 'Name already taken' });
    }
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    player.name = trimmed;
    socket.data.playerName = trimmed;
    io.to(roomCode).emit('player-joined', { players: room.players });
    socket.emit('room-info', {
      code: roomCode,
      isHost: room.host === socket.id,
      players: room.players,
      trackCount: room.tracks.length,
    });
  });

  socket.on('get-room-info', () => {
    const { roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room) return socket.emit('error', { message: 'Room not found' });
    socket.emit('room-info', {
      code: roomCode,
      isHost: room.host === socket.id,
      players: room.players,
      trackCount: room.tracks.length,
    });
  });

  socket.on('select-playlist', ({ tracks }) => {
    const { roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room || room.host !== socket.id) return;
    if (!Array.isArray(tracks) || tracks.length === 0) return;
    room.tracks = tracks;
    io.to(roomCode).emit('playlist-selected', {
      trackCount: tracks.length,
      tracks: tracks.map(t => ({ name: t.name, artist: t.artist, albumArt: t.albumArt })),
    });
  });

  socket.on('start-game', ({ roundCount, fuzzyMode } = {}) => {
    const { roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room || room.host !== socket.id) return;
    if (room.tracks.length === 0) return socket.emit('error', { message: 'No playlist selected' });

    room.tracks = shuffleArray(room.tracks);
    const count = Math.min(Number(roundCount) || room.tracks.length, room.tracks.length);
    room.tracks = room.tracks.slice(0, count);
    room.totalRounds = room.tracks.length;
    room.state = 'playing';
    room.currentRound = 0;
    room.fuzzyMode = fuzzyMode || 'optimal';
    room.players.forEach(p => { p.score = 0; p.answered = false; });
    io.to(roomCode).emit('game-started', { totalRounds: room.totalRounds });
    setTimeout(() => startRound(roomCode), 500);
  });

  socket.on('submit-answer', ({ answer, timeElapsed }) => {
    const { roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room || room.state !== 'playing') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.answered) return;

    const track = room.tracks[room.currentRound];
    const normalizedAnswer = normalizeAnswer(answer);
    const normalizedArtist = normalizeAnswer(track.artist);
    const normalizedSong = normalizeAnswer(track.name);
    const matchFn = room.fuzzyMode === 'optimal' ? fuzzyMatchOptimal : fuzzyMatch;

    if (!room.guesses.has(socket.id)) {
      room.guesses.set(socket.id, { artistDone: false, songDone: false, artistTime: 0, songTime: 0 });
    }
    const guessData = room.guesses.get(socket.id);

    let matched = null;

    if (!guessData.artistDone && matchFn(normalizedAnswer, normalizedArtist, 'artist')) {
      guessData.artistDone = true;
      guessData.artistTime = timeElapsed;
      matched = 'artist';
    } else if (!guessData.songDone && matchFn(normalizedAnswer, normalizedSong, 'song')) {
      guessData.songDone = true;
      guessData.songTime = timeElapsed;
      matched = 'song';
    }

    socket.emit('answer-result', {
      matched,
      matchedText: matched === 'artist' ? track.artist : matched === 'song' ? track.name : null,
      artistDone: guessData.artistDone,
      songDone: guessData.songDone,
    });

    if (guessData.artistDone && guessData.songDone) {
      player.answered = true;
    }

    io.to(roomCode).emit('player-answered', {
      playerId: socket.id,
      playerName: player.name,
      totalPlayers: room.players.length,
      answeredCount: room.players.filter(p => p.answered).length,
    });

    if (room.players.every(p => p.answered)) {
      endRound(roomCode);
    }
  });

  socket.on('round-timeout', () => {
    const { roomCode } = socket.data || {};
    if (roomCode) endRound(roomCode);
  });

  socket.on('skip-answer', () => {
    const { roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room || room.state !== 'playing') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.answered) return;

    player.answered = true;

    io.to(roomCode).emit('player-answered', {
      playerId: socket.id,
      playerName: player.name,
      totalPlayers: room.players.length,
      answeredCount: room.players.filter(p => p.answered).length,
    });

    if (room.players.every(p => p.answered)) {
      endRound(roomCode);
    }
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom(socket);
  });
});

function startRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.currentRound >= room.totalRounds) {
    endGame(roomCode);
    return;
  }

  const track = room.tracks[room.currentRound];
  room.guesses.clear();
  room.players.forEach(p => { p.answered = false; });
  room.state = 'playing';
  room.roundStartTime = Date.now();

  io.to(roomCode).emit('new-round', {
    round: room.currentRound + 1,
    totalRounds: room.totalRounds,
    previewUrl: track.previewUrl,
    duration: track.duration || 30,
  });

  room.roundTimer = setTimeout(() => {
    endRound(roomCode);
  }, (track.duration || 30) * 1000);
}

function endRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.state !== 'playing') return;

  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }

  const track = room.tracks[room.currentRound];
  const results = [];

  room.players.forEach(player => {
    const guessData = room.guesses.get(player.id);
    const artistCorrect = guessData?.artistDone || false;
    const songCorrect = guessData?.songDone || false;
    const artistTime = guessData?.artistTime || 30;
    const songTime = guessData?.songTime || 30;

    let roundScore = 0;
    if (artistCorrect) roundScore += calculateScore(artistTime);
    if (songCorrect) roundScore += calculateScore(songTime);

    player.score += roundScore;

    results.push({
      playerId: player.id,
      playerName: player.name,
      artistCorrect,
      songCorrect,
      roundScore,
      totalScore: player.score,
    });
  });

  room.currentRound++;
  room.state = 'results';

  io.to(roomCode).emit('round-result', {
    correctArtist: track.artist,
    correctSong: track.name,
    albumArt: track.albumArt,
    results,
    players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
    currentRound: room.currentRound,
    totalRounds: room.totalRounds,
  });

  setTimeout(() => {
    if (rooms.has(roomCode)) {
      startRound(roomCode);
    }
  }, 5000);
}

function fuzzyMatch(input, target, type) {
  if (!input || !target) return false;
  if (input === target) return true;
  if (input.length < 3) return false;

  if (target.includes(',') || /\b(?:feat|ft|&)\b/.test(target)) {
    const segments = splitArtists(target);
    const inputLower = input.toLowerCase();
    for (const seg of segments) {
      const segLower = seg.toLowerCase();
      if (inputLower === segLower) return true;
      const d = levenshteinDistance(inputLower, segLower);
      const maxLen = Math.max(inputLower.length, segLower.length);
      if (maxLen >= 3 && d <= Math.max(2, Math.floor(maxLen * 0.25))) return true;
    }
  }

  const distance = levenshteinDistance(input, target);
  const maxLen = Math.max(input.length, target.length);
  if (distance <= Math.max(2, Math.floor(maxLen * 0.25))) return true;

  const inputWords = input.split(/\s+/);
  const targetWords = target.split(/\s+/);
  if (targetWords.length >= 2 && inputWords.length >= 2) {
    const isArtist = type === 'artist';
    const maxWords = isArtist ? 4 : 5;
    const sliced = targetWords.length > maxWords ? targetWords.slice(0, maxWords) : targetWords;
    const requiredMatches = sliced.length > 3 ? 3 : sliced.length;
    let matched = 0;
    const used = new Set();
    for (const tw of sliced) {
      let bestDist = Infinity;
      let bestIdx = -1;
      for (let i = 0; i < inputWords.length; i++) {
        if (used.has(i)) continue;
        const d = levenshteinDistance(inputWords[i], tw);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      if (bestIdx !== -1 && bestDist <= Math.max(1, Math.floor(tw.length * 0.3))) {
        used.add(bestIdx);
        matched++;
      }
    }
    if (matched >= requiredMatches) return true;
  }

  return false;
}

function normalizeOptimal(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/\b(the|a|an)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripParentheticals(str) {
  return str.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*[-–—].*$/, ' ').replace(/\s+/g, ' ').trim();
}

function splitFeatured(str) {
  const parts = str.split(/\s*(?:feat\.|ft\.|&)\s*/i);
  return parts[0].trim();
}

function levenshteinSimilarity(a, b) {
  const d = levenshteinDistance(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

function splitArtists(str) {
  return str.split(/\s*(?:,|feat\.|ft\.|&)\s*/i).map(s => s.trim()).filter(Boolean);
}

function fuzzyMatchOptimal(input, target, type) {
  if (!input || !target) return false;
  const cleanInput = normalizeOptimal(input);
  const cleanTarget = normalizeOptimal(target);
  if (cleanInput === cleanTarget) return true;

  const isArtist = type === 'artist';

  if (cleanTarget.length < 4 && cleanInput.length < 4) {
    return cleanInput === cleanTarget;
  }

  const artistThreshold = isArtist ? 0.25 : 0.35;

  if (cleanTarget.includes(',') || /\b(?:feat|ft|&)\b/.test(cleanTarget)) {
    const segments = splitArtists(target).map(s => normalizeOptimal(s));
    for (const seg of segments) {
      if (cleanInput === seg) return true;
      if (seg.length >= 3 && levenshteinSimilarity(cleanInput, seg) >= (1 - artistThreshold)) return true;
    }
  }
  let sim = levenshteinSimilarity(cleanInput, cleanTarget);
  if (sim >= (1 - artistThreshold)) return true;

  const cleanTargetStripped = stripParentheticals(cleanTarget);
  if (cleanTargetStripped !== cleanTarget) {
    sim = levenshteinSimilarity(cleanInput, normalizeOptimal(cleanTargetStripped));
    if (sim >= (1 - artistThreshold)) return true;
  }

  const primaryArtist = normalizeOptimal(splitFeatured(cleanTarget));
  if (primaryArtist !== cleanTarget) {
    sim = levenshteinSimilarity(cleanInput, primaryArtist);
    if (sim >= (1 - artistThreshold)) return true;
  }

  const inputWords = cleanInput.split(/\s+/);
  const targetWords = cleanTarget.split(/\s+/);
  if (inputWords.length >= 1 && targetWords.length >= 2) {
    const maxWords = isArtist ? 4 : 5;
    const sliced = targetWords.length > maxWords ? targetWords.slice(0, maxWords) : targetWords;
    const requiredMatches = sliced.length > 3 ? 3 : sliced.length;
    let matched = 0;
    const used = new Set();
    for (const tw of sliced) {
      let bestDist = Infinity;
      let bestIdx = -1;
      for (let i = 0; i < inputWords.length; i++) {
        if (used.has(i)) continue;
        const d = levenshteinDistance(inputWords[i], tw);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      const maxWordEdits = Math.max(1, Math.floor(tw.length * artistThreshold));
      if (bestIdx !== -1 && bestDist <= maxWordEdits) {
        used.add(bestIdx);
        matched++;
      }
    }
    if (matched >= requiredMatches) return true;
  }

  return false;
}

function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function endGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.state = 'lobby';
  room.currentRound = 0;
  room.totalRounds = 0;
  room.tracks = [];
  room.guesses.clear();

  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

  io.to(roomCode).emit('game-over', {
    players: sortedPlayers.map((p, i) => ({ ...p, rank: i + 1 })),
  });
}

server.listen(PORT, () => {
  console.log(`Trackle server running on port ${PORT}`);
});
