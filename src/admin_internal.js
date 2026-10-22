// GET /api/admin/summary — recuentos para el panel interno central (guides /admin).
// La sesión la verifica guides (/api/auth/me) con la cookie compartida; se exige role internal + microsoft.
// No toca la autenticación propia de Trujillo AI.
export const GUIDES_ME = 'https://guides.trujillomingorance.com/api/auth/me'
export const PANEL_ORIGIN = 'https://guides.trujillomingorance.com'

let cache = null

function cors(request) {
  const o = request.headers.get('Origin') || ''
  return o === PANEL_ORIGIN
    ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin, Cookie' }
    : { Vary: 'Origin, Cookie' }
}
function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex', ...cors(request) } })
}

export async function internalUser(request, fetchImpl = fetch) {
  const cookie = request.headers.get('Cookie') || ''
  if (!/(?:^|;\s*)(?:ta_session|atm_session|session_token)=/.test(cookie)) return null
  try {
    const r = await fetchImpl(GUIDES_ME, { headers: { Cookie: cookie, Accept: 'application/json' }, redirect: 'manual' })
    if (!r.ok) return null
    const d = await r.json()
    const u = d && d.authenticated && d.user
    return u && u.role === 'internal' && u.provider === 'microsoft' ? u : null
  } catch (_) { return null }
}

async function countPrefix(kv, prefix, max = 10000) {
  let n = 0
  let cursor
  do {
    const r = await kv.list({ prefix, cursor, limit: 1000 })
    n += r.keys.length
    if (n >= max) return n
    cursor = r.list_complete ? undefined : r.cursor
  } while (cursor)
  return n
}

export async function handleInternalAdmin(request, env, fetchImpl = fetch) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors(request), 'Access-Control-Allow-Methods': 'GET, OPTIONS' } })
  if (request.method !== 'GET') return json(request, { error: 'method_not_allowed' }, 405)
  if (!(await internalUser(request, fetchImpl))) return json(request, { error: 'forbidden' }, 403)
  if (cache && cache.until > Date.now()) return json(request, cache.data)
  const kv = env.BOT_MEMORY
  const data = { ok: true, at: new Date().toISOString() }
  if (kv) {
    data.users = await countPrefix(kv, 'user_email_')
    data.sharedChats = await countPrefix(kv, 'shared_chat:')
    data.discordMemories = await countPrefix(kv, 'mem_discord_')
    data.pendingSignups = await countPrefix(kv, 'pending_user_')
  }
  data.facts = [['model', env.GROQ_MODEL || ''], ['groq', env.GROQ_API_KEY ? 'on' : 'off']]
  cache = { until: Date.now() + 5 * 60 * 1000, data }
  return json(request, data)
}

export function _resetAdminCache() { cache = null }
