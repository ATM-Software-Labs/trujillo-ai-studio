// Contadores atómicos en D1. Si D1 no está creado o la consulta falla,
// el tope se aplica en memoria del isolate. Nunca se escribe KV desde aquí:
// un fallo de D1 no puede volver a agotar el cupo de KV de la cuenta.

const memory = new Map();

export function resetCounterMemory() {
  memory.clear();
}

function remember(key, n) {
  memory.set(key, n);
  if (memory.size > 4000) {
    const oldest = memory.keys().next().value;
    if (oldest) memory.delete(oldest);
  }
}

export async function readCounter(env, key) {
  const db = env?.COUNTERS;
  if (db && typeof db.prepare === 'function') {
    try {
      const row = await db.prepare('SELECT n FROM counters WHERE key = ?1').bind(key).first();
      if (row && row.n != null) {
        const n = Number(row.n) || 0;
        remember(key, n);
        return n;
      }
      return 0;
    } catch (err) {
      console.warn('D1 counter read:', err?.message || err);
    }
  }
  return memory.get(key) || 0;
}

/** Suma delta y devuelve el total. Usado por telemetría, que tolera perder ráfagas. */
export async function addCounter(env, key, delta = 1) {
  const amount = Math.trunc(Number(delta)) || 0;
  if (!amount) return memory.get(key) || 0;
  const db = env?.COUNTERS;
  if (db && typeof db.prepare === 'function') {
    try {
      const row = await db.prepare(
        `INSERT INTO counters (key, n, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET n = n + excluded.n, updated_at = excluded.updated_at
         RETURNING n`
      ).bind(key, amount, Date.now()).first();
      const n = Number(row?.n);
      if (Number.isFinite(n)) {
        remember(key, n);
        return n;
      }
    } catch (err) {
      console.warn('D1 counter add:', err?.message || err);
    }
  }
  const next = (memory.get(key) || 0) + amount;
  remember(key, next);
  return next;
}

async function d1Consume(db, key, amount, limit) {
  const now = Date.now();
  const updated = await db.prepare(
    `UPDATE counters SET n = n + ?1, updated_at = ?2
     WHERE key = ?3 AND n + ?1 <= ?4
     RETURNING n`
  ).bind(amount, now, key, limit).first();
  if (updated && updated.n != null) {
    return { allowed: true, current: Number(updated.n), limit };
  }
  const existing = await db.prepare('SELECT n FROM counters WHERE key = ?1').bind(key).first();
  if (existing && existing.n != null) {
    return { allowed: false, current: Number(existing.n) || 0, limit };
  }
  if (amount > limit) return { allowed: false, current: 0, limit };
  const inserted = await db.prepare(
    `INSERT INTO counters (key, n, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(key) DO NOTHING
     RETURNING n`
  ).bind(key, amount, now).first();
  if (inserted && inserted.n != null) {
    return { allowed: true, current: Number(inserted.n), limit };
  }
  const again = await db.prepare(
    `UPDATE counters SET n = n + ?1, updated_at = ?2
     WHERE key = ?3 AND n + ?1 <= ?4
     RETURNING n`
  ).bind(amount, now, key, limit).first();
  if (again && again.n != null) {
    return { allowed: true, current: Number(again.n), limit };
  }
  const finalRow = await db.prepare('SELECT n FROM counters WHERE key = ?1').bind(key).first();
  return { allowed: false, current: Number(finalRow?.n) || 0, limit };
}

/**
 * Incrementa solo mientras n + amount <= limit.
 * Si ya está en el tope, el UPDATE no modifica filas (sin escritura útil).
 * Nunca abre el cupo si D1 falla.
 */
export async function consumeCapped(env, key, amount, limit) {
  let n = Math.trunc(Number(amount));
  let cap = Math.trunc(Number(limit));
  if (!Number.isFinite(n) || n <= 0) n = 1;
  if (!Number.isFinite(cap) || cap <= 0) return { allowed: false, current: 0, limit: 0 };
  const db = env?.COUNTERS;
  if (db && typeof db.prepare === 'function') {
    try {
      const decision = await d1Consume(db, key, n, cap);
      remember(key, decision.current);
      return decision;
    } catch (err) {
      console.warn('D1 counter consume:', err?.message || err);
    }
  }
  const current = memory.get(key) || 0;
  if (current + n > cap) return { allowed: false, current, limit: cap };
  const next = current + n;
  remember(key, next);
  return { allowed: true, current: next, limit: cap };
}
