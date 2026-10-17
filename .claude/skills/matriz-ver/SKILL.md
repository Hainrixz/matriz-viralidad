---
name: matriz-ver
description: >-
  Mira UN video por su link (YouTube, TikTok, Instagram, X…) o desde un archivo y te dice cómo está
  hecho: hook literal, primeros 3 segundos, estructura, emoción y CTA. Usa la skill `watch` si la
  tienes (oye por subtítulos o Whisper y ve los fotogramas); si no, baja el video y lo lee por
  fotogramas. Úsala con "mira este video", "analiza este reel", "por qué funcionó esto" + un link.
argument-hint: "<url-o-ruta-del-video>"
---

# /matriz-ver — ver un video suelto

Un video suelto te dice **cómo está hecho**, no si funcionó: sin la cuenta completa no hay mediana, así
que su `RENDIMIENTO` va `s/d`. Para saber si funcionó, `/matriz-espiar <handle> <red>`.

## RAIZ — dónde están los scripts

Raíz del plugin: ${CLAUDE_PLUGIN_ROOT}

Si la línea de arriba muestra una ruta absoluta, `RAIZ` es esa ruta (modo plugin). Si en cambio
muestra el marcador sin sustituir (un texto con signo de dólar y llaves), estás en modo clon: `RAIZ` es
la carpeta actual (`ls scripts/apify.mjs` lo confirma). En los comandos, `<RAIZ>` se reemplaza por ese
valor. Los datos de la persona viven siempre en la carpeta actual.

Si al despachar un subagente (`espia`, `analista-video`, `matricero`, `simulador`, `validador`…) el sistema no lo
encuentra con ese nombre, estás en modo plugin: usa el nombre con prefijo, p. ej. `matriz-viralidad:espia`.

---

## Paso 0 — qué camino hay

```bash
node "<RAIZ>/scripts/revisar.mjs" todo
```

Solo videos **públicos**. Si el link es de una cuenta privada o pide login, dilo y para.

| Camino | Cuándo | Qué percibe | Costo |
|---|---|---|---|
| **C — `watch`** | la skill `watch` está instalada (`skill_watch.instalada`) | **subtítulos o audio (Whisper)** + fotogramas | $0 si el video trae subtítulos; con Whisper por API, el costo de tu proveedor |
| **A — Gemini** | hay `GEMINI_API_KEY` y `MATRIZ_ANALIZADOR` no es `local` | **el audio** | ~$0.003–0.011 por video |
| **B — fotogramas** | siempre disponible con `ffmpeg` | solo lo que se **ve** (subtítulo quemado) | $0 de API, ~25 mil tokens de contexto |

Orden de preferencia: C si está; si no, A si hay llave; si no, B. La persona puede forzar otro. Dilo en
una línea ("lo analizo con X porque …").

> `watch` es un plugin aparte (https://github.com/bradautomates/claude-video). Si no lo tiene y quiere
> el Camino C: `/plugin marketplace add bradautomates/claude-video` y luego
> `/plugin install watch@claude-video`. Para Instagram, `yt-dlp` a veces pide cookies; si falla,
> el Camino B con el archivo descargado a mano sigue funcionando.

## Camino C — con `watch`

1. Invoca la skill con **Skill** (`watch:watch`) pasando el link. Pide detalle `efficient` para el
   video completo y, aparte, una pasada enfocada en los primeros segundos (`--start 0 --end 6`) para el
   hook. Sigue sus instrucciones (instalación de binarios, etc.); si te pide una llave de Whisper, es de
   la persona: dile dónde va y no la leas.
2. Con el transcript y los fotogramas, escribe el JSON de las 7 claves **exactamente** como está
   especificado en `.claude/agents/analista-video.md` (Paso 4): `hook_visual`, `hook_texto` (primeras
   1–2 frases **literales** del transcript, entre comillas; si el transcript no existe, `s/d`),
   `primeros_3s`, `estructura`, `emocion`, `cta` (`ninguno` solo si el transcript completo cubre el
   final y no hay llamada a la acción), `duracion_seg` (medida con `ffprobe`, no estimada).
3. `_meta`: `{"analizador": "watch+claude", "hook_fuente": "captions" | "whisper", "duracion_fuente": "ffprobe", "costo_usd": <s/d si no lo sabes>, "notas": "...", "analizado_en": "<ISO>"}`.

## Camino A / B — con archivo local

Si no usas `watch`: baja el video público a `videos/` (para links de YouTube/TikTok/Instagram que no son
un archivo directo, usa `yt-dlp -o "videos/suelto-<id>.%(ext)s" "<url>"`) y despacha el subagente
`analista-video` (Agent, `subagent_type: "analista-video"`) pasándole la ruta, el valor de `RAIZ` y que es
una pieza suelta. Él elige Gemini o fotogramas y escribe `transcripciones/<id>.json`.

## Cierre

- Guarda el resultado en `transcripciones/suelto-<id>.json` (mismo esquema, `RENDIMIENTO` no aplica).
- Resume en el chat, en 6 líneas máximo: el hook literal, qué pasa en los 3 primeros segundos, la
  estructura, la emoción, el CTA y **por qué camino salió** (y qué se pierde por no oír el audio, si
  fue el B).
- Todo lo que no se pudo observar queda `s/d`, dicho. No uses el caption como si fuera el hook.
- Si la persona quiere ir más allá: `/matriz-espiar <handle> <red>` para ver si ese video fue un acierto
  o una casualidad dentro de su cuenta.
