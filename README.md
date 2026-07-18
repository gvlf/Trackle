# Trackle
=======

A multiplayer music quiz game where players import Spotify playlists and guess songs in real-time.

## Features

- Import playlists from Spotify
- Real-time multiplayer with room codes
- Score based on speed (300 points per correct answer, decaying over time)
- Fuzzy matching for artist and song names
- Beautiful gradient UI with Tailwind CSS

## Setup

1. Create a Spotify App at https://developer.spotify.com/dashboard
2. Add `http://<local-ip-or-domain-for-the-website>:3001/auth/callback` to your app's redirect URIs
3. Copy `.env.example` to `.env` and fill in your Spotify credentials:

```bash
cp .env.example .env
# Edit .env with your Spotify Client ID and Secret
```

4. Install dependencies:

```bash
npm run install:all
```

5. Start the development server:

```bash
npm run dev
```

6. Open http://<local-ip-or-domain-for-the-website>:5173

## How to Play

1. **Create a Room**: Enter your name and click "Create Room"
2. **Share the Code**: Give the 6-character code to your friends
3. **Connect Spotify**: Host connects their Spotify account
4. **Select Playlist**: Choose a playlist from your library
5. **Start Game**: Click "Start Game" when ready
6. **Guess Songs**: Type "Artist - Song Name" and submit
7. **Score Points**: Faster guesses = more points (up to 300 per answer)

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS
- **Backend**: Node.js, Express, Socket.IO
- **API**: Spotify Web API

## Environment Variables

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://<local-ip-or-domain-for-the-website>:3001/auth/callback
PORT=3001
CLIENT_URL=http://localhost:5173
```
>>>>>>> c57ec17 (initial 'working' version)
