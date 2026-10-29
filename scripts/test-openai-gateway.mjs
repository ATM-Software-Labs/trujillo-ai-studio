import assert from 'node:assert/strict'
import test from 'node:test'
import { handleOpenAIChatCompletions, handleOpenAIModels, prepararMensajesOpenAI, rutaOpenAI } from '../src/openai_gateway.js'
import { resetBurstMemory } from '../src/guard.js'
import { resetCounterMemory } from '../src/counters.js'

const png = 'data:image/png;base64,' + 'i'.repeat(80)

test('ruta /v1/chat/completions', () => {
  assert.equal(rutaOpenAI('/v1/chat/completions'), 'completions')
  assert.equal(rutaOpenAI('/v1/chat/completions/'), 'completions')
  assert.equal(rutaOpenAI('/v1/models'), 'models')
  assert.equal(rutaOpenAI('/api/chat'), null)
})

test('conserva el system del cliente y deja solo la foto', () => {
  const out = prepararMensajesOpenAI([
    { role: 'system', content: 'Devuelve solo JSON de macros' },
    { role: 'user', content: 'turno viejo' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Analiza esta comida' },
        { type: 'image_url', image_url: { url: png } },
      ],
    },
  ])
  assert.equal(out.vision, true)
  assert.equal(out.messages.length, 2)
  assert.equal(out.messages[0].content, 'Devuelve solo JSON de macros')
  assert.equal(out.messages[1].content[0].text, 'Analiza esta comida')
  assert.match(out.messages[1].content[1].image_url.url, /^data:image\/png;base64,/)
})

test('rechaza una imagen que no es data URL', () => {
  const out = prepararMensajesOpenAI([
    { role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://example.com/a.jpg' } }] },
  ])
  assert.match(out.error, /data URL/)
})

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

function req(path, { method = 'GET', key, body, ip = '203.0.113.8' } = {}) {
  const headers = { 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }
  if (key) headers.Authorization = 'Bearer ' + key
  return new Request('https://ai.trujillomingorance.com' + path, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body)
  })
}

test('sin GATEWAY_API_KEY /v1/models y /v1/chat/completions responden 401 y no escriben', async () => {
  resetBurstMemory()
  resetCounterMemory()
  const kv = kvSpy()
  let groq = 0
  const env = { ...kv, GROQ_API_KEY: 'groq-test' }
  const models = await handleOpenAIModels(req('/v1/models'), env, {})
  assert.equal(models.status, 401)
  const chat = await handleOpenAIChatCompletions(req('/v1/chat/completions', {
    method: 'POST',
    body: { messages: [{ role: 'user', content: 'hola' }] }
  }), env, null, { callGroqChat: async () => { groq += 1; return { ok: false } }, corsHeaders: {} })
  assert.equal(chat.status, 401)
  const again = await handleOpenAIModels(req('/v1/models'), env, {})
  assert.equal(again.status, 401)
  assert.equal(groq, 0)
  assert.equal(kv.puts.length, 0)
})

test('clave incorrecta es 401 y no llama al modelo', async () => {
  resetBurstMemory()
  const kv = kvSpy()
  let groq = 0
  const env = { ...kv, GATEWAY_API_KEY: 'clave-correcta-de-prueba', GROQ_API_KEY: 'groq-test' }
  const res = await handleOpenAIChatCompletions(req('/v1/chat/completions', {
    method: 'POST',
    key: 'otra-clave-distinta',
    body: { messages: [{ role: 'user', content: 'hola' }] }
  }), env, null, { callGroqChat: async () => { groq += 1; return { ok: true, response: new Response('{}') } }, corsHeaders: {} })
  assert.equal(res.status, 401)
  assert.equal(groq, 0)
  assert.equal(kv.puts.length, 0)
})

test('la ráfaga de /v1 corta antes del modelo y de KV', async () => {
  resetBurstMemory()
  resetCounterMemory()
  const kv = kvSpy()
  let groq = 0
  const env = {
    ...kv,
    GATEWAY_API_KEY: 'clave-correcta-de-prueba',
    GROQ_API_KEY: 'groq-test',
    V1_BURST_PER_MIN: '2'
  }
  const call = () => handleOpenAIChatCompletions(req('/v1/chat/completions', {
    method: 'POST',
    key: 'clave-correcta-de-prueba',
    body: { messages: [{ role: 'user', content: 'hola' }] }
  }), env, null, {
    callGroqChat: async () => {
      groq += 1
      return { ok: true, response: new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { headers: { 'Content-Type': 'application/json' } }) }
    },
    corsHeaders: {}
  })
  assert.equal((await call()).status, 200)
  assert.equal((await call()).status, 200)
  const blocked = await call()
  assert.equal(blocked.status, 429)
  assert.equal(groq, 2)
  assert.equal(kv.puts.length, 0)
})
