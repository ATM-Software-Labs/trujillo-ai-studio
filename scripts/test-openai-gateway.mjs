import assert from 'node:assert/strict'
import test from 'node:test'
import { prepararMensajesOpenAI, rutaOpenAI } from '../src/openai_gateway.js'

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
