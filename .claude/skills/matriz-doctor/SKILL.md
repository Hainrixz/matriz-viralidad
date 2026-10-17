---
name: matriz-doctor
description: >-
  Diagnóstico de Matriz Viralidad: revisa Node, ffmpeg, yt-dlp, la skill watch, tus llaves (sin
  mostrarlas), las carpetas, el perfil y cuánto llevas gastado en Apify este mes, y te dice qué
  arreglar y cómo. Úsala con "no me funciona", "me da error", "qué me falta", "revisa mi instalación".
argument-hint: ""
---

# /matriz-doctor — qué funciona y qué no

## RAIZ — dónde están los scripts

Raíz del plugin: ${CLAUDE_PLUGIN_ROOT}

Si la línea de arriba muestra una ruta absoluta, `RAIZ` es esa ruta (modo plugin). Si en cambio
muestra el marcador sin sustituir (un texto con signo de dólar y llaves), estás en modo clon: `RAIZ` es
la carpeta actual (`ls scripts/apify.mjs` lo confirma). En los comandos, `<RAIZ>` se reemplaza por ese
valor. Los datos de la persona viven siempre en la carpeta actual.

Si al despachar un subagente (`espia`, `analista-video`, `matricero`, `simulador`, `validador`…) el sistema no lo
encuentra con ese nombre, estás en modo plugin: usa el nombre con prefijo, p. ej. `matriz-viralidad:espia`.

---

Corre estas tres cosas (solo lectura; ninguna muestra el valor de una llave):

```bash
node "<RAIZ>/scripts/revisar.mjs" todo
node "<RAIZ>/scripts/revisar.mjs" gasto
ls -a
```

Y comprueba si existen `perfil.json`, `fuentes/`, `transcripciones/`, `matriz/`. Presenta un semáforo
de **una línea por ítem** (✓ / ! / ✗), sin pegar el JSON crudo:

| Ítem | ✓ | Si falla, di exactamente esto |
|---|---|---|
| Node ≥ 20 | `node.ok` | Instala Node LTS desde https://nodejs.org y reabre Claude Code. |
| `APIFY_TOKEN` | `presente` | `FALTA`/`PLACEHOLDER`: copia `.env.example` a `.env` y pega tu token de https://apify.com/sign-up (Settings → API & Integrations). Yo no leo ese archivo. |
| `.env` en esta carpeta | existe | Estás en otra carpeta: los scripts buscan el `.env` en la carpeta donde abriste Claude Code (`carpeta` en el JSON). |
| `GEMINI_API_KEY` | `presente` | Opcional. Sin ella: `watch` o fotogramas. Gratis en https://aistudio.google.com/apikey |
| `ffmpeg` / `ffprobe` | versión | Mac: `brew install ffmpeg`. Sin ellos no hay análisis por fotogramas. |
| `yt-dlp` | versión | Mac: `brew install yt-dlp`. Lo usan `/matriz-ver` y `watch` para links. |
| skill `watch` | instalada | Opcional: `/plugin marketplace add bradautomates/claude-video`. |
| Perfil | `perfil.json` existe | Corre `/matriz-start`. |
| Gasto del mes | `gasto_usd_real` | Solo informativo; si hay corridas sin costo devuelto, dilo (`s/d`). |

Errores frecuentes y su causa:

- **403/404 al descargar un video:** las URL de video de Instagram y TikTok caducan en minutos u horas.
  Vuelve a correr `/matriz-espiar <handle> <red>` y descarga enseguida.
- **«Apify rechazó el token»:** el token está mal pegado (comillas, espacios) o es de otra cuenta.
- **«no encontró nada público»:** handle mal escrito, cuenta privada o sin contenido de ese tipo.
- **Un comando no existe:** en modo plugin llevan prefijo (`/matriz-viralidad:matriz-espiar`); en modo clon
  hay que abrir Claude Code desde la carpeta del repo.
- **Respuestas de Apify cortadas:** abre Claude con `MAX_MCP_OUTPUT_TOKENS=50000 claude` (solo aplica si
  usas el MCP de Apify).

Termina con el primer paso concreto que le toca a la persona. Si todo está en verde, di qué skill sigue.
