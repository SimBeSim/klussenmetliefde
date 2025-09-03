// Netlify Function: append events als JSONL naar Netlify Blobs.
// Map: events/YYYY-MM-DD.jsonl

export default async (req, context) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const body = await req.json();
    body._ts = new Date().toISOString();   // server timestamp
    //delete body.ip;                        // geen IP opslaan

    const day = body.day || new Date().toISOString().slice(0,10);
    const key = `events/${day}.jsonl`;

    const line = JSON.stringify(body) + '\n';
    await context.blobs.append(key, new TextEncoder().encode(line), {
      addRandomSuffix: false,
    });

    return Response.json({ ok: true });
  } catch (err) {
    return new Response(`ERR: ${err?.message || err}`, { status: 500 });
  }
}
