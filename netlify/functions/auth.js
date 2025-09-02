// netlify/functions/auth.js
export async function handler(event) {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, URL, DEPLOY_PRIME_URL } = process.env;

  // Bepaal je site-origin betrouwbaar
  const origin =
    (URL && new URL(URL).origin) ||
    (DEPLOY_PRIME_URL && new URL(DEPLOY_PRIME_URL).origin) ||
    (event.headers.host ? `https://${event.headers.host}` : "");

  const pathEnd = (event.path || "").split("/").slice(-1)[0]; // 'auth' of 'callback'

  // 1) START OAUTH -> redirect naar GitHub
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

  // 2) CALLBACK -> code -> access_token -> postMessage terug naar opener
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

    // HTML die token terugstuurt zoals Decap verwacht en het venster sluit
    const html = `<!doctype html>
<meta charset="utf-8">
<title>Auth OK</title>
<script>
  (function () {
    var token = ${JSON.stringify(data.access_token)};
    var msg = 'authorization:github:success:' + token;
    // Stuur terug naar opener (Decap popup flow)
    if (window.opener) {
      window.opener.postMessage(msg, '*');
      window.close();
    } else {
      // fallback: toon token (alleen voor debug)
      document.body.textContent = 'Received token';
    }
  })();
</script>`;

    return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: html };
  } catch (err) {
    return { statusCode: 500, body: "OAuth error" };
  }
}
