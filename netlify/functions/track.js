// Slaat elk event op als één JSON-regel in Netlify Blobs.
// Bestandsnaam per dag: events/YYYY-MM-DD.jsonl

export default async (req, context) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const body = await req.json();
    const now = new Date();

    const record = {
      ...body,
      _ts: now.toISOString(),             // server timestamp
      _ua: req.headers.get('user-agent') || '',
    };

    const day = body.day || now.toISOString().slice(0,10); // YYYY-MM-DD
    const key = `events/${day}.jsonl`;

    // Append één regel JSON
    const line = JSON.stringify(record) + '\n';
    await context.blobs.append(key, new TextEncoder().encode(line), {
      addRandomSuffix: false,
    });

    return Response.json({ ok: true });
  } catch (err) {
    return new Response(`ERR: ${err?.message || err}`, { status: 500 });
  }
}
