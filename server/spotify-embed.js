export async function scrapePreviewUrl(trackId) {
  const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
  try {
    const resp = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Trackle/1.0)',
      },
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    const previewMatch = html.match(/https:\/\/p\.scdn\.co\/mp3-preview\/[^\s"']+/)
      || html.match(/"preview_url"\s*:\s*"(https?:\/\/[^"]+)"/);
    if (previewMatch) {
      return previewMatch[0];
    }
  } catch (err) {
    console.error(`Spotify embed scrape error for ${trackId}:`, err.message);
  }
  return null;
}
