import assert from 'node:assert/strict'
import test from 'node:test'
import { consumeCapped, resetCounterMemory } from '../src/counters.js'
import { memoryAllow, resetBurstMemory } from '../src/guard.js'
import { bumpOps, flushOps, handleIdeaPost, readOps, resetOpsBuffer } from '../src/ops.js'
import { rateMail } from '../src/mail_gate.js'
import { emptyProfile, shouldPersistProfile } from '../src/profile.js'
import { verifyTurnstile } from '../src/turnstile.js'
import { checkAndConsumeGlobalTokens, isOwnerUser } from '../src/index.js'

function fakeD1() {
  const rows = new Map()
  const writes = []
  return {
    writes,
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          const exec = async () => {
            if (sql.includes('excluded.n')) {
              const [key, delta] = args
              const n = (rows.get(key) || 0) + Number(delta)
              rows.set(key, n)
              writes.push('add')
              return { n }
            }
            if (sql.startsWith('UPDATE')) {
              const [amount, , key, limit] = args
              if (!rows.has(key)) return null
              const cur = rows.get(key)
              if (cur + Number(amount) <= Number(limit)) {
                const n = cur + Number(amount)
                rows.set(key, n)
                writes.push('update')
                return { n }
              }
              return null
            }
            if (sql.startsWith('INSERT') && sql.includes('DO NOTHING')) {
              const [key, amount] = args
              if (rows.has(key)) return null
              rows.set(key, Number(amount))
              writes.push('insert')
              return { n: Number(amount) }
            }
            if (sql.startsWith('SELECT n FROM counters')) {
              const key = args[0]
              if (!rows.has(key)) return null
              return { n: rows.get(key) }
            }
            return null
          }
          return {
            first: exec,
            async run() { await exec(); return { success: true } },
            async all() { return { results: [] } }
          }
        }
      }
    }
  }
}

function kvSpy() {
  const puts = []
  return {
    puts,
    BOT_MEMORY: {
      async get() { return null },
      async put(...args) { puts.push(args) },
      async delete() {}
    }
  }
}

test('el cupo atómico no pasa del tope y no escribe KV', async () => {
  resetCounterMemory()
  const kv = kvSpy()
  const db = fakeD1()
  const env = { ...kv, COUNTERS: db }
  const a = await consumeCapped(env, 'v1:2026-10-28', 1, 2)
  const b = await consumeCapped(env, 'v1:2026-10-28', 1, 2)
  const c = await consumeCapped(env, 'v1:2026-10-28', 1, 2)
  assert.equal(a.allowed, true)
  assert.equal(b.allowed, true)
  assert.equal(c.allowed, false)
  assert.equal(c.current, 2)
  assert.equal(db.rows.get('v1:2026-10-28'), 2)
  assert.equal(kv.puts.length, 0)
  assert.equal(db.writes.length, 2)
})

test('si D1 falla el cupo sigue cerrado en memoria', async () => {
  resetCounterMemory()
  const kv = kvSpy()
  const env = {
    ...kv,
    COUNTERS: { prepare() { throw new Error('no table') } }
  }
  assert.equal((await consumeCapped(env, 'mail:x', 1, 1)).allowed, true)
  assert.equal((await consumeCapped(env, 'mail:x', 1, 1)).allowed, false)
  assert.equal(kv.puts.length, 0)
})

test('bumpOps y el límite de ideas no hacen put en KV', async () => {
  resetOpsBuffer()
  resetCounterMemory()
  const kv = kvSpy()
  const env = { ...kv, COUNTERS: fakeD1() }
  await bumpOps(env, 'chats', 3)
  await flushOps(env)
  const ops = await readOps(env)
  assert.equal(ops.chats, 3)
  assert.equal(kv.puts.length, 0)
  for (let i = 0; i < 8; i++) {
    const res = await handleIdeaPost({ body: { idea: 'una idea de prueba ' + i, cat: 'feat' }, ip: '198.51.100.4', env, sendEmail: null })
    assert.equal(res.status, 200)
  }
  const blocked = await handleIdeaPost({ body: { idea: 'una idea de mas' }, ip: '198.51.100.4', env, sendEmail: null })
  assert.equal(blocked.status, 429)
  assert.equal(kv.puts.length, 0)
})

test('el correo limita sin KV', async () => {
  resetCounterMemory()
  const kv = kvSpy()
  const env = { ...kv }
  for (let i = 0; i < 5; i++) assert.equal((await rateMail(env, '203.0.113.9')).ok, true)
  assert.equal((await rateMail(env, '203.0.113.9')).ok, false)
  assert.equal(kv.puts.length, 0)
})

test('el propietario no consume cupo de tokens', async () => {
  resetCounterMemory()
  const kv = kvSpy()
  const env = { ...kv, COUNTERS: fakeD1(), OWNER_EMAILS: 'alberto@trujillomingorance.com' }
  assert.equal(isOwnerUser('alberto@trujillomingorance.com', env), true)
  const owner = await checkAndConsumeGlobalTokens(env, 'alberto@trujillomingorance.com', 350, { authed: true })
  assert.equal(owner.allowed, true)
  assert.equal(owner.isOwner, true)
  const guest = await checkAndConsumeGlobalTokens(env, '203.0.113.10', 8000, { authed: false })
  assert.equal(guest.allowed, true)
  const over = await checkAndConsumeGlobalTokens(env, '203.0.113.10', 1, { authed: false })
  assert.equal(over.allowed, false)
  assert.equal(kv.puts.length, 0)
})

test('el perfil anónimo no se persiste y un turno vacío tampoco', () => {
  const before = emptyProfile()
  const after = { ...before, turns: before.turns + 1, topics: { architecture: 1 } }
  assert.equal(shouldPersistProfile(before, after, { anonymous: true }), false)
  assert.equal(shouldPersistProfile(before, after), false)
  assert.equal(shouldPersistProfile(before, { ...after, name: 'Ana' }), true)
})

test('Turnstile sin secreto no bloquea; con secreto y sin token falla cerrado', async () => {
  assert.equal((await verifyTurnstile({}, { token: '', action: 'signup' })).ok, true)
  const closed = await verifyTurnstile({ TURNSTILE_SECRET_KEY: 'secret' }, { token: '', action: 'signup' })
  assert.equal(closed.ok, false)
  const orig = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    action: 'signup',
    hostname: 'evil.example'
  }))
  try {
    const badHost = await verifyTurnstile({ TURNSTILE_SECRET_KEY: 'secret' }, { token: 'tok', ip: '1.2.3.4', action: 'signup' })
    assert.equal(badHost.ok, false)
  } finally {
    globalThis.fetch = orig
  }
})

test('la ráfaga en memoria corta en el límite', () => {
  resetBurstMemory()
  assert.equal(memoryAllow('ip', 2, 60_000, 1_000).ok, true)
  assert.equal(memoryAllow('ip', 2, 60_000, 1_000).ok, true)
  assert.equal(memoryAllow('ip', 2, 60_000, 1_500).ok, false)
  assert.equal(memoryAllow('ip', 2, 60_000, 61_000).ok, true)
})
