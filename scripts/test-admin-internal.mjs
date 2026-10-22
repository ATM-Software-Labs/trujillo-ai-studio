// node --test scripts/test-admin-internal.mjs — /api/admin/summary solo para sesión interna (verificada por guides).
import test from 'node:test'
import assert from 'node:assert/strict'
import { handleInternalAdmin, _resetAdminCache } from '../src/admin_internal.js'

const G = 'https://guides.trujillomingorance.com'
function kv(keys) { return { async list({ prefix }) { return { keys: keys.filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true } } } }
const env = { BOT_MEMORY: kv(['user_email_a@x.com', 'user_email_b@x.com', 'shared_chat:1', 'mem_discord_9', 'user_id_1']), GROQ_API_KEY: 'secret-value', GROQ_MODEL: 'm' }
const req = (cookie, origin = G) => new Request('https://ai.trujillomingorance.com/api/admin/summary', { headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: origin } })
const me = (reply) => async (u, init) => { assert.equal(String(u), G + '/api/auth/me'); assert.ok(init.headers.Cookie.includes('ta_session=')); return new Response(JSON.stringify(reply)) }

test('403: sin cookie, autor, interno de otro proveedor, guides caído', async () => {
  assert.equal((await handleInternalAdmin(req(''), env, me({}))).status, 403)
  assert.equal((await handleInternalAdmin(req('ta_session=t'), env, me({ authenticated: true, user: { role: 'author', provider: 'x' } }))).status, 403)
  assert.equal((await handleInternalAdmin(req('ta_session=t'), env, me({ authenticated: true, user: { role: 'internal', provider: 'google' } }))).status, 403)
  assert.equal((await handleInternalAdmin(req('ta_session=t'), env, async () => { throw new Error('down') })).status, 403)
})

test('interno: recuentos, sin valores secretos, CORS solo para el panel', async () => {
  _resetAdminCache()
  const ok = me({ authenticated: true, user: { role: 'internal', provider: 'microsoft' } })
  const r = await handleInternalAdmin(req('ta_session=t'), env, ok)
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), G)
  const txt = await r.text()
  assert.ok(!txt.includes('secret-value'))
  const d = JSON.parse(txt)
  assert.equal(d.users, 2); assert.equal(d.sharedChats, 1); assert.equal(d.discordMemories, 1)
  const o = await handleInternalAdmin(req('ta_session=t', 'https://evil.example.com'), env, ok)
  assert.equal(o.headers.get('Access-Control-Allow-Origin'), null)
})
