---
name: matriz-calendario
description: Arma el calendario del mes con base en los datos, cada día justificado con una pieza de la matriz
argument-hint: "[mes AAAA-MM]  (vacío = el mes que viene)"
---

# /matriz-calendario — qué publicar, qué día, y por qué

Un calendario donde cada fila lleva **la pieza que la respalda**. Si una fila no se puede justificar
con una pieza de la matriz, no va: se queda como apuesta y se marca como apuesta.

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

1. `matriz/matriz-contenido-viral.md` tiene que existir. Si no: dilo y para. **Corre `/matriz-construir` primero.**
2. Lee, si existen, y dilo si no:
   - `matriz/patrones-de-viralidad.md` — el patrón de viralidad va a ser la columna vertebral del mes.
   - `matriz/ganador.md` — de ahí salen las apuestas (lo que rinde y no satura).
   - `matriz/sentimiento-*.md` — de ahí salen los temas que la gente **ya pidió**.
   - `perfil.json` — nicho, tono y `publicaciones_por_semana`.
3. Si no hay `perfil.json`, pregunta con **AskUserQuestion** cuántas publicaciones por semana quiere
   sostener (2 a 3 / 4 a 5 / 6 a 7 / más de 7) y sigue. No supongas la frecuencia.
4. El mes: `$ARGUMENTS` en formato `AAAA-MM`. Si viene vacío, usa el mes siguiente al de
   `date +%Y-%m`. Calcula los días reales del mes con `date`, no de memoria.

---

## Paso 1 — el problema del horario, de frente

Antes de armar nada, mira si tienes dato de **cuándo** se publicó cada pieza. Los crudos de `fuentes/`
suelen traer un `timestamp` de publicación.

```bash
node "<RAIZ>/scripts/revisar.mjs" horarios "fuentes/<archivo>.json"
```

Tres casos, y cada uno se dice distinto:

- **No hay `timestamp` en ningún lado** → la columna HORA del calendario va **`s/d`** en todas las
  filas, y escribes arriba: *"no tengo dato de a qué hora se publicó nada, así que no te voy a decir
  a qué hora publicar."* **Nunca escribas "el martes a las 6pm"** si nadie midió esa hora.
- **Hay `timestamp` pero pocas piezas** (menos de 15) → puedes reportar a qué hora y qué día se
  publicaron las piezas de más de 1.5x, **como observación, no como recomendación**, y con esta
  advertencia: con esta muestra, la hora está mezclada con el tema, el formato y la suerte; no se
  puede separar cuál de los cuatro hizo el trabajo.
- **Hay `timestamp` en bastantes piezas** → igual que arriba, pero puedes señalar si hay una franja
  que se repite. Sigue siendo **basado en patrones**, y lo escribes con esas palabras.

Lo mismo con el **día de la semana**: se calcula del `timestamp`, o va `s/d`. No hay día bueno
universal, y si aparece uno en tus datos, es tuyo, no una ley del algoritmo.

---

## Paso 2 — reparte el mes

- `publicaciones_por_semana` × semanas del mes = total de piezas. Reparte parejo entre los días,
  dejando huecos; un calendario apretado no se cumple y un calendario que no se cumple no sirve.
- **No repitas el mismo FORMATO dos días seguidos.**
- Cada semana lleva al menos **una apuesta**: un patrón del cuadrante OPORTUNIDAD de
  `matriz/ganador.md`. Márcala como apuesta en su fila. El resto va sobre patrones confirmados
  (los de "Qué funciona" del análisis).
- Los temas de `sentimiento-*.md` ("qué piden", "qué dudas repiten") tienen prioridad sobre los temas
  inventados por ti: son demanda que la audiencia ya expresó por escrito.
- Nada de lo que esté en la sección "Qué no funciona" del análisis entra al calendario. Si entra por
  alguna razón, explícala en la fila.

---

## Paso 3 — el archivo

Escribe `calendario/<AAAA-MM>.md`. Encabezado, luego la tabla:

```
| DIA | FECHA | RED | FORMATO | TEMA | TIPO DE HOOK | DURACION OBJETIVO | EMOCION | CTA | HORA | POR QUE |
|---|---|---|---|---|---|---|---|---|---|---|
| mar | 2026-09-03 | IG | habla-a-camara | error del desayuno | dato sorprendente | 0-30s | curiosidad | ninguno | s/d | La pieza `IG 2026-07-14 desayuno estancado` (6.8x) usa este mismo cruce: dato sorprendente + habla a cámara + menos de 30s |
```

- **POR QUE** cita la pieza **por su nombre de la columna PIEZA de la matriz** y su múltiplo. Si la
  fila es una apuesta, escribe `APUESTA:` y de qué celda de `ganador.md` sale, con su frecuencia y su
  rendimiento.
- **HORA** va `s/d` salvo que el Paso 1 te haya dado algo, y entonces va con la advertencia.
- **DURACION OBJETIVO** en tramos (`0-15s`, `16-30s`, `31-60s`, `+60s`), tomada de lo que rinde en tu
  matriz, no de lo que se dice por ahí.

Debajo de la tabla, tres bloques cortos:

1. **Cómo quedó repartido**: cuántas piezas por formato, por tema y por red, y cuántas son apuestas.
2. **Qué sostiene este calendario**: el párrafo de "El patrón de viralidad" de `matriz/patrones-de-viralidad.md`,
   citado, más el número de piezas sobre el que está hecho.
3. **Lo que no sé** (obligatorio, igual que en la matriz):
   - la hora y el día, si quedaron en `s/d`;
   - que el calendario asume que lo que funcionó los últimos meses sigue funcionando, y el algoritmo
     cambia sin avisar;
   - que no contempla lo que pase en el nicho durante el mes (una tendencia, una noticia): revisa a
     mitad de mes y mueve lo que haga falta;
   - que la frecuencia elegida hay que poder sostenerla; si en la semana 2 ya no se cumplió, el
     problema es la frecuencia, no la disciplina.

Cierra con: *"Todo esto está **basado en patrones** de <n> piezas analizadas. No es una predicción
de resultados."*

---

## Si el mes es grande

Puedes sacar un subagente con **Agent** (`subagent_type: "matricero"`; pásale `RAIZ` y las rutas exactas `matriz/matriz-contenido-viral.md` y `matriz/patrones-de-viralidad.md`) para que arme la tabla a partir
de la matriz y del ganador, mientras tú revisas que cada fila tenga su cita. Pásale las rutas y las
reglas del Paso 2 tal cual.

---

Termina diciendo: cuando publiques, vuelve a correr `/matriz-analiticas` para ver contra la mediana si el
calendario acertó. Ese es el ciclo; sin la medición de vuelta, esto es un documento bonito.

Imprime la lista de archivos que escribiste, con su ruta.
