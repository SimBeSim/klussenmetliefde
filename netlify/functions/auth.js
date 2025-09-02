// netlify/functions/auth.js
export async function handler(event) {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = process.env;
  const siteURL = new URL(event.headers.origin || `https://${event.headers.host}`);

  // Bepaal subroute ('' | 'callback')
  const path = (event.path || "").split("/").slice(-1)[0]; // 'auth' of 'callback'

  // 1) Start OAuth: redirect naar GitHub
  if (path !== "callback") {
    const redirect_uri = `${siteURL.origin}/api/auth/callback`;
    const url =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${encodeURIComponent(GITHUB_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
      `&scope=repo,user:email`;
    return {
      statusCode: 302,
      headers: { Location: url },
      body: ""
    };
  }

  // 2) Callback: code -> access_token
  try {
    const code = new URLSearchParams(event.rawQuery || "").get("code");
    if (!code) {
      return { statusCode: 400, body: "Missing code" };
    }

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
      return { statusCode: 401, body: "OAuth exchange failed" };
    }

    // Decap verwacht een pagina die het token via postMessage terugstuurt en het popup sluit
    const html = `
<!doctype html>
<meta charset="utf-8">
<script>
  (function () {
    function sendToken() {
      var t = ${JSON.stringify(data.access_token)};
      var msg = 'authorization:github:success:' + t;
      window.opener && window.opener.postMessage(msg, '*');
      window.close();
    }
    sendToken();
  })();
</script>`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: html
    };
  } catch (e) {
    return { statusCode: 500, body: "OAuth error" };
  }
}
