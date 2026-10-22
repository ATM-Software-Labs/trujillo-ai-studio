/**
 * POST /v1/chat/completions y GET /v1/models en ai.trujillomingorance.com.
 * Formato OpenAI (texto o imagen en data URL). La inferencia usa la clave Groq
 * del worker y la escalera de visión ya definida en ops.js. No sustituye el
 * system prompt del cliente: NutriFit necesita el suyo para devolver JSON.
 */
import { bumpOps, parseDataImage, VISION_MODELS } from './ops.js'

const CUPO_DIARIO = 400
const MAX_MENSAJES = 8

export function rutaOpenAI(pathname) {
  const p = String(pathname || '').replace(/\/+$/, '') || '/'
  if (p === '/v1/chat/completions') return 'completions'
  if (p === '/v1/models') return 'models'
  return null
}

function json(data, status, corsHeaders, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=UTF-8', ...extra },
  })
}

function errorOpenAI(message, status, type, corsHeaders) {
  return json({ error: { message, type, code: type } }, status, corsHeaders)
}

/** Comparación en tiempo constante. Longitudes distintas no llegan a subtle. */
async function bearerValido(request, esperado) {
  if (!esperado) return true
  const header = request.headers.get('Authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const a = new TextEncoder().encode(token)
  const b = new TextEncoder().encode(esperado)
  if (a.byteLength !== b.byteLength || a.byteLength === 0) return false
  return crypto.subtle.timingSafeEqual(a, b)
}

/**
 * Deja system/user/assistant. Una imagen solo se acepta como data URL jpeg/png/webp/gif.
 * Con imagen se conservan los system y el último mensaje del usuario (evita el 429 por historial).
 */
export function prepararMensajesOpenAI(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: 'messages es obligatorio' }
  }
  const planos = []
  let hayImagen = false
  let imagenInvalida = false
  for (const m of messages.slice(0, MAX_MENSAJES)) {
    if (!m || (m.role !== 'system' && m.role !== 'user' && m.role !== 'assistant')) continue
    if (typeof m.content === 'string') {
      const text = m.content.slice(0, 8000)
      if (text) planos.push({ role: m.role, content: text })
      continue
    }
    if (!Array.isArray(m.content)) continue
    const parts = []
    for (const part of m.content) {
      if (!part || typeof part !== 'object') continue
      if (part.type === 'text' && typeof part.text === 'string') {
        const text = part.text.slice(0, 8000)
        if (text) parts.push({ type: 'text', text })
      } else if (part.type === 'image_url') {
        const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url
        const parsed = parseDataImage({ url })
        if (!parsed) imagenInvalida = true
        else {
          hayImagen = true
          parts.push({ type: 'image_url', image_url: { url: parsed.dataUrl } })
        }
      }
    }
    if (parts.length) planos.push({ role: m.role, content: parts })
  }
  if (imagenInvalida && !hayImagen) return { error: 'La imagen debe ser una data URL jpeg, png, webp o gif de hasta 3 MB' }
  if (!planos.length) return { error: 'No hay mensajes utilizables' }
  if (!hayImagen) return { messages: planos, vision: false }
  const systems = planos.filter((m) => m.role === 'system')
  const ultimoUsuario = [...planos].reverse().find((m) => m.role === 'user' && Array.isArray(m.content))
  if (!ultimoUsuario) return { error: 'La imagen tiene que ir en un mensaje user' }
  return { messages: [...systems.slice(-2), ultimoUsuario], vision: true }
}

async function cupoDisponible(env) {
  if (!env?.BOT_MEMORY) return true
  const key = `openai_v1_${new Date().toISOString().slice(0, 10)}`
  const n = Number(await env.BOT_MEMORY.get(key)) || 0
  if (n >= CUPO_DIARIO) return false
  await env.BOT_MEMORY.put(key, String(n + 1), { expirationTtl: 172800 })
  return true
}

export function handleOpenAIModels(corsHeaders) {
  const data = [
    ...VISION_MODELS.map((id) => ({ id, object: 'model', owned_by: 'trujillo-ai' })),
    { id: 'gpt-4o', object: 'model', owned_by: 'trujillo-ai' },
    { id: 'gpt-4-vision-preview', object: 'model', owned_by: 'trujillo-ai' }
  ]
  return json({ object: 'list', data }, 200, corsHeaders)
}

export async function handleOpenAIChatCompletions(request, env, ctx, { callGroqChat, corsHeaders }) {
  if (!(await bearerValido(request, env.GATEWAY_API_KEY))) {
    return errorOpenAI('Clave inválida', 401, 'invalid_api_key', corsHeaders)
  }
  if (!env.GROQ_API_KEY) {
    return errorOpenAI('Motor de visión sin configurar', 503, 'engine_unconfigured', corsHeaders)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return errorOpenAI('JSON inválido', 400, 'invalid_request_error', corsHeaders)
  }
  if (body?.stream === true) {
    return errorOpenAI('stream no está disponible en este endpoint', 400, 'invalid_request_error', corsHeaders)
  }

  const preparado = prepararMensajesOpenAI(body?.messages)
  if (preparado.error) return errorOpenAI(preparado.error, 400, 'invalid_request_error', corsHeaders)

  if (!(await cupoDisponible(env))) {
    return errorOpenAI('Cupo diario del gateway agotado', 429, 'rate_limit_exceeded', corsHeaders)
  }

  const temperature = typeof body.temperature === 'number' ? Math.min(1, Math.max(0, body.temperature)) : 0.2
  const maxTokens = typeof body.max_tokens === 'number' ? Math.min(2048, Math.max(64, Math.round(body.max_tokens))) : 1200
  let requested = typeof body.model === 'string' && body.model.trim() ? body.model.trim().slice(0, 80) : VISION_MODELS[0]
  if (requested === 'qwen/qwen3.6-27b' || requested === 'qwen/qwen3.6') requested = 'qwen/qwen3.8-27b'
  if (requested === 'gpt-4o' || requested === 'gpt-4-vision-preview' || requested === 'gpt-4o-mini' || requested === 'llama-3.2-11b-vision-preview') requested = VISION_MODELS[0]

  const result = await callGroqChat({
    groqApiKey: env.GROQ_API_KEY,
    messages: preparado.messages,
    requestedModel: requested,
    stream: false,
    maxTokens,
    vision: preparado.vision,
    temperature,
    env,
    ctx,
  })

  if (!result.ok || !result.response) {
    const status = result.status === 429 ? 429 : 502
    return errorOpenAI('El motor no ha podido completar la petición', status, 'api_error', corsHeaders)
  }

  const data = await result.response.json().catch(() => null)
  if (!data || !Array.isArray(data.choices)) {
    return errorOpenAI('Respuesta del motor ilegible', 502, 'api_error', corsHeaders)
  }
  if (ctx) ctx.waitUntil(bumpOps(env, preparado.vision ? 'vision' : 'chats', 1).catch(() => {}))
  return json(data, 200, corsHeaders, { 'X-Trujillo-Model': result.model || requested })
}
