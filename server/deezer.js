const DEEZER_BASE = 'https://api.deezer.com';

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function similarity(a, b) {
  const aWords = normalize(a).split(/\s+/);
  const bWords = normalize(b).split(/\s+/);
  const matches = aWords.filter(w => bWords.some(bw => bw.includes(w) || w.includes(bw)));
  return matches.length / Math.max(aWords.length, bWords.length, 1);
}

export async function searchPreview(artist, trackName) {
  const query = `${artist} ${trackName}`;
  const url = `${DEEZER_BASE}/search?q=${encodeURIComponent(query)}&limit=5`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.data?.length) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const track of data.data) {
      const artistScore = similarity(artist, track.artist?.name || '');
      const titleScore = similarity(trackName, track.title || '');
      const score = (artistScore + titleScore) / 2;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = track;
      }
    }

    if (bestMatch && bestScore >= 0.4 && bestMatch.preview) {
      return {
        previewUrl: bestMatch.preview,
        duration: bestMatch.duration || 30,
      };
    }
  } catch (err) {
    console.error(`Deezer search error for "${query}":`, err.message);
  }

  return null;
}
