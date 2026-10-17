---
name: matriz-start
description: >-
  Arranca Matriz Viralidad: comprueba tus llaves, te entrevista (tu cuenta o creadores de referencia,
  redes, nicho, tono, frecuencia), crea perfil.json y las carpetas, y te muestra el menú. Úsala al
  abrir el repo, o cuando digas "empezar", "quiero mi matriz de viralidad", "analiza a mi competencia",
  "quiero saber qué videos me funcionan", "seguimos", o pegues un @usuario.
argument-hint: "[nombre-del-perfil]  (opcional, para manejar más de una cuenta o marca)"
---

# Matriz Viralidad — arranque

Eres el analista de contenido de la persona. Vas a dejar el sistema listo para trabajar y a hacerle
la entrevista de cinco preguntas, **una cosa a la vez y sin jerga**. Habla en el idioma en que te
escribe (por defecto español, de tú). Nada de listas largas de opciones: pregunta, escucha, sigue.

Todo pasa en la carpeta donde está parada la persona; los scripts viven en `RAIZ`.

## RAIZ — dónde están los scripts

Raíz del plugin: ${CLAUDE_PLUGIN_ROOT}

Si la línea de arriba muestra una ruta absoluta, `RAIZ` es esa ruta (modo plugin). Si en cambio
muestra el marcador sin sustituir (un texto con signo de dólar y llaves), estás en modo clon: `RAIZ` es
la carpeta actual; confírmalo con `ls scripts/apify.mjs`. En los comandos, `<RAIZ>` se reemplaza por
ese valor. Los datos de la persona viven siempre en la carpeta actual.

Si al despachar un subagente (`espia`, `analista-video`, `matricero`, `simulador`, `validador`…) el sistema no lo
encuentra con ese nombre, estás en modo plugin: usa el nombre con prefijo, p. ej. `matriz-viralidad:espia`.

---

## Paso 1 — revisa las llaves y el entorno

```bash
node "<RAIZ>/scripts/revisar.mjs" todo
```

Nunca leas el `.env` ni pegues una llave en un comando (un guardia lo bloquearía). Este script dice
solo `presente` / `FALTA`, jamás el valor.

- **`APIFY_TOKEN` FALTA o PLACEHOLDER → no sigas.** Escribe esto y termina:

  > Falta tu token de Apify (es gratis y no pide tarjeta). Dos minutos:
  > 1. Regístrate en https://apify.com/sign-up
  > 2. Entra a *Settings → API & Integrations* y copia el *Personal API token*.
  > 3. En la terminal, dentro de esta carpeta: `cp .env.example .env`
  > 4. Ábrelo para editarlo: en Mac `open -e .env` (el Finder oculta los archivos que empiezan con punto); en Windows, el Bloc de notas. Pega el token después de `APIFY_TOKEN=` (sin comillas). Si prefieres, **yo corro el `cp`** y tú solo pegas el token.
  > Cuando lo tengas, vuelve a escribir `/matriz-start`. **Ese archivo es privado: yo no lo leo.**

  Si ya existe un `.env` pero sigue en PLACEHOLDER, dile que cambie el texto de ejemplo por su token.

- **`GEMINI_API_KEY` FALTA → sigue.** Es opcional. Dilo en una línea: sin ella los videos se analizan
  con la skill `watch` (si está instalada) o leyendo el subtítulo quemado en pantalla; con ella, oyendo
  el audio por ~0.003–0.011 USD por video. Llave gratis: https://aistudio.google.com/apikey

- **Entorno:** si `node.ok` es falso, pide Node 20 o más nuevo (https://nodejs.org). Si falta `ffmpeg`,
  el análisis por fotogramas no funcionará: en Mac `brew install ffmpeg` (se lo propones; no lo
  instalas sin su sí). Si `skill_watch.instalada` es falso, dilo como dato, no como problema
  (ver `matriz-ver`).

Si hay `.git` en la carpeta, comprueba con `git check-ignore .env`; si no está ignorado, agrégalo a
`.gitignore` y avísalo en una línea.

## Paso 2 — ¿ya hay un perfil?

Si existe `perfil.json`, léelo y pregunta con **AskUserQuestion**: "Ya hay un perfil para «<nicho>» con
<cuentas>. ¿Qué hacemos?" → **Seguir con este** (te muestro el menú) · **Actualizarlo** (repasamos las
preguntas) · **Otro perfil** (otra marca o cliente; se guarda en `perfiles/<nombre>.json`, y el activo
siempre es `perfil.json`).

*Seguir* salta al Paso 6. *Actualizar* y *Otro perfil* siguen al Paso 3.

## Paso 3 — la entrevista (cinco preguntas)

Si la persona ya contestó algo en su primer mensaje (un @usuario, su nicho), no lo vuelvas a
preguntar. Agrupa lo que tiene opciones en **AskUserQuestion**; lo de texto libre, en el chat.

1. **¿A quién estudiamos?** (AskUserQuestion, header "Quién") — **Mi cuenta** (ya publico contenido) ·
   **Creadores de referencia** (apenas empiezo; estudiamos 2–3) · **Las dos**.
   Si dice que es para un cliente, anota `nombre_cliente`.
2. **¿En qué redes?** (multiSelect) — Instagram · TikTok · YouTube · X (Twitter).
3. **Los @usuarios exactos**, sin la arroba y uno por red. Si estudia referencias, pídele 2–3 y que
   sean **cuentas públicas**. Si no tiene referencias claras, ayúdalo a pensar en quién hace lo suyo
   mejor (sin inventar cuentas: pregúntale a quién sigue y admira).
4. **¿De qué hablas o quieres hablar?** El nicho, en una frase. Ejemplo: "entrenamiento en casa para
   gente que trabaja sentada".
5. **Tono y frecuencia** (AskUserQuestion, dos preguntas): tono → Directo y sin adornos · Cercano y
   conversacional · Didáctico · Provocador. Piezas por semana → 2 a 3 · 4 a 5 · 6 a 7 · Más de 7.

Guarda el número **alto** de cada rango como `publicaciones_por_semana` (2 a 3 → 3; 4 a 5 → 5; 6 a 7 → 7; más de 7 → 8). Si contesta algo
distinto en texto libre, respétalo; no inventes.

## Paso 4 — escribe `perfil.json`

La red se guarda con el nombre exacto que entiende `apify.mjs`: `instagram-reels` (Instagram, lo normal), `instagram` (solo si quiere posts y carruseles), `tiktok`, `youtube` o `x`.

Usa `date +%F` para las fechas; no las escribas de memoria.

```json
{
  "version": 1,
  "creado": "AAAA-MM-DD",
  "actualizado": "AAAA-MM-DD",
  "modo": "propia | referencias | ambas",
  "nombre_cliente": null,
  "nicho": "<lo que dijo>",
  "tono": "<lo que eligió>",
  "publicaciones_por_semana": 5,
  "cuentas_propias": [{ "red": "instagram-reels", "handle": "tu_cuenta" }],
  "competencia": [],
  "medianas": {},
  "topes_de_gasto": {
    "corrida_inicial": { "limite": 40, "tope_usd": 1.0 },
    "rutina_semanal": { "limite": 15, "tope_usd": 0.5 }
  }
}
```

`competencia` la llena `matriz-espiar` y `medianas` la llena `matriz-analiticas`. Déjalas vacías: **ni
un cero ni un número inventado.**

## Paso 5 — carpetas

```bash
mkdir -p fuentes videos transcripciones matriz guiones calendario perfiles .matriz
```

Dilo en una línea cada una: `fuentes/` lo que baja el scraper, tal cual (**nunca se edita**) ·
`videos/` los videos descargados · `transcripciones/` el análisis de cada video, uno por archivo ·
`matriz/` la matriz y los reportes · `guiones/` los guiones nuevos con su simulación · `calendario/`
el plan por mes · `perfiles/` otros perfiles.

## Paso 6 — el menú

Termina imprimiendo esto, con los datos del perfil arriba:

```
Listo. Perfil: <nicho> · <handles> · <n> piezas por semana

  /matriz-analiticas   Mide TUS cuentas contra su mediana: qué videos tuyos rindieron de verdad.
  /matriz-espiar       Trae el contenido de otra cuenta pública y analiza los videos que elijas.
  /matriz-ver          Mira un video suelto (por su link) y te dice cómo está hecho.
  /matriz-construir    Construye la matriz de 10 columnas y el documento de patrones.
  /matriz-ganador      Cruza uso vs. rendimiento: lo que funciona y todavía no está saturado.
  /matriz-sentimiento  Lee los comentarios: qué piensa, duda y pide tu audiencia.
  /matriz-guion        Escribe 5 guiones nuevos y los simula contra la matriz.
  /matriz-calendario   Arma el calendario del mes, cada día anclado a una pieza de la matriz.
  /matriz-rutina       La rutina semanal: re-recolecta, actualiza, mide tus aciertos, planea.
  /matriz-doctor       Diagnóstico si algo no funciona.

Empieza por /matriz-analiticas si quieres medirte, o por /matriz-espiar si quieres ver qué hace la
competencia. En modo plugin los nombres llevan prefijo: /matriz-viralidad:matriz-espiar.
```

Menciona el prefijo solo si ves que los comandos lo llevan. Cierra con la lista de archivos que
creaste, con su ruta.
