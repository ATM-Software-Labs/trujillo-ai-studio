### 🐛 Bug: 429 Request Too Large (ITPM Limit Exceeded en Vision Calls)

**Descripción:**
Al procesar peticiones multimodales (imagen + texto) con `qwen/qwen3.8-27b` en el tier On-Demand de Groq, la petición supera el límite de 7.000 ITPM (disparando picos de 7.900 - 8.300 tokens) debido a la acumulación de historial de chat y resolución de imagen sin comprimir.

**Acciones requeridas:**
1. **Downscaling en cliente/middleware:** Comprimir y redimensionar las imágenes a un máximo de 768px en su lado más largo antes de codificar en base64/data URL.
2. **Context Pruning para Vision:** Al detectar adjuntos (`image_url`), podar el array `messages`: enviar únicamente el system prompt compacto y el último mensaje del usuario (descartando turnos previos extensos).
3. **System Prompt Lean:** Reducir el system prompt por defecto para llamadas multimodales.
