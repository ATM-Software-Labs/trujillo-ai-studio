// Turnstile opcional. Sin TURNSTILE_SECRET_KEY (o TURNSTILE_SECRET) no se exige
// token, para no romper el alta el día del deploy. Con el secreto puesto,
// la verificación falla cerrada: success, action y hostname.

const DEFAULT_HOSTS = 'ai.trujillomingorance.com';

function expectedHosts(env) {
  const raw = String(env?.TURNSTILE_HOSTNAMES || DEFAULT_HOSTS);
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

function secretOf(env) {
  return String(env?.TURNSTILE_SECRET_KEY || env?.TURNSTILE_SECRET || '').trim();
}

export function turnstileEnabled(env) {
  return !!secretOf(env);
}

export async function verifyTurnstile(env, { token, ip, action } = {}) {
  const secret = secretOf(env);
  if (!secret) return { ok: true, skipped: true };
  const value = typeof token === 'string' ? token.trim() : '';
  if (!value || value.length > 2048) {
    return { ok: false, error: 'Confirma que no eres un bot.' };
  }
  const hosts = expectedHosts(env);
  if (!hosts.size || !action) return { ok: false, error: 'Verificación no disponible.' };
  let result;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: value,
        remoteip: String(ip || '')
      })
    });
    if (!res.ok) return { ok: false, error: 'No se pudo verificar el captcha.' };
    result = await res.json();
  } catch {
    return { ok: false, error: 'No se pudo verificar el captcha.' };
  }
  const host = String(result?.hostname || '').toLowerCase();
  if (!result?.success || result.action !== action || !hosts.has(host)) {
    return { ok: false, error: 'Confirma que no eres un bot.' };
  }
  return { ok: true };
}
