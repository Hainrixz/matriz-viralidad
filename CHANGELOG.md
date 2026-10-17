# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico.

## [1.0.0] — 2026-10-17

Primera versión pública como agente de Claude Code (modo clon y modo plugin).

### Agregado
- Agente principal `matriz-viralidad` con arranque automático (`/matriz-start`) y la entrevista de cinco preguntas de la guía.
- 11 skills: `matriz-start`, `matriz-analiticas`, `matriz-espiar`, `matriz-ver`, `matriz-construir`, `matriz-ganador`, `matriz-sentimiento`, `matriz-guion`, `matriz-calendario`, `matriz-rutina`, `matriz-doctor`, más `matriz-metodologia` (el método).
- Subagentes: `espia`, `analista-video`, `matricero`, `sentimiento`, `calendarista`, `simulador` (guiones) y `validador` (audita la matriz).
- Ver videos por tres caminos: Gemini (audio), skill `watch` y fotogramas locales.
- Simulación de guiones con regla de evidencia (alta solo con ≥5 piezas parecidas por encima de 1.5x) y medición de aciertos en la rutina semanal.
- `scripts/similitud.mjs`: comprueba que un guion no copie frases (≥5 palabras) de los videos analizados.
- `scripts/revisar.mjs`: estado de llaves sin mostrarlas, entorno, conteos y gasto del mes.
- `scripts/guardia.mjs` + `hooks/hooks.json`: hook que impide leer el `.env` o imprimir llaves.
- `apify.mjs --estimar`: costo antes de gastar, sin token. Bitácora de gasto real en `.matriz/gasto.jsonl`.
- Hero animado (CSS, claro/oscuro, con variante para `prefers-reduced-motion`), READMEs ES/EN, datos de ejemplo sintéticos, pruebas offline y CI.

### Cambiado respecto al prototipo `matriz-viral` 1.0
- Los precios del catálogo se actualizaron al plan Free de Apify consultado el 2026-10-17 (reels 2.60, posts 2.70, TikTok 3.70, YouTube 4.00, X 0.40 USD por 1,000). La guía original cita precios de plan superior.
- `apify.mjs` rechaza banderas desconocidas. Antes ignoraba en silencio `--max-items` y `--tope-usd`, así que los topes que pedían las skills no se aplicaban.
- Si Apify rechaza el tope en dólares, el script se detiene (antes corría sin tope y solo avisaba). `--sin-tope-usd` lo permite de forma explícita.
- El token viaja en el header `Authorization` y no en la URL; el `.env` solo se busca en la carpeta del proyecto.
- Las skills ya no declaran `allowed-tools` (pre-aprobaba Bash y se saltaba la confirmación de gasto).
- Los cuadrantes de `matriz-ganador` ahora son los mismos de la metodología (oportunidad, saturación, costumbre muerta, ruido) y la regla de evidencia es única (≥5 piezas).
- Las salidas se llaman como en la guía: `matriz/matriz-contenido-viral.md` y `matriz/patrones-de-viralidad.md`.
- Node ≥ 20 (antes pedía 24 por `import.meta.main`).
