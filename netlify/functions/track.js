// Netlify Functions (Node 18+). Slaat events op als .jsonl in Netlify Blobs.
//
// Vereist: Netlify Blobs (standaard beschikbaar). Geen extra setup.

export default async (req, context) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Probeer JSON te lezen
    const body = await req.json();
    // Verrijk met server-timestamp (UTC)
    body._ts = new Date().toISOString();

    // Extra voorzichtig: geen IP opslaan (GDPR). Als je ooit IP-hash wil, doe het client-side + met consent.
    delete body.ip;

    // Maak per dag 1 JSONL-bestand
    const day = body.day || new Date().toISOString().slice(0,10); // YYYY-MM-DD
    const bucket = context.blobs; // Netlify Blobs binding
    const key = `events/${day}.jsonl`;

    // Append als één regel JSON
    const line = JSON.stringify(body) + '\n';
    await bucket.append(key, new TextEncoder().encode(line), {
      addRandomSuffix: false, // houd 1 bestand/dag
    });

    return Response.json({ ok: true });
  } catch (err) {
    return new Response(`ERR: ${err?.message || err}`, { status: 500 });
  }
}
