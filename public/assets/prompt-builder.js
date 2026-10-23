/* Trujillo AI — visual prompt builder (lazy-loaded by prompts.js). */
(function () {
  'use strict';
  if (!window.TAP) return;
  var U = window.TAP._;
  var el = U.el;
  var T = {
    es: {
      tpl: 'Plantilla', free: 'Libre', tplA: 'Experto con estructura', tplB: 'Revisión en dos fases',
      role: 'Rol', rolePh: 'Ej.: experto en marketing B2B', task: 'Tarea', taskPh: '¿Qué necesitas exactamente?',
      ctx: 'Contexto', ctxPh: 'Datos, público, restricciones… (opcional)', fmt: 'Formato de salida', tone: 'Tono', len: 'Longitud',
      area: 'Área de experiencia', areaPh: 'Ej.: ciberseguridad', goal: 'Objetivo', goalPh: 'Ej.: proteger mi tienda online',
      crit: 'Criterios de revisión', input: 'Texto o código a revisar', inputPh: 'Pega aquí el texto o el código',
      preview: 'Vista previa', insert: 'Insertar', send: 'Enviar', fav: 'Guardar favorito', cancel: 'Cancelar',
      previewNote: 'Los campos vacíos quedan como [VARIABLES] para rellenarlas después.',
      formats: [['', 'Sin preferencia'], ['text', 'texto en párrafos'], ['bullets', 'lista de puntos'], ['table', 'tabla'], ['steps', 'pasos numerados'], ['json', 'JSON válido'], ['code', 'bloque de código comentado'], ['email', 'email listo para enviar']],
      tones: [['', 'Sin preferencia'], ['profesional', 'Profesional'], ['cercano', 'Cercano'], ['directo', 'Directo'], ['formal', 'Formal'], ['didáctico', 'Didáctico'], ['persuasivo', 'Persuasivo']],
      lens: [['', 'Sin preferencia'], ['short', 'Breve'], ['medium', 'Media'], ['long', 'Detallada']],
      lenTxt: { short: 'breve (máximo 120 palabras)', medium: 'media (unas 300 palabras)', long: 'detallada y exhaustiva' },
      crits: ['Claridad', 'Eficiencia', 'Estilo'],
      V: { role: '[ROL]', task: '[TAREA]', area: '[ÁREA]', goal: '[OBJETIVO]', tone: '[TONO]', crit: '[CLARIDAD / EFICIENCIA / ESTILO]', input: '[TEXTO O CÓDIGO]' },
      free1: function (r) { return 'Actúa como ' + r + '.'; }, freeTask: 'Tarea: ', freeCtx: 'Contexto: ', freeFmt: 'Formato de salida: ', freeTone: 'Tono: ', freeLen: 'Longitud: ',
      A: function (a, g, t) { return 'Actúa como un experto en ' + a + '. Tu objetivo es ayudarme a ' + g + '. Para ello, sigue estrictamente esta estructura en tu respuesta: 1. Análisis previo, 2. Paso a paso detallado y 3. Posibles riesgos o alternativas. Mantén un tono ' + t + ' y sé directo.'; },
      B: function (c) { return 'Revisa el siguiente texto/código bajo los criterios de ' + c + '. No lo reescribas todo directamente a menos que sea necesario; primero haz una lista con los 3 principales puntos de mejora y luego proporciona la versión optimizada.'; },
      join: ' y '
    },
    en: {
      tpl: 'Template', free: 'Free form', tplA: 'Structured expert', tplB: 'Two-phase review',
      role: 'Role', rolePh: 'E.g. B2B marketing expert', task: 'Task', taskPh: 'What exactly do you need?',
      ctx: 'Context', ctxPh: 'Data, audience, constraints… (optional)', fmt: 'Output format', tone: 'Tone', len: 'Length',
      area: 'Field of expertise', areaPh: 'E.g. cybersecurity', goal: 'Goal', goalPh: 'E.g. secure my online shop',
      crit: 'Review criteria', input: 'Text or code to review', inputPh: 'Paste the text or code here',
      preview: 'Preview', insert: 'Insert', send: 'Send', fav: 'Save favourite', cancel: 'Cancel',
      previewNote: 'Empty fields stay as [VARIABLES] so you can fill them in later.',
      formats: [['', 'No preference'], ['text', 'prose paragraphs'], ['bullets', 'bullet list'], ['table', 'table'], ['steps', 'numbered steps'], ['json', 'valid JSON'], ['code', 'commented code block'], ['email', 'ready-to-send email']],
      tones: [['', 'No preference'], ['professional', 'Professional'], ['friendly', 'Friendly'], ['direct', 'Direct'], ['formal', 'Formal'], ['educational', 'Educational'], ['persuasive', 'Persuasive']],
      lens: [['', 'No preference'], ['short', 'Short'], ['medium', 'Medium'], ['long', 'Detailed']],
      lenTxt: { short: 'short (120 words max)', medium: 'medium (about 300 words)', long: 'detailed and thorough' },
      crits: ['Clarity', 'Efficiency', 'Style'],
      V: { role: '[ROLE]', task: '[TASK]', area: '[FIELD]', goal: '[GOAL]', tone: '[TONE]', crit: '[CLARITY / EFFICIENCY / STYLE]', input: '[TEXT OR CODE]' },
      free1: function (r) { return 'Act as ' + r + '.'; }, freeTask: 'Task: ', freeCtx: 'Context: ', freeFmt: 'Output format: ', freeTone: 'Tone: ', freeLen: 'Length: ',
      A: function (a, g, t) { return 'Act as an expert in ' + a + '. Your goal is to help me ' + g + '. To do so, strictly follow this structure in your answer: 1. Prior analysis, 2. Detailed step by step, and 3. Possible risks or alternatives. Keep a ' + t + ' tone and be direct.'; },
      B: function (c) { return 'Review the following text/code against the criteria of ' + c + '. Do not rewrite everything straight away unless necessary; first list the 3 main points for improvement and then provide the optimised version.'; },
      join: ' and '
    },
    ca: {
      tpl: 'Plantilla', free: 'Lliure', tplA: 'Expert amb estructura', tplB: 'Revisió en dues fases',
      role: 'Rol', rolePh: 'Ex.: expert en màrqueting B2B', task: 'Tasca', taskPh: 'Què necessites exactament?',
      ctx: 'Context', ctxPh: 'Dades, públic, restriccions… (opcional)', fmt: 'Format de sortida', tone: 'To', len: 'Llargada',
      area: 'Àrea d’experiència', areaPh: 'Ex.: ciberseguretat', goal: 'Objectiu', goalPh: 'Ex.: protegir la meva botiga en línia',
      crit: 'Criteris de revisió', input: 'Text o codi a revisar', inputPh: 'Enganxa aquí el text o el codi',
      preview: 'Previsualització', insert: 'Insereix', send: 'Envia', fav: 'Desa com a preferit', cancel: 'Cancel·la',
      previewNote: 'Els camps buits queden com a [VARIABLES] per omplir-les després.',
      formats: [['', 'Sense preferència'], ['text', 'text en paràgrafs'], ['bullets', 'llista de punts'], ['table', 'taula'], ['steps', 'passos numerats'], ['json', 'JSON vàlid'], ['code', 'bloc de codi comentat'], ['email', 'correu llest per enviar']],
      tones: [['', 'Sense preferència'], ['professional', 'Professional'], ['proper', 'Proper'], ['directe', 'Directe'], ['formal', 'Formal'], ['didàctic', 'Didàctic'], ['persuasiu', 'Persuasiu']],
      lens: [['', 'Sense preferència'], ['short', 'Breu'], ['medium', 'Mitjana'], ['long', 'Detallada']],
      lenTxt: { short: 'breu (màxim 120 paraules)', medium: 'mitjana (unes 300 paraules)', long: 'detallada i exhaustiva' },
      crits: ['Claredat', 'Eficiència', 'Estil'],
      V: { role: '[ROL]', task: '[TASCA]', area: '[ÀREA]', goal: '[OBJECTIU]', tone: '[TO]', crit: '[CLAREDAT / EFICIÈNCIA / ESTIL]', input: '[TEXT O CODI]' },
      free1: function (r) { return 'Actua com ' + r + '.'; }, freeTask: 'Tasca: ', freeCtx: 'Context: ', freeFmt: 'Format de sortida: ', freeTone: 'To: ', freeLen: 'Llargada: ',
      A: function (a, g, t) { return 'Actua com un expert en ' + a + '. El teu objectiu és ajudar-me a ' + g + '. Per fer-ho, segueix estrictament aquesta estructura a la teva resposta: 1. Anàlisi prèvia, 2. Pas a pas detallat i 3. Possibles riscos o alternatives. Mantén un to ' + t + ' i sigues directe.'; },
      B: function (c) { return 'Revisa el text/codi següent segons els criteris de ' + c + '. No ho reescriguis tot directament si no cal; primer fes una llista amb els 3 punts de millora principals i després proporciona la versió optimitzada.'; },
      join: ' i '
    }
  };
  function sel(opts, val) {
    var s = el('select', { class: 'form-input' });
    opts.forEach(function (o) { s.appendChild(el('option', { value: o[0], text: o[1] })); });
    if (val != null) s.value = val;
    return s;
  }
  function open(prefill) {
    prefill = prefill || {};
    var L = T[U.lang()] || T.en;
    var f = {};
    f.tpl = sel([['free', L.free], ['A', L.tplA], ['B', L.tplB]], prefill.tpl || 'free');
    var roleId = U.currentRoleId();
    var roleName = (roleId !== 'none' && roleId !== 'custom') ? U.roleById(roleId).name.toLowerCase() : '';
    f.role = el('input', { class: 'form-input', type: 'text', placeholder: L.rolePh, list: 'tapb-roles', autocomplete: 'off' });
    f.role.value = roleName;
    var dl = el('datalist', { id: 'tapb-roles' });
    U.roles().forEach(function (r) { if (r.ctx) dl.appendChild(el('option', { value: r.name.toLowerCase() })); });
    f.task = el('textarea', { class: 'form-textarea', rows: '3', placeholder: L.taskPh });
    f.task.value = prefill.task || ((U.input() && U.input().value.trim()) || '');
    f.ctx = el('textarea', { class: 'form-textarea', rows: '2', placeholder: L.ctxPh });
    f.fmt = sel(L.formats, '');
    f.tone = sel(L.tones, '');
    f.len = sel(L.lens, '');
    f.area = el('input', { class: 'form-input', type: 'text', placeholder: L.areaPh, autocomplete: 'off' });
    f.goal = el('input', { class: 'form-input', type: 'text', placeholder: L.goalPh, autocomplete: 'off' });
    var critBox = el('fieldset', { class: 'tapb-crit' }, [el('legend', { class: 'form-label', text: L.crit })]);
    f.crits = L.crits.map(function (c) {
      var cb = el('input', { type: 'checkbox', value: c });
      critBox.appendChild(el('label', { class: 'tapb-check' }, [cb, ' ' + c]));
      return cb;
    });
    f.input = el('textarea', { class: 'form-textarea tapb-code', rows: '4', placeholder: L.inputPh, spellcheck: 'false' });

    var g = function (label, ctrl, key) { var n = U.field(label, ctrl); n.setAttribute('data-k', key); return n; };
    var rows = {
      role: g(L.role, f.role, 'role'), area: g(L.area, f.area, 'area'), goal: g(L.goal, f.goal, 'goal'),
      task: g(L.task, f.task, 'task'), ctx: g(L.ctx, f.ctx, 'ctx'), crit: critBox, input: g(L.input, f.input, 'input'),
      fmt: g(L.fmt, f.fmt, 'fmt'), tone: g(L.tone, f.tone, 'tone'), len: g(L.len, f.len, 'len')
    };
    var trio = el('div', { class: 'tapb-trio' }, [rows.fmt, rows.tone, rows.len]);
    var form = el('div', { class: 'tapb-form' }, [g(L.tpl, f.tpl, 'tpl'), rows.role, rows.area, rows.goal, rows.task, rows.crit, rows.input, rows.ctx, trio, dl]);
    var prevId = 'tapb-prev-' + Date.now();
    var prev = el('pre', { class: 'tapb-preview', id: prevId, tabindex: '0', 'aria-label': L.preview });
    var side = el('div', { class: 'tapb-side' }, [
      el('div', { class: 'form-label', text: L.preview }), prev, el('p', { class: 'tapb-note', text: L.previewNote })
    ]);
    var body = el('div', { class: 'tapb-grid' }, [form, side]);

    function build() {
      var tpl = f.tpl.value, out = [], tone = f.tone.value, lenK = f.len.value;
      var fmtOpt = L.formats.filter(function (o) { return o[0] === f.fmt.value; })[0];
      var fmt = f.fmt.value ? fmtOpt[1] : '';
      var ctx = f.ctx.value.trim();
      if (tpl === 'A') {
        out.push(L.A(f.area.value.trim() || L.V.area, f.goal.value.trim() || L.V.goal, tone || L.V.tone));
        if (ctx) out.push(L.freeCtx + ctx);
        var ex = [];
        if (fmt) ex.push(L.freeFmt + fmt + '.');
        if (lenK) ex.push(L.freeLen + L.lenTxt[lenK] + '.');
        if (ex.length) out.push(ex.join(' '));
      } else if (tpl === 'B') {
        var cs = f.crits.filter(function (c) { return c.checked; }).map(function (c) { return c.value.toLowerCase(); });
        var crit = cs.length ? (cs.length === 1 ? cs[0] : cs.slice(0, -1).join(', ') + L.join + cs[cs.length - 1]) : L.V.crit;
        out.push(L.B(crit));
        if (ctx) out.push(L.freeCtx + ctx);
        var ex2 = [];
        if (fmt) ex2.push(L.freeFmt + fmt + '.');
        if (tone) ex2.push(L.freeTone + tone + '.');
        if (lenK) ex2.push(L.freeLen + L.lenTxt[lenK] + '.');
        if (ex2.length) out.push(ex2.join(' '));
        out.push(f.input.value.trim() || L.V.input);
      } else {
        var r = f.role.value.trim();
        if (r) out.push(L.free1(r));
        out.push(L.freeTask + (f.task.value.trim() || L.V.task));
        if (ctx) out.push(L.freeCtx + ctx);
        var ex3 = [];
        if (fmt) ex3.push(L.freeFmt + fmt + '.');
        if (tone) ex3.push(L.freeTone + tone + '.');
        if (lenK) ex3.push(L.freeLen + L.lenTxt[lenK] + '.');
        if (ex3.length) out.push(ex3.join('\n'));
      }
      return out.join('\n\n');
    }
    function layout() {
      var tpl = f.tpl.value;
      rows.role.hidden = tpl !== 'free';
      rows.task.hidden = tpl !== 'free';
      rows.area.hidden = tpl !== 'A';
      rows.goal.hidden = tpl !== 'A';
      rows.crit.hidden = tpl !== 'B';
      rows.input.hidden = tpl !== 'B';
    }
    function paint() { layout(); var t = build(); prev.innerHTML = ''; var last = 0; window.TAP.findVars(t).forEach(function (v) { prev.appendChild(document.createTextNode(t.slice(last, v.start))); prev.appendChild(el('mark', { class: 'tap-mark-inline', text: v.token })); last = v.end; }); prev.appendChild(document.createTextNode(t.slice(last))); }
    body.addEventListener('input', paint);
    body.addEventListener('change', paint);
    var opener = document.getElementById('tap-builder-pill');
    var d = U.dialog({
      title: U.s('builderTitle'), body: body, wide: true, returnFocus: U.input(), initialFocus: f.tpl,
      buttons: [
        U.btn(L.cancel, '', function () { d.close(); }),
        U.btn(L.fav, '', function () { var t = build(); d.close(); setTimeout(function () { U.openFavDialog({ text: t }); }, 30); }),
        U.btn(L.insert, '', function () { var t = build(); d.close(); window.TAP.insertPrompt(t); }),
        U.btn(L.send, 'primary', function () {
          var t = build(); d.close(); window.TAP.insertPrompt(t);
          var sb = document.getElementById('send-btn'); if (sb) sb.click();
        })
      ]
    });
    d.card.classList.add('tapb-card');
    void opener;
    paint();
  }
  window.TAPBuilder = { open: open };
})();
