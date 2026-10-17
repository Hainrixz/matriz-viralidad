---
name: matriz-espiar
description: Trae el contenido viral de otra cuenta y analiza los videos que tú elijas
argument-hint: "<handle> <red>  |  <url-de-video>"
---

# /matriz-espiar — qué está haciendo el que sí funciona

Dos caminos, según lo que venga en `$ARGUMENTS`:

- **Si empieza con `http`** → es una URL suelta de un video. Ve al **Camino B**.
- **Si son dos palabras** (handle y red) → ve al **Camino A**.
- **Si viene vacío** → pregunta: "¿de qué cuenta y en qué red?" y espera. No adivines.

Redes válidas: `instagram` (reels por defecto), `instagram-posts` si pide carruseles y fotos, `tiktok`,
`youtube`, `x`.

## RAIZ — dónde están los scripts

Raíz del plugin: ${CLAUDE_PLUGIN_ROOT}

Si la línea de arriba muestra una ruta absoluta, `RAIZ` es esa ruta (modo plugin). Si en cambio
muestra el marcador sin sustituir (un texto con signo de dólar y llaves), estás en modo clon: `RAIZ` es
la carpeta actual (`ls scripts/apify.mjs` lo confirma). En los comandos, `<RAIZ>` se reemplaza por ese
valor. Los datos de la persona viven siempre en la carpeta actual.

Si al despachar un subagente (`espia`, `analista-video`, `matricero`, `simulador`, `validador`…) el sistema no lo
encuentra con ese nombre, estás en modo plugin: usa el nombre con prefijo, p. ej. `matriz-viralidad:espia`.

---

## Antes de empezar

- `node "<RAIZ>/scripts/revisar.mjs" llaves` (nunca muestra valores). Si `APIFY_TOKEN` falta: dilo, di
  de dónde sale (https://apify.com/sign-up) y **para** — sin token no hay de dónde bajar nada.
- `GEMINI_API_KEY` es **opcional**. Si está, el análisis de video sale por Camino A y oye el audio.
  Si falta, dilo en una línea y sigue: existe Camino B, que lee el subtítulo quemado en pantalla sin
  llamar a ninguna API de pago. No te detengas por esto.
- `perfil.json` no es obligatorio aquí, pero si existe, léelo: te da el nicho y sirve para no bajar
  cosas que no vienen al caso. Si no existe, avisa en una línea que `/matriz-start` deja el sistema mejor
  armado, y sigue igual.
- Solo cuentas públicas. Si el actor devuelve que la cuenta es privada o no existe, dilo y para.

---

# Camino A — una cuenta

## A1. Saca el subagente `espia`

Lánzalo con **Agent**, `subagent_type: "espia"`. En el mensaje dale, sin ambigüedad:

- `RAIZ`, el handle y la red (en el script: `instagram-reels` para Instagram por defecto, `instagram` si
  quiere carruseles y fotos, `tiktok`, `youtube`, `x`).
- Que corra **primero** `--estimar` y te devuelva el costo; **tú se lo muestras a la persona y esperas
  su sí en este turno** (AskUserQuestion: "Voy a traer <n> piezas de @<handle> en <red>. Estimado:
  $<x>. Tope duro: $<y>. ¿Corro?" → Sí · Solo la mitad · No). Sin ese sí, no se corre.
- `--limite 40 --tope 1.00` (cuenta nueva) o `--limite 15 --tope 0.50` (cuenta que ya espiaste).
- Que el crudo quede en `fuentes/` (lo escribe el script solo) y **que no lo edite nunca**.
- Que corra `mediana.mjs` y devuelva las piezas **ordenadas por rendimiento descendente**, con: número,
  fecha, primeras 8 palabras del texto, views, múltiplo, si tiene video descargable y la URL.
- Que las piezas sin views vayan al final marcadas `s/d`, **no como cero**.

Los comandos que el subagente corre (la sintaxis es posicional; no inventes banderas, el script
rechaza las que no conoce):

```bash
node "<RAIZ>/scripts/apify.mjs" posts <handle> <red> --limite 40 --tope 1.00 --estimar
node "<RAIZ>/scripts/apify.mjs" posts <handle> <red> --limite 40 --tope 1.00 > ".matriz/normalizado-<red>-<handle>.json"
node "<RAIZ>/scripts/mediana.mjs" "fuentes/<crudo-que-escribio-el-script>.json"
```

Una corrida tarda de 15 s a unos 2 minutos. Si va a tardar, el subagente la lanza en segundo plano.

## A2. Muestra la lista y para

Imprime una lista **numerada**, de mayor a menor múltiplo. Así:

```
Mediana de @<handle> en <red>: <n> views  (sobre <k> piezas con views, de <total>)

 1.  6.8x   2026-07-14   "nadie te dice esto del desayuno"        447,000 views   video
 2.  3.2x   2026-06-02   "probé entrenar 10 minutos 30 días"      210,000 views   video
 3.  2.1x   2026-08-01   "3 errores que te frenan"                138,000 views   carrusel, sin video
 ...
 12. s/d    2026-05-20   "gracias por los 100k"                   s/d             carrusel, sin video
```

**Aquí te detienes.** No bajes nada todavía.

## A3. Pregunta qué bajar

Con **AskUserQuestion**:

- header "Videos" — "¿Cuáles analizo? Por Camino A cuesta entre $0.003 y $0.011 por video según su
  duración; por Camino B cuesta $0.00 de API. La descarga es gratis en los dos."
  - **Los 3 más virales** — rápido y suficiente para ver el patrón.
  - **Los 5 más virales** — más señal, unos 4 centavos por Camino A.
  - **Elijo yo** — me dices los números.
  - **Ninguno por ahora** — me quedo con la lista.

Si elige *Elijo yo*, pídele los números en el chat ("3, 5 y 9") y espera.

**Baja solamente los que eligió.** Ni uno más.

## A4. Baja y analiza, uno por uno

Para cada pieza elegida:

1. Si la pieza **tiene** URL de video:

```bash
node "<RAIZ>/scripts/descargar.mjs" "<video_url>" "videos/<red>-<id>.mp4"
```

La URL del video caduca rápido. Descárgala en cuanto la tengas; si da 403 o 404, dilo y sigue con la
siguiente. No la reconstruyas a mano.

2. Saca el subagente `analista-video` con **Agent**, `subagent_type: "analista-video"`, pasándole la
   ruta del `.mp4` y las métricas de la pieza. Él corre:

El agente elige camino solo, según `MATRIZ_ANALIZADOR` en el `.env` (por defecto `auto`):

```bash
# Camino A — oye el audio, cuesta dinero (pide confirmación)
node "<RAIZ>/scripts/gemini.mjs" "videos/<red>-<id>.mp4"

# Camino B — lee el subtítulo quemado, $0.00 de API
node "<RAIZ>/scripts/fotogramas.mjs" "videos/<red>-<id>.mp4"
```

Pásale a `analista-video` también el valor de `RAIZ`. Si Gemini no está disponible y la skill `watch`
está instalada, para un video suelto con URL prefiere `/matriz-ver` (Camino C: oye por subtítulos o
Whisper y ve los fotogramas).

Con `auto`, si Gemini sale con **código 3** (key ausente o inválida, cuota, sin red) el agente cae a
Camino B y lo grita. Con código 1 no cae: reporta y para. Tú no armes ninguna de las dos llamadas a
mano ni cambies el modelo.

3. Si la pieza **no tiene** video (carrusel, imagen, tuit): no hay descarga ni Gemini. Analiza el
   texto que trae el crudo y **marca como `s/d`** todo lo que solo se ve en video: hook visual,
   ritmo, duración, transcripción. Dilo en el archivo. Un carrusel analizado como si fuera video es
   dato inventado.

---

# Camino B — una URL suelta

1. Descarga directo:

```bash
node "<RAIZ>/scripts/descargar.mjs" "$ARGUMENTS" "videos/suelto-<id>.mp4"
```

`descargar.mjs` baja archivos de video directos, no páginas de posts. Si el enlace es la página de un
post o de YouTube, usa `/matriz-ver`, que baja el video con `yt-dlp` y lo analiza. Si la persona quiere
las métricas del post, necesitas el handle y la red: pídelos.

2. Saca el subagente `analista-video` igual que en A4.

3. **Advierte esto y no lo escondas:** sin la cuenta completa no hay mediana, así que
   **`RENDIMIENTO` va `s/d`**. Un video suelto te dice cómo está hecho, no si funcionó. Para saber
   si funcionó, corre `/matriz-espiar <handle> <red>`.

---

## El archivo de cada análisis

Lo escribe el subagente `analista-video`, uno por pieza, en `transcripciones/<id>.json`. **JSON, no
markdown**: `matricero` lo lee por nombre de campo y cruza con `fuentes/` por el id, así que las
métricas no se repiten aquí — ya viven en el crudo.

Las 7 claves y el bloque `_meta` están especificados en `agents/analista-video.md`. No inventes una
forma distinta ni le agregues campos: la matriz depende de que todas las piezas tengan la misma.

Reglas que no cambian: el hook va **literal**, entre comillas, sin arreglar la redacción. Lo que no
sepas, `s/d`. Nunca conviertas `s/d` en cero ni en promedio.

---

## Al cerrar

- Si `perfil.json` existe, añade la cuenta a `competencia` con la fecha y el archivo fuente.
- Di cuántas piezas hay ya en `transcripciones/`: `ls transcripciones/*.json | wc -l`.
  Si son 10 o más, sugiere `/matriz-construir`. Si son menos, di cuántas faltan para llegar a 10.
- Di cuánto costó de verdad la corrida si Apify lo devolvió; si no lo devolvió, di `s/d`.

Imprime la lista de archivos que escribiste, con su ruta.
