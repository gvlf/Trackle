import { searchPreview } from './deezer.js';
import { scrapePreviewUrl } from './spotify-embed.js';

export class SpotifyService {
  constructor() {
    this.baseUrl = 'https://api.spotify.com/v1';
  }

  async getToken() {
    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.SPOTIFY_CLIENT_ID,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET,
      }),
    });
    if (!resp.ok) throw new Error('Failed to get Spotify token');
    return resp.json();
  }

  async exchangeCode(code) {
    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
        client_id: process.env.SPOTIFY_CLIENT_ID,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET,
      }),
    });
    if (!resp.ok) throw new Error('Failed to exchange code for token');
    return resp.json();
  }

  async getCurrentUser(token) {
    const resp = await fetch(`${this.baseUrl}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error('Failed to get current user');
    return resp.json();
  }

  async getUserPlaylists(token) {
    const user = await this.getCurrentUser(token);
    const playlists = [];
    let url = `${this.baseUrl}/me/playlists?limit=50`;

    while (url) {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const body = await resp.text();
        console.error(`Spotify API error ${resp.status}: ${body}`);
        throw new Error(`Failed to fetch playlists: ${resp.status}`);
      }
      const data = await resp.json();
      playlists.push(
        ...data.items
          .filter(p => p.owner.id === user.id)
          .map((p) => ({
            id: p.id,
            name: p.name,
            trackCount: p.tracks?.total ?? p.items?.total ?? 0,
            image: p.images?.[0]?.url || null,
            owner: p.owner.display_name,
          }))
      );
      url = data.next;
    }

    return playlists;
  }

  async getPlaylistTracks(token, playlistId) {
    const tracks = [];
    let url = `${this.baseUrl}/playlists/${playlistId}/items?limit=100`;

    while (url) {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const body = await resp.text();
        console.error(`Spotify API error ${resp.status}: ${body}`);
        throw new Error(`Failed to fetch playlist tracks: ${resp.status}`);
      }
      const data = await resp.json();

      for (const item of (data.items || [])) {
        const track = item?.item;
        if (!track || track.type !== 'track') continue;

        let previewUrl = track.preview_url;
        let duration = Math.floor(track.duration_ms / 1000);

        if (!previewUrl) {
          const artist = track.artists.map((a) => a.name).join(', ');
          const deezer = await searchPreview(artist, track.name);
          if (deezer) {
            previewUrl = deezer.previewUrl;
            duration = deezer.duration || duration;
          }
        }

        if (!previewUrl) {
          previewUrl = await scrapePreviewUrl(track.id);
        }

        if (!previewUrl) continue;

        tracks.push({
          id: track.id,
          name: track.name,
          artist: track.artists.map((a) => a.name).join(', '),
          previewUrl,
          duration,
          albumArt: track.album?.images?.[0]?.url || null,
        });
      }
      url = data.next;
    }

    return tracks;
  }
}
