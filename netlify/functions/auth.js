// netlify/functions/auth.js
// ESM (Netlify Functions) — handmatige GitHub OAuth voor Decap/Netlify CMS

export async function handler(event) {
  // BELANGRIJK: niet "URL" uit process.env halen, dat overschrijft de globale URL constructor!
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
  const siteUrl = process.env.URL;                 // Netlify productie URL (optioneel)
  const previewUrl = process.env.DEPLOY_PRIME_URL; // Netlify preview URL (optioneel)

  // Bepaal je origin (https://...):
  const origin =
    (siteUrl ? new globalThis.URL(siteUrl).origin : null) ||
    (previewUrl ? new globalThis.URL(previewUrl).origin : null) ||
    (event.headers && event.headers.host ? `https://${event.headers.host}` : "");

  const pathEnd = (event.path || "").split("/").slice(-1)[0]; // 'auth' of 'callback'

  // 1) START OAUTH → redirect naar GitHub
  if (pathEnd !== "callback") {
    const redirect_uri = `${origin}/api/auth/callback`;
    const authURL =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${encodeURIComponent(GITHUB_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
      `&scope=repo,user:email`;

    return {
      statusCode: 302,
      headers: { Location: authURL, "Cache-Control": "no-store" },
      body: ""
    };
  }

  // 2) CALLBACK → code → access_token → postMessage terug naar opener (Decap)
  try {
    const code = new URLSearchParams(event.rawQuery || "").get("code");
    if (!code) return { statusCode: 400, body: "Missing code" };

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code
      })
    });
    const data = await tokenRes.json();

    if (!data.access_token) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "text/plain" },
        body: `OAuth exchange failed: ${JSON.stringify(data)}`
      };
    }

    const html = `<!doctype html>
<meta charset="utf-8">
<title>Auth OK</title>
<style>
  body{font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:20px;color:#223}
</style>
<body>Je kunt dit venster sluiten…</body>
<script>
  (function () {
    var token = ${JSON.stringify(data.access_token)};
    var origin = window.location.origin;

    function sendAll() {
      try { window.opener && window.opener.postMessage('authorization:github:success:' + token, origin); } catch(e){}
      try {
        window.opener && window.opener.postMessage({
          type:'authorization', provider:'github', status:'success', token: token
        }, origin);
      } catch(e){}
    }
    sendAll();
    setTimeout(sendAll, 50);
    setTimeout(function(){ try{ window.close(); }catch(e){} }, 150);
  })();
</script>`;

    return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: html };
  } catch (err) {
    return { statusCode: 500, body: "OAuth error" };
  }
}
