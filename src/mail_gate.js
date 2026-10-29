import { consumeCapped } from './counters.js';

const TICKET_TTL = 900;
const MAIL_PER_HOUR = 5;

function ipKey(ip) {
  return String(ip || 'anon').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64);
}

export function honeypotFilled(body) {
  if (!body || typeof body !== 'object') return false;
  const trap = body.website || body.company_url || body.hp || body.url_hp;
  return !!(trap && String(trap).trim());
}

export async function rateMail(env, ip, max = MAIL_PER_HOUR) {
  const hour = new Date().toISOString().slice(0, 13);
  const key = 'mail:' + hour + ':' + ipKey(ip);
  const res = await consumeCapped(env, key, 1, max);
  return { ok: res.allowed, remaining: Math.max(0, max - res.current) };
}

export async function issueMailTicket(env, payload, ip) {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 22);
  const rec = {
    id,
    ip: ipKey(ip),
    createdAt: Date.now(),
    payload
  };
  if (env?.COUNTERS) {
    try {
      await env.COUNTERS.prepare(
        'INSERT INTO mail_tickets (id, payload, created_at) VALUES (?1, ?2, ?3)'
      ).bind(id, JSON.stringify(rec), rec.createdAt).run();
      return id;
    } catch (err) {
      console.warn('D1 mail ticket:', err?.message || err);
    }
  }
  if (env?.BOT_MEMORY) {
    await env.BOT_MEMORY.put('mail_ticket_' + id, JSON.stringify(rec), { expirationTtl: TICKET_TTL });
  }
  return id;
}

export async function consumeMailTicket(env, id, ip) {
  const ticketId = String(id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
  if (!ticketId) return { ok: false, error: 'Ticket no válido' };
  let raw = null;
  if (env?.COUNTERS) {
    try {
      const row = await env.COUNTERS.prepare('SELECT payload FROM mail_tickets WHERE id = ?1').bind(ticketId).first();
      if (row?.payload) {
        raw = row.payload;
        await env.COUNTERS.prepare('DELETE FROM mail_tickets WHERE id = ?1').bind(ticketId).run();
      }
    } catch (err) {
      console.warn('D1 mail ticket read:', err?.message || err);
    }
  }
  if (!raw && env?.BOT_MEMORY) {
    raw = await env.BOT_MEMORY.get('mail_ticket_' + ticketId);
    if (raw) await env.BOT_MEMORY.delete('mail_ticket_' + ticketId);
  }
  if (!raw) return { ok: false, error: 'Confirma de nuevo: el paso anterior caducó.' };
  let rec;
  try { rec = JSON.parse(raw); } catch (e) { rec = null; }
  if (!rec || !rec.payload) return { ok: false, error: 'Ticket no válido' };
  if (Date.now() - (rec.createdAt || 0) < 400) {
    return { ok: false, error: 'Demasiado rápido. Haz clic otra vez.' };
  }
  const sameIp = rec.ip && rec.ip === ipKey(ip);
  if (!sameIp && rec.ip && rec.ip !== 'anon') {
    return { ok: false, error: 'Confirma desde el mismo navegador.' };
  }
  return { ok: true, payload: rec.payload };
}
