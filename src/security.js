// Security helpers for ai.trujillomingorance.com: response headers, CSP nonce,
// CSRF origin guard, the isolated artifact preview frame and Microsoft Entra
// (OIDC auth-code + PKCE) admin sign-in. No secrets live in this file.

export const APP_HOSTS = new Set(['ai.trujillomingorance.com', 'localhost', '127.0.0.1']);

const TRUSTED_ORIGINS = new Set([
  'https://ai.trujillomingorance.com',
  'https://guides.trujillomingorance.com',
  'https://trujillomingorance.com',
  'https://www.trujillomingorance.com',
  'https://rewrite.trujillomingorance.com'
]);

export function isTrustedOrigin(origin) {
  if (!origin) return false;
  if (TRUSTED_ORIGINS.has(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function makeNonce() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return b64url(b);
}

// CSP for HTML pages built by html_shell (app + site). Inline scripts need the nonce;
// inline event handlers and injected <script> are blocked.
export function shellCsp(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net https://accounts.google.com https://static.cloudflareinsights.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "connect-src 'self' https://*.trujillomingorance.com https://accounts.google.com https://cloudflareinsights.com",
    "frame-src 'self' https://accounts.google.com https://www.tradingview.com https://s.tradingview.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com https://login.microsoftonline.com https://x.com https://twitter.com",
    "frame-ancestors 'none'"
  ].join('; ');
}

// Minimal, non-breaking CSP for other HTML we generate (library pages etc.).
const BASELINE_CSP = "object-src 'none'; base-uri 'self'; frame-ancestors 'self'";

// Strict CSP for the isolated artifact preview document. It is loaded in an iframe with
// sandbox="allow-scripts ..." and WITHOUT allow-same-origin, so it runs on an opaque
// origin: no cookies, no localStorage, no access to the app. connect-src 'none' stops
// artifacts from calling out; form-action 'none' stops form posts.
export const PREVIEW_CSP = [
  "default-src 'none'",
  // The frame runs on an opaque origin (sandbox without allow-same-origin), so it
  // holds no cookies/storage of ours; the CSP stops it from framing, navigating
  // forms to non-https targets or loading plugins, while artifacts keep CDN libs.
  "script-src 'unsafe-inline' 'unsafe-eval' https: blob:",
  "style-src 'unsafe-inline' https:",
  "img-src data: blob: https:",
  "font-src data: https:",
  "media-src data: blob: https:",
  "connect-src https:",
  "frame-src 'none'",
  "worker-src blob:",
  "form-action https:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'"
].join('; ');

export function previewFrameResponse() {
  // The frame waits for exactly one message from its parent window, then replaces
  // itself with the artifact document. The CSP above stays in force after
  // document.open(), so the artifact inherits the strict policy.
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>Vista previa</title></head><body><script>
(function(){
  var done = false;
  window.addEventListener('message', function (e) {
    if (done || e.source !== window.parent) return;
    var d = e.data;
    if (!d || d.type !== 'ta-preview' || typeof d.html !== 'string') return;
    done = true;
    document.open(); document.write(d.html); document.close();
  });
  try { window.parent.postMessage({ type: 'ta-preview-ready' }, '*'); } catch (err) {}
})();
<\/script></body></html>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Security-Policy': PREVIEW_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
}

export function applySecurityHeaders(request, response) {
  let host = '';
  try { host = new URL(request.url).hostname; } catch (e) { return response; }
  if (!APP_HOSTS.has(host) || !response) return response;
  // Opaque/101 responses (websockets) and redirects from fetch() can be immutable.
  if (response.status === 101) return response;
  let res = response;
  try {
    res = new Response(response.body, response);
  } catch (e) {
    return response;
  }
  const h = res.headers;
  const setIfMissing = (k, v) => { if (!h.has(k)) h.set(k, v); };
  if (host === 'ai.trujillomingorance.com') {
    setIfMissing('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  setIfMissing('X-Content-Type-Options', 'nosniff');
  setIfMissing('Referrer-Policy', 'strict-origin-when-cross-origin');
  setIfMissing('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()');
  const ct = (h.get('Content-Type') || '').toLowerCase();
  if (ct.includes('text/html')) {
    setIfMissing('Content-Security-Policy', BASELINE_CSP);
    setIfMissing('X-Frame-Options', 'SAMEORIGIN');
  }
  return res;
}

// CSRF: requests authenticated by the shared cookie (no Authorization header) that
// change state must come from one of our own origins. Browsers always send Origin on
// cross-origin and same-origin POST/DELETE; non-browser clients without Origin and
// without cookies are unaffected.
export function csrfViolation(request) {
  const m = request.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
  if ((request.headers.get('Authorization') || '').startsWith('Bearer ')) return false;
  const cookie = request.headers.get('Cookie') || '';
  if (!/(?:^|;\s*)(?:ta_session|auth_token)=/.test(cookie)) return false;
  const origin = request.headers.get('Origin');
  if (!origin) {
    const site = request.headers.get('Sec-Fetch-Site');
    return !!site && site !== 'same-origin' && site !== 'same-site' && site !== 'none';
  }
  return !isTrustedOrigin(origin);
}

/* ------------------------------------------------------------------ */
/* Microsoft Entra ID (OIDC) admin sign-in                             */
/* ------------------------------------------------------------------ */

export const MS_ALLOWED_DOMAIN_DEFAULT = 'trujillomingorance.com';
const MS_STATE_COOKIE = 'ta_ms_oidc';

export function msConfig(env) {
  const clientId = env && env.MS_CLIENT_ID;
  const tenantId = env && env.MS_TENANT_ID;
  const secret = env && env.MS_CLIENT_SECRET;
  const killed = env && String(env.MS_LOGIN_DISABLED || '') === '1';
  const enabled = !!(clientId && tenantId && secret) && !killed && /^[0-9a-f-]{36}$/i.test(String(tenantId));
  return {
    enabled,
    clientId: clientId || '',
    tenantId: String(tenantId || '').toLowerCase(),
    secret: secret || '',
    domain: String((env && env.MS_ALLOWED_DOMAIN) || MS_ALLOWED_DOMAIN_DEFAULT).toLowerCase(),
    admins: String((env && env.ADMIN_EMAILS) || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  };
}

function b64url(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
  let m = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (m.length % 4) m += '=';
  const bin = atob(m);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomToken(n = 32) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b64url(b);
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}

function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length || !a.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function safeNext(next) {
  const n = String(next || '/');
  return /^\/(?!\/)[\w\-./?=&%#]*$/.test(n) ? n.slice(0, 200) : '/';
}

function redirectUri(request) {
  const u = new URL(request.url);
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  return (local ? `${u.protocol}//${u.host}` : 'https://ai.trujillomingorance.com') + '/api/auth/microsoft/callback';
}

export async function msStart(request, env, signingSecret) {
  const cfg = msConfig(env);
  if (!cfg.enabled) return jsonErr('microsoft_login_disabled', 404);
  const url = new URL(request.url);
  const state = randomToken(24);
  const nonce = randomToken(24);
  const verifier = randomToken(48);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ s: state, n: nonce, v: verifier, r: safeNext(url.searchParams.get('next')), e: Date.now() + 600000 })));
  const sig = await hmac(signingSecret, payload);
  const auth = new URL(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/authorize`);
  auth.searchParams.set('client_id', cfg.clientId);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('response_mode', 'query');
  auth.searchParams.set('redirect_uri', redirectUri(request));
  auth.searchParams.set('scope', 'openid profile email');
  auth.searchParams.set('state', state);
  auth.searchParams.set('nonce', nonce);
  auth.searchParams.set('code_challenge', challenge);
  auth.searchParams.set('code_challenge_method', 'S256');
  auth.searchParams.set('domain_hint', cfg.domain);
  auth.searchParams.set('prompt', 'select_account');
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return new Response(null, {
    status: 302,
    headers: {
      Location: auth.toString(),
      'Cache-Control': 'no-store',
      'Set-Cookie': `${MS_STATE_COOKIE}=${payload}.${sig}; Path=/api/auth/microsoft; HttpOnly${secure}; SameSite=Lax; Max-Age=600`
    }
  });
}

let jwksCache = null;
async function msKeys(tenantId, fetchImpl) {
  if (jwksCache && jwksCache.tid === tenantId && jwksCache.until > Date.now()) return jwksCache.keys;
  const r = await fetchImpl(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`);
  if (!r.ok) throw new Error('jwks_unavailable');
  const j = await r.json();
  const keys = Array.isArray(j.keys) ? j.keys : [];
  jwksCache = { tid: tenantId, keys, until: Date.now() + 3600000 };
  return keys;
}

export async function verifyMsIdToken(idToken, cfg, expectedNonce, fetchImpl = fetch, nowMs = Date.now()) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('id_token_malformed');
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('id_token_alg');
  let keys = await msKeys(cfg.tenantId, fetchImpl);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) { jwksCache = null; keys = await msKeys(cfg.tenantId, fetchImpl); jwk = keys.find((k) => k.kid === header.kid); }
  if (!jwk || jwk.kty !== 'RSA') throw new Error('id_token_kid');
  const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('id_token_signature');
  const now = Math.floor(nowMs / 1000);
  if (claims.iss !== `https://login.microsoftonline.com/${cfg.tenantId}/v2.0`) throw new Error('id_token_iss');
  if (claims.aud !== cfg.clientId) throw new Error('id_token_aud');
  if (!claims.exp || claims.exp < now - 60) throw new Error('id_token_expired');
  if (claims.nbf && claims.nbf > now + 300) throw new Error('id_token_nbf');
  if (String(claims.tid || '').toLowerCase() !== cfg.tenantId) throw new Error('id_token_tid');
  if (!expectedNonce || !safeEqual(claims.nonce, expectedNonce)) throw new Error('id_token_nonce');
  const email = String(claims.email || claims.preferred_username || claims.upn || '').trim().toLowerCase();
  if (!email.includes('@') || email.split('@').pop() !== cfg.domain) throw new Error('domain_not_allowed');
  if (cfg.admins.length && !cfg.admins.includes(email)) throw new Error('not_in_admin_allowlist');
  return { email, name: String(claims.name || '').slice(0, 120), oid: String(claims.oid || claims.sub || ''), tid: claims.tid };
}

function readCookie(request, name) {
  const c = request.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : '';
}

// Returns either { error, status } or { identity, next }.
export async function msCallback(request, env, signingSecret, fetchImpl = fetch) {
  const cfg = msConfig(env);
  if (!cfg.enabled) return { error: 'microsoft_login_disabled', status: 404 };
  const url = new URL(request.url);
  if (url.searchParams.get('error')) return { error: 'microsoft_denied', status: 400 };
  const raw = readCookie(request, MS_STATE_COOKIE);
  const [payload, sig] = raw.split('.');
  if (!payload || !sig || !safeEqual(sig, await hmac(signingSecret, payload))) return { error: 'state_cookie_invalid', status: 400 };
  let st;
  try { st = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload))); } catch (e) { return { error: 'state_cookie_invalid', status: 400 }; }
  if (!st || !st.e || st.e < Date.now()) return { error: 'state_expired', status: 400 };
  if (!safeEqual(url.searchParams.get('state'), st.s)) return { error: 'state_mismatch', status: 400 };
  const code = url.searchParams.get('code') || '';
  if (!code || code.length > 4096) return { error: 'code_missing', status: 400 };
  const tokenRes = await fetchImpl(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.secret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(request),
      code_verifier: st.v,
      scope: 'openid profile email'
    }).toString()
  });
  if (!tokenRes.ok) return { error: 'token_exchange_failed', status: 401 };
  const tok = await tokenRes.json().catch(() => ({}));
  try {
    const identity = await verifyMsIdToken(tok.id_token, cfg, st.n, fetchImpl);
    return { identity, next: safeNext(st.r) };
  } catch (e) {
    return { error: String((e && e.message) || 'id_token_invalid'), status: 403 };
  }
}

export function clearMsStateCookie(secure = true) {
  return `${MS_STATE_COOKIE}=; Path=/api/auth/microsoft; HttpOnly${secure ? '; Secure' : ''}; SameSite=Lax; Max-Age=0`;
}

function jsonErr(error, status) {
  return new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
