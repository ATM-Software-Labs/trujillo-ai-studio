// Límite barato antes de cualquier escritura o llamada al modelo.
// Orden: memoria del isolate, binding de Workers Rate Limiting si existe,
// y Cache API del colo. Nada de esto escribe en KV.

const buckets = new Map();

export function resetBurstMemory() {
  buckets.clear();
}

export function flagOn(env, name) {
  const v = String(env?.[name] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function intEnv(env, name, fallback) {
  const raw = env?.[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function memoryAllow(key, limit, windowMs, now = Date.now()) {
  const cap = Math.max(1, Number(limit) || 1);
  const window = Math.max(1000, Number(windowMs) || 60000);
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { n: 0, resetAt: now + window };
  }
  bucket.n += 1;
  buckets.set(key, bucket);
  if (buckets.size > 4000) {
    const oldest = buckets.keys().next().value;
    if (oldest) buckets.delete(oldest);
  }
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return { ok: bucket.n <= cap, retryAfter, count: bucket.n };
}

async function cacheAllow(key, limit, windowSec) {
  let cache = null;
  try { cache = caches?.default; } catch { return null; }
  if (!cache || typeof cache.match !== 'function') return null;
  const req = new Request('https://rate-limit.trujillo.internal/' + encodeURIComponent(String(key).slice(0, 180)));
  const now = Date.now();
  let count = 0;
  let resetAt = now + windowSec * 1000;
  try {
    const hit = await cache.match(req);
    if (hit) {
      const data = await hit.json();
      if (data && data.resetAt > now) {
        count = Number(data.count) || 0;
        resetAt = Number(data.resetAt) || resetAt;
      }
    }
  } catch {
    return null;
  }
  count += 1;
  const ttl = Math.max(1, Math.ceil((resetAt - now) / 1000));
  const body = JSON.stringify({ count, resetAt });
  try {
    await cache.put(req, new Response(body, {
      headers: { 'Cache-Control': `public, max-age=${ttl}` }
    }));
  } catch {
    // El conteo en memoria ya decidió. La caché es solo un refuerzo.
  }
  return { ok: count <= limit, retryAfter: ttl, count };
}

export async function burstAllow(env, { key, limit, windowSec = 60, binding, bindingKey } = {}) {
  const safeLimit = Math.max(1, Number(limit) || 1);
  const local = memoryAllow(`b:${key}`, safeLimit, windowSec * 1000);
  if (!local.ok) return local;
  if (binding && typeof binding.limit === 'function') {
    try {
      const res = await binding.limit({ key: String(bindingKey || key).slice(0, 128) });
      if (res && res.success === false) {
        return { ok: false, retryAfter: windowSec, count: safeLimit + 1 };
      }
    } catch (err) {
      console.warn('rate limit binding:', err?.message || err);
    }
  }
  const cached = await cacheAllow(`c:${key}`, safeLimit, windowSec);
  if (cached && cached.ok === false) return cached;
  return local;
}
