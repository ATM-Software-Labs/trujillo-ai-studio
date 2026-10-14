/**
 * text_tools.js - Motores de Auditoría, Tono, Hooks, Coherencia y Traducción Contextual
 * Powered by Groq LPU (llama-3.3-70b-versatile / llama-3.1-8b-instant) con JSON estricto
 */

export const TOOL_DEFINITIONS = {
  audit: {
    name: 'Auditoría & Detector Sintético Multi-Score',
    description: 'Auditoría estadística (perplejidad, burstiness), simulación GPTZero/Copyleaks y 3 versiones optimizadas.',
    systemPrompt: `Actúa como un motor de auditoría de textos, detector sintético (estilo GPTZero/Copyleaks) y optimizador multiformato de nivel empresarial. Analiza el texto de entrada bajo criterios estadísticos (perplejidad, varianza/burstiness), evalúa su calidad y devuelve estrictamente un objeto JSON válido (sin bloques de código markdown adicionales, solo el JSON plano) con la siguiente estructura exacta:

{
  "scores": {
    "global_quality": <número entero 0-100>,
    "ai_probability": <número entero 0-100 que indique la probabilidad estimada de ser detectado como IA>,
    "perplexity": <número entero 0-100 que mida la complejidad y variedad léxica>,
    "burstiness": <número entero 0-100 que mida la naturalidad en la alternancia de longitud de frases>,
    "grammar": <número entero 0-100>
  },
  "diagnostico_detectores": {
    "gptzero_simulacion": "Diagnóstico breve de cómo catalogaría este texto GPTZero basándose en su uniformidad y patrones sintácticos.",
    "copyleaks_simulacion": "Evaluación estimada de predictibilidad de tokens y repetición léxica."
  },
  "analisis_critico": "Breve análisis de 2 o 3 frases sobre los puntos débiles del texto original (muletillas, tono plano, etc.).",
  "versiones": {
    "humanizada_antidetector": "Versión reescrita rompiendo patrones robóticos, introduciendo pausas orgánicas y variando drásticamente la estructura de las oraciones sin alterar ni un solo dato, cifra o sentido original.",
    "seo_optimizada": "Versión adaptada para buscadores, mejorando la retención de lectura y la naturalidad de términos clave.",
    "resumen_ejecutivo": "Versión en viñetas (bullet points) directa al grano con los puntos clave del texto."
  }
}`,
    buildUserPrompt: (text) => `Texto de entrada a procesar:\n"""\n${text}\n"""`
  },

  sentiment: {
    name: 'Detector de Tono y Emoción',
    description: 'Análisis sociolingüístico y de marketing: tono, intención, emoción y formalidad 0-100.',
    systemPrompt: `Actúa como un analista de marketing y sociolingüística. Analiza el texto proporcionado e identifica el tono predominante, la intención comunicativa y la emoción que transmite al lector.

Devuelve estrictamente un objeto JSON válido (sin bloques de código markdown adicionales) con la siguiente estructura:

{
  "tono_principal": "Ej: Formal, Persuasivo, Académico, Casual, etc.",
  "intencion": "Ej: Informar, Vender, Argumentar, Educar",
  "emocion_detectada": "Ej: Neutro, Entusiasta, Urgente, Empático",
  "nivel_formalidad": <número entero de 0 a 100 donde 0 es informal y 100 es ultraformal>,
  "sugerencia_ajuste": "Breve recomendación sobre si el tono actual es adecuado para su objetivo o si debería modificarse."
}`,
    buildUserPrompt: (text) => `Texto de entrada:\n"""\n${text}\n"""`
  },

  hooks: {
    name: 'Generador de Titulares / Hooks Virales',
    description: 'Copywriting de alta conversión con 3 ángulos: curiosidad, dolor/beneficio y dato contracorriente.',
    systemPrompt: `Actúa como un experto en copywriting viral y estrategias de conversión en redes sociales (X, LinkedIn) y blogs. A partir del texto proporcionado, genera alternativas de ganchos (headlines o titulares) altamente atractivos que capten la atención en los primeros 3 segundos.

Devuelve estrictamente un objeto JSON válido con la siguiente estructura:

{
  "titulares_gancho": [
    "Titular 1 enfocado en curiosidad o misterio",
    "Titular 2 enfocado en beneficio directo o dolor del lector",
    "Titular 3 enfocado en dato impactante o contracorriente"
  ]
}`,
    buildUserPrompt: (text) => `Texto de entrada:\n"""\n${text}\n"""`
  },

  proofread: {
    name: 'Corrector de Estilo y Coherencia Profunda',
    description: 'Detección de saltos de lógica, ambigüedades, redundancias conceptuales y texto corregido.',
    systemPrompt: `Actúa como un corrector de estilo literario y redactor jefe. Analiza el siguiente texto en busca de errores de coherencia, ambigüedades, redundancias conceptuales y problemas de cohesión entre párrafos.

Devuelve estrictamente un objeto JSON válido con la siguiente estructura:

{
  "errores_detectados": [
    {
      "tipo": "Ej: Redundancia / Ambigüedad / Salto de lógica",
      "descripcion": "Explicación breve del fallo encontrado en el texto original."
    }
  ],
  "texto_corregido_estilo": "Versión corregida aplicando rigor ortotipográfico, fluidez gramatical y máxima cohesión textual, sin alterar los datos ni la longitud sustancial del mensaje."
}`,
    buildUserPrompt: (text) => `Texto de entrada:\n"""\n${text}\n"""`
  },

  translate: {
    name: 'Traductor Contextual Nativo con Adaptación Cultural',
    description: 'Traducción y localización adaptada al modismo local con notas explicativas.',
    systemPrompt: (opts = {}) => `Actúa como un traductor profesional nativo y especialista en localización de contenidos. Traduce el siguiente texto al idioma de destino solicitado manteniendo el registro, el matiz emocional y adaptando las expresiones idiomáticas de forma natural.

Idioma de destino: ${opts.targetLanguage || 'inglés'}

Devuelve estrictamente un objeto JSON válido con la siguiente estructura:

{
  "traduccion_localizada": "Texto traducido con modismos y expresiones naturales del idioma de destino.",
  "notas_traductor": "Breve nota sobre adaptación de términos complejos o culturales si los hubiera."
}`,
    buildUserPrompt: (text) => `Texto de entrada:\n"""\n${text}\n"""`
  }
};

/**
 * Limpia y parsea de forma segura respuestas JSON devueltas por el LLM.
 */
export function safeExtractJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Respuesta del modelo vacía');
  }

  let text = rawText.trim();

  // Eliminar bloques ```json ... ``` si el modelo los incluyó
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  }

  // Si aún hay texto antes del primer '{' o después del último '}'
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }

  return JSON.parse(text);
}

/**
 * Manejador principal para el endpoint /api/tools
 */
export async function handleTextToolsRequest(request, env, ctx, corsHeaders) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: 'Cuerpo de la petición inválido (JSON esperado).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { action, text, targetLanguage = 'inglés', model } = body;

    if (!action || !TOOL_DEFINITIONS[action]) {
      return new Response(JSON.stringify({
        error: `Acción no soportada: '${action}'. Acciones válidas: ${Object.keys(TOOL_DEFINITIONS).join(', ')}`
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!text || typeof text !== 'string' || text.trim().length < 5) {
      return new Response(JSON.stringify({ error: 'El texto debe contener al menos 5 caracteres.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tool = TOOL_DEFINITIONS[action];
    const systemPrompt = typeof tool.systemPrompt === 'function'
      ? tool.systemPrompt({ targetLanguage })
      : tool.systemPrompt;
    const userPrompt = tool.buildUserPrompt(text);

    const groqKey = request.headers.get('x-groq-user-key') || env.GROQ_API_KEY;
    if (!groqKey) {
      return new Response(JSON.stringify({ error: 'Falta la clave API de Groq configurada en el servidor.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Escalera de modelos para inferencia estructurada ultrarrápida
    const modelsToTry = [
      model,
      'llama-3.3-70b-versatile',
      'openai/gpt-oss-120b',
      'llama-3.1-8b-instant',
      'openai/gpt-oss-20b'
    ].filter(Boolean);

    const attemptErrors = [];
    let resultJson = null;
    let usedModel = '';

    for (const modelCandidate of modelsToTry) {
      try {
        const payload = {
          model: modelCandidate,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: action === 'hooks' ? 0.7 : 0.2,
          response_format: { type: 'json_object' },
          max_tokens: 3000
        };

        if (modelCandidate.includes('gpt-oss')) {
          payload.reasoning_format = 'hidden';
          payload.reasoning_effort = 'low';
        }

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!groqRes.ok) {
          const errText = await groqRes.text().catch(() => '');
          attemptErrors.push(`[${modelCandidate}] HTTP ${groqRes.status}: ${errText}`);
          continue;
        }

        const data = await groqRes.json();
        const content = data.choices?.[0]?.message?.content || '';
        resultJson = safeExtractJson(content);
        usedModel = modelCandidate;
        break;
      } catch (err) {
        attemptErrors.push(`[${modelCandidate}] Error: ${err.message}`);
      }
    }

    if (!resultJson) {
      throw new Error(`Falló en todos los modelos: ${attemptErrors.join(' | ')}`);
    }

    return new Response(JSON.stringify({
      success: true,
      action,
      model: usedModel,
      data: resultJson
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: `Error ejecutando la herramienta de texto: ${error.message}`
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
