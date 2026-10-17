---
name: matriz-rutina
description: >-
  La rutina semanal de community manager: re-recolecta solo lo nuevo con topes, actualiza la matriz,
  mide tus números contra lo que la simulación estimó, propone el calendario de la semana y cierra con
  un resumen de 5 líneas y el gasto del mes. Úsala con "rutina semanal", "qué toca esta semana",
  "actualiza todo", "cómo me fue".
argument-hint: "[opcional: cuentas a refrescar]"
---

# /matriz-rutina — una vez por semana

Cinco pasos, siempre en este orden. Nada gasta dinero sin su estimado y el sí de la persona.

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

- Necesitas `perfil.json` y una matriz previa (`matriz/matriz-contenido-viral.md`). Si falta alguno: dilo y manda a
  `/matriz-start` o `/matriz-construir`.
- `node "<RAIZ>/scripts/revisar.mjs" llaves` debe decir `APIFY_TOKEN: presente`.

## 1. Re-recolecta (solo lo nuevo, con topes)

Para cada cuenta de `perfil.json` (propias y competencia), usa los topes de `rutina_semanal`
(`--limite 15 --tope 0.50`). Primero el estimado de todas:

```bash
node "<RAIZ>/scripts/apify.mjs" posts <handle> <red> --limite 15 --tope 0.50 --estimar
```

Suma, enséñale el total con **AskUserQuestion** ("Estimado: $<x>, tope duro: $<y>. ¿Corro?") y espera su
sí. Después corre cada una (en segundo plano si son varias):

```bash
node "<RAIZ>/scripts/apify.mjs" posts <handle> <red> --limite 15 --tope 0.50 > ".matriz/normalizado-<red>-<handle>.json"
```

El crudo nuevo se guarda en `fuentes/` **sin borrar lo anterior**. Para analizar los videos nuevos que
valgan la pena, sigue el flujo de `/matriz-espiar` (baja y analiza solo los que la persona elija).

## 2. Actualiza la matriz (y avisa primero lo que cambió)

Despacha `matricero` (`/matriz-construir` completo) para sumar las piezas nuevas. Antes de mostrar nada
más, compara `matriz/patrones-de-viralidad.md` nuevo contra el anterior: **si un patrón que funcionaba
dejó de funcionar, o al revés, eso va primero** — es lo más valioso de la semana. Guarda la versión
anterior como `matriz/patrones-de-viralidad.AAAA-MM-DD.md` antes de sobrescribir (pregunta primero si
vas a reemplazar un archivo que la persona haya editado).

## 3. Mis números (solo si estudiamos su cuenta)

Compara sus últimas publicaciones contra **su** mediana (`mediana.mjs` sobre su crudo nuevo). Después
pregunta cuál de los guiones de `guiones/` publicó y en qué fecha o URL — **no lo adivines**. Para cada
uno, anota al final de su archivo bajo `## Resultado real`:

```
Publicado: <fecha/URL> · Rendimiento real: <x>x (vs mediana <n>) · Estimación: <alta|media|baja> ·
<ACIERTO | FALLO | INCONCLUSO (pieza muy reciente: sigue acumulando views)>
```

Un video de menos de ~7 días sigue acumulando vistas: márcalo `INCONCLUSO`, no lo cuentes como fallo.
La simulación mejora con evidencia real, no opinando sobre sí misma.

## 4. Calendario de la semana

Con las piezas que `perfil.json` dice (`publicaciones_por_semana`): para cada una, el guion (nuevo o uno
pendiente de `guiones/`), la red y **por qué en ese orden**, anclado a una pieza de la matriz. Día y hora
**solo si los datos muestran un patrón real** (`revisar.mjs horarios`); si no hay evidencia, dilo y que
elija la persona. Guárdalo en `calendario/semana-AAAA-Www.md`. Detalle del método en `/matriz-calendario`.

## 5. Resumen de 5 líneas

```bash
node "<RAIZ>/scripts/revisar.mjs" gasto
```

Cierra con cinco líneas, ni una más: qué aprendimos · qué cambió en los patrones · qué toca publicar ·
cómo fue el acierto de las simulaciones (o «sin datos todavía») · cuánto crédito de Apify se llevó el
mes (el número real de la bitácora; si hay corridas sin costo devuelto, dilo: `s/d`, no cero).

No publiques nada: tú preparas, la persona publica.
