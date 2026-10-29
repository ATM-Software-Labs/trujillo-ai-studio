/* Widget opcional. Si no hay TA_TURNSTILE_SITE_KEY, no hace nada y el
   servidor tampoco exige token hasta que exista TURNSTILE_SECRET_KEY. */
(function () {
  var scriptLoading = null;

  function siteKey() {
    return window.TA_TURNSTILE_SITE_KEY || '';
  }

  function loadScript() {
    if (!siteKey()) return Promise.resolve(false);
    if (window.turnstile) return Promise.resolve(true);
    if (scriptLoading) return scriptLoading;
    scriptLoading = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = function () { resolve(true); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
    return scriptLoading;
  }

  function mount(el, action) {
    if (!el || !siteKey() || el.getAttribute('data-mounted')) return;
    el.setAttribute('data-mounted', 'pending');
    loadScript().then(function (ok) {
      if (!ok || !window.turnstile) {
        el.removeAttribute('data-mounted');
        return;
      }
      if (el.__taWidget != null) return;
      el.setAttribute('data-mounted', '1');
      el.__taWidget = window.turnstile.render(el, {
        sitekey: siteKey(),
        action: action,
        theme: 'dark'
      });
    });
  }

  function tokenFrom(el) {
    if (!el || el.__taWidget == null || !window.turnstile) return '';
    try { return window.turnstile.getResponse(el.__taWidget) || ''; } catch (e) { return ''; }
  }

  var slots = {
    '/api/auth/login': { id: 'ts-login', action: 'login' },
    '/api/auth/register': { id: 'ts-register', action: 'signup' },
    '/api/auth/forgot-password': { id: 'ts-forgot', action: 'forgot' },
    '/api/ideas': { id: 'ts-idea', action: 'idea' }
  };

  window.TA_mountTurnstileSlots = function () {
    Object.keys(slots).forEach(function (path) {
      var slot = slots[path];
      var el = document.getElementById(slot.id);
      if (el) mount(el, slot.action);
    });
    var ideaBtn = document.getElementById('idea-send-btn');
    if (ideaBtn && !document.getElementById('ts-idea')) {
      var host = document.createElement('div');
      host.id = 'ts-idea';
      host.style.margin = '8px 0';
      ideaBtn.parentNode.insertBefore(host, ideaBtn);
      mount(host, 'idea');
    }
  };

  if (window.MutationObserver) {
    var obs = new MutationObserver(function () { window.TA_mountTurnstileSlots(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
  document.addEventListener('DOMContentLoaded', function () { window.TA_mountTurnstileSlots(); });

  var origFetch = window.fetch;
  if (!origFetch) return;
  window.fetch = function (input, init) {
    try {
      var rawUrl = typeof input === 'string' ? input : (input && input.url) || '';
      var path = rawUrl;
      try { path = new URL(rawUrl, location.origin).pathname; } catch (e) {}
      init = init ? Object.assign({}, init) : {};
      var headers = new Headers(init.headers || {});
      var token = '';
      try { token = localStorage.getItem('trujillo_ai_token') || localStorage.getItem('auth_token') || ''; } catch (e) {}
      if (token && !headers.has('Authorization') && (path === '/api/image' || path === '/api/share' || path === '/api/chat' || path === '/api/transcribe' || path === '/api/tools' || path === '/api/tools/execute')) {
        headers.set('Authorization', 'Bearer ' + token);
      }
      var slot = slots[path];
      if (slot && typeof init.body === 'string') {
        try {
          var body = JSON.parse(init.body);
          if (body && typeof body === 'object' && !body.turnstileToken) {
            body.turnstileToken = tokenFrom(document.getElementById(slot.id));
            init.body = JSON.stringify(body);
          }
        } catch (e) {}
      }
      init.headers = headers;
    } catch (e) {}
    return origFetch.call(this, input, init);
  };
})();
