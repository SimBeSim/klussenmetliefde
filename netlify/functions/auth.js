// netlify/functions/auth.js
// Gebruik expliciet de WHATWG URL-klasse uit Node, zodat we niets overschrijven.
import { URL as WhatwgURL } from 'node:url';

export async function handler(event) {
  const {
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    URL: SITE_URL,              // <-- hernoem env var URL naar SITE_URL
    DEPLOY_PRIME_URL,
    DEPLOY_URL,                 // soms handig als fallback
  } = process.env;

  // Bepaal een betrouwbare origin voor redirects (productie/preview/locaal)
  let origin = '';
  try {
    if (SITE_URL) {
      origin = new WhatwgURL(SITE_URL).origin;
    } else if (DEPLOY_PRIME_URL) {
      origin = new WhatwgURL(DEPLOY_PRIME_URL).origin;
    } else if (DEPLOY_URL) {
      origin = new WhatwgURL(DEPLOY_URL).origin;
    } else if (event?.headers?.host) {
      // let op: bij http lokaliteit eventueel http:// gebruiken
      origin = `https://${event.headers.host}`;
    }
  } catch (e) {
    // laatste redmiddel: niets doen, dan faalt de flow netjes bij redirect
  }

  // Welke subroute?  '/api/auth' vs '/api/auth/callback'
  const pathEnd = (event.path || '').split('/').slice(-1)[0]; // 'auth' of 'callback'

  // 1) START OAUTH -> redirect naar GitHub
  if (pathEnd !== 'callback') {
    if (!origin) {
      return { statusCode: 500, body: 'Cannot determine site origin for OAuth redirect.' };
    }
    if (!GITHUB_CLIENT_ID) {
      return { statusCode: 500, body: 'Missing GITHUB_CLIENT_ID' };
    }

    const redirect_uri = `${origin}/api/auth/callback`;
    const authURL =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${encodeURIComponent(GITHUB_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
      `&scope=repo,user:email`;

    return {
      statusCode: 302,
      headers: { Location: authURL, 'Cache-Control': 'no-store' },
      body: '',
    };
  }

  // 2) CALLBACK -> code -> access_token -> postMessage terug naar opener
  try {
    // Netlify kan rawQuery óf rawQueryString leveren; val evt. op queryStringParameters terug
    const raw =
      event.rawQueryString ??
      event.rawQuery ??
      new URLSearchParams(event.queryStringParameters || {}).toString();

    const code = new URLSearchParams(raw).get('code');
    if (!code) return { statusCode: 400, body: 'Missing code' };

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return { statusCode: 500, body: 'Missing GitHub OAuth env (client id/secret)' };
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const data = await tokenRes.json();

    if (!data.access_token) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'text/plain' },
        body: `OAuth exchange failed: ${JSON.stringify(data)}`,
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
    if (window.opener) {
      window.opener.postMessage(msg, '*');
      window.close();
    } else {
      document.body.textContent = 'Received token';
    }
  })();
</script>`;

    return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };
  } catch (err) {
    return { statusCode: 500, body: 'OAuth error' };
  }
}
