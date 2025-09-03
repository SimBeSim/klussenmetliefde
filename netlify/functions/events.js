// Leest het JSONL-bestand van een dag en geeft het terug als array JSON-objecten.
// GET /.netlify/functions/events?day=YYYY-MM-DD  (optioneel)

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const day = url.searchParams.get('day') || new Date().toISOString().slice(0,10);
    const key = `events/${day}.jsonl`;

    const blob = await context.blobs.get(key);
    if (!blob) {
      return Response.json({ day, events: [] });
    }

    const text = await new Response(blob).text();
    const events = text
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); }
        catch { return null; }
      })
      .filter(Boolean);

    return Response.json({ day, events });
  } catch (err) {
    return new Response(`ERR: ${err?.message || err}`, { status: 500 });
  }
}
