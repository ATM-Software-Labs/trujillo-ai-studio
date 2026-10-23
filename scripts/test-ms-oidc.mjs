// Offline tests for the Microsoft OIDC verifier (no network, generated RSA key).
import assert from 'node:assert/strict';
import { verifyMsIdToken, msConfig, msStart, msCallback, csrfViolation, isTrustedOrigin } from '../src/security.js';

const TID = '686bb631-e5e4-4fbf-bf55-835dd40fb263';
const CID = '11111111-2222-3333-4444-555555555555';
const env = { MS_CLIENT_ID: CID, MS_TENANT_ID: TID, MS_CLIENT_SECRET: 'x', ADMIN_EMAILS: 'alberto@trujillomingorance.com' };
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
const jwks = { keys: [{ kty: 'RSA', kid: 'k1', n: pub.n, e: pub.e }] };
const fakeFetch = async (u) => { assert.ok(String(u).includes(`/${TID}/discovery/v2.0/keys`)); return new Response(JSON.stringify(jwks)); };
const now = Math.floor(Date.now() / 1000);
async function sign(claims, header = { alg: 'RS256', kid: 'k1', typ: 'JWT' }, key = kp.privateKey) {
  const h = b64u(JSON.stringify(header)), p = b64u(JSON.stringify(claims));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(h + '.' + p));
  return `${h}.${p}.${b64u(sig)}`;
}
const good = { iss: `https://login.microsoftonline.com/${TID}/v2.0`, aud: CID, tid: TID, exp: now + 600, nbf: now - 10, nonce: 'N1', oid: 'o1', name: 'Alberto', preferred_username: 'Alberto@TrujilloMingorance.com' };
const cfg = msConfig(env);
let pass = 0;
async function ok(name, claims, extra) { const r = await verifyMsIdToken(await sign(claims), cfg, 'N1', fakeFetch); assert.equal(r.email, 'alberto@trujillomingorance.com'); pass++; console.log('ok  ', name); }
async function bad(name, tokenP, err, c = cfg) { await assert.rejects(async () => verifyMsIdToken(await tokenP, c, 'N1', fakeFetch), (e) => e.message === err); pass++; console.log('ok  ', name, '->', err); }
await ok('valid token', good);
await bad('wrong issuer', sign({ ...good, iss: 'https://login.microsoftonline.com/common/v2.0' }), 'id_token_iss');
await bad('wrong aud', sign({ ...good, aud: 'other' }), 'id_token_aud');
await bad('expired', sign({ ...good, exp: now - 3600 }), 'id_token_expired');
await bad('wrong tid', sign({ ...good, tid: '00000000-0000-0000-0000-000000000000' }), 'id_token_tid');
await bad('wrong nonce', sign({ ...good, nonce: 'X' }), 'id_token_nonce');
await bad('other domain', sign({ ...good, preferred_username: 'eve@evil.com' }), 'domain_not_allowed');
await bad('not in allowlist', sign({ ...good, preferred_username: 'bob@trujillomingorance.com' }), 'not_in_admin_allowlist');
await bad('alg none', sign(good, { alg: 'none', kid: 'k1' }), 'id_token_alg');
await bad('HS256', sign(good, { alg: 'HS256', kid: 'k1' }), 'id_token_alg');
await bad('unknown kid', sign(good, { alg: 'RS256', kid: 'zz' }), 'id_token_kid');
const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
await bad('forged signature', sign(good, undefined, other.privateKey), 'id_token_signature');
// tampered payload with original signature
const t = (await sign(good)).split('.'); t[1] = b64u(JSON.stringify({ ...good, preferred_username: 'x@trujillomingorance.com' }));
await bad('tampered payload', Promise.resolve(t.join('.')), 'id_token_signature');

// feature flag
assert.equal(msConfig({}).enabled, false); assert.equal(msConfig({ ...env, MS_CLIENT_SECRET: '' }).enabled, false);
assert.equal(msConfig({ ...env, MS_LOGIN_DISABLED: '1' }).enabled, false); assert.equal(msConfig({ ...env, MS_TENANT_ID: 'common' }).enabled, false);
assert.equal(msConfig(env).enabled, true); pass++; console.log('ok   feature flag');
const off = await msStart(new Request('https://ai.trujillomingorance.com/api/auth/microsoft/start'), {}, 's');
assert.equal(off.status, 404); pass++; console.log('ok   start disabled -> 404');

// full start -> callback flow with mocked token endpoint
const st = await msStart(new Request('https://ai.trujillomingorance.com/api/auth/microsoft/start?next=/projects'), env, 'sig-secret');
assert.equal(st.status, 302);
const loc = new URL(st.headers.get('Location'));
assert.equal(loc.origin + loc.pathname, `https://login.microsoftonline.com/${TID}/oauth2/v2.0/authorize`);
assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');
assert.equal(loc.searchParams.get('redirect_uri'), 'https://ai.trujillomingorance.com/api/auth/microsoft/callback');
const cookie = st.headers.get('Set-Cookie'); assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
const cv = cookie.split(';')[0];
const state = loc.searchParams.get('state'), nonce = loc.searchParams.get('nonce'), chal = loc.searchParams.get('code_challenge');
const flowFetch = async (u, init) => {
  if (String(u).endsWith('/oauth2/v2.0/token')) {
    const b = new URLSearchParams(init.body);
    const d = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(b.get('code_verifier'))));
    assert.equal(d, chal); assert.equal(b.get('code'), 'C0DE');
    return new Response(JSON.stringify({ id_token: await sign({ ...good, nonce }) }));
  }
  return fakeFetch(u);
};
const cbUrl = (s) => `https://ai.trujillomingorance.com/api/auth/microsoft/callback?code=C0DE&state=${s}`;
const r1 = await msCallback(new Request(cbUrl(state), { headers: { Cookie: cv } }), env, 'sig-secret', flowFetch);
assert.equal(r1.identity.email, 'alberto@trujillomingorance.com'); assert.equal(r1.next, '/projects'); pass++; console.log('ok   full PKCE flow');
const r2 = await msCallback(new Request(cbUrl('wrong'), { headers: { Cookie: cv } }), env, 'sig-secret', flowFetch);
assert.equal(r2.error, 'state_mismatch'); pass++; console.log('ok   state mismatch');
const r3 = await msCallback(new Request(cbUrl(state), { headers: { Cookie: cv.replace(/.$/, 'A') } }), env, 'sig-secret', flowFetch);
assert.equal(r3.error, 'state_cookie_invalid'); pass++; console.log('ok   tampered state cookie');
const r4 = await msCallback(new Request(cbUrl(state)), env, 'sig-secret', flowFetch);
assert.equal(r4.error, 'state_cookie_invalid'); pass++; console.log('ok   missing state cookie');

// CSRF guard
const P = (h) => new Request('https://ai.trujillomingorance.com/api/x', { method: 'POST', headers: h });
assert.equal(csrfViolation(P({ Cookie: 'ta_session=a', Origin: 'https://evil.com' })), true);
assert.equal(csrfViolation(P({ Cookie: 'ta_session=a', Origin: 'https://ai.trujillomingorance.com' })), false);
assert.equal(csrfViolation(P({ Cookie: 'ta_session=a', Origin: 'https://guides.trujillomingorance.com' })), false);
assert.equal(csrfViolation(P({ Cookie: 'ta_session=a', 'Sec-Fetch-Site': 'cross-site' })), true);
assert.equal(csrfViolation(P({ Origin: 'https://evil.com' })), false);
assert.equal(csrfViolation(P({ Cookie: 'ta_session=a', Origin: 'https://evil.com', Authorization: 'Bearer x' })), false);
assert.equal(isTrustedOrigin('https://ai.trujillomingorance.com.evil.com'), false);
pass++; console.log('ok   csrf guard');
console.log(`\n${pass} checks passed`);
