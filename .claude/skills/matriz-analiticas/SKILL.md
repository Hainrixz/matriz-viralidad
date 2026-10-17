---
name: matriz-analiticas
description: Mide tus propias cuentas contra su mediana y dice qué está funcionando de verdad
argument-hint: "[handle]  (vacío = todas las cuentas del perfil)"
---

# /matriz-analiticas — cómo vas de verdad

Mides las cuentas **propias** del perfil. La pregunta que contestas no es "cuántas views tuve",
es "**cuáles de mis videos rindieron por encima de lo normal para mí**".

La regla, y no se negocia:

```
Rendimiento = views del video / MEDIANA de views de ESA cuenta
   > 1.5x  ->  funciona
   < 0.7x  ->  no funciona
```

La mediana es de esa cuenta, no del nicho, no de la industria. Comparar contra otra cuenta no dice nada.

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

1. `perfil.json` tiene que existir. Si no está: dilo y para. **Corre `/matriz-start` primero.**
2. `node "<RAIZ>/scripts/revisar.mjs" llaves` tiene que decir `APIFY_TOKEN: presente` (nunca muestra el
   valor). Si falta: dilo, di que sale de https://apify.com/sign-up, y para.
3. Lee `perfil.json` y saca las cuentas propias. Si `$ARGUMENTS` trae un handle, usa solo ese.

---

## Paso 1 — di cuánto va a costar y espera el sí

Primero el estimado, que no gasta nada ni pide token. El script sabe qué actor usa cada red:

```bash
node "<RAIZ>/scripts/apify.mjs" posts <handle> <red> --limite 40 --tope 1.00 --estimar
```

Redes: `instagram-reels` (Instagram, lo normal), `instagram` (posts y carruseles), `tiktok`, `youtube`,
`x`. Primera corrida de una cuenta: `--limite 40 --tope 1.00`. Rutina semanal: `--limite 15 --tope 0.50`.
El tope en dólares es **duro**: si se pasa, Apify corta la corrida. Los precios del estimado son del plan
Free de Apify (consultados el 2026-10-17); los planes de pago pagan menos, y los add-ons de pago
(transcripción, descarga de video) **no se activan**.

Suma el estimado de todas las cuentas y pregunta con **AskUserQuestion**:

- header "Gasto" — "Voy a traer <n> piezas de <cuentas>. Estimado: $<x>. Tope duro: $<y>. ¿Corro?"
  - **Sí, corre** · **Solo la mitad de piezas** · **No, cancela**

Sin ese sí en este turno, no corres nada.

---

## Paso 2 — trae los datos

Por cada cuenta:

```bash
mkdir -p .matriz
node "<RAIZ>/scripts/apify.mjs" posts <handle> <red> --limite 40 --tope 1.00 > ".matriz/normalizado-<red>-<handle>.json"
```

El crudo queda solo en `fuentes/<red>-<handle>-posts-<fecha>.json`. Si el script se queja de un
argumento, corre `node "<RAIZ>/scripts/apify.mjs" --ayuda` y usa los nombres que te diga. **No edites el
script.** Una corrida tarda de 15 s a unos 2 minutos; si hay varias cuentas, lánzalas en segundo plano.

Reglas de datos, inviolables:

- Lo que cae en `fuentes/` es crudo y **no se edita jamás**. Ni para limpiar, ni para completar, ni
  para "arreglar" un campo. Si algo está mal, se vuelve a bajar en un archivo nuevo.
- Solo cuentas y videos **públicos**.
- Si la corrida falla o trae cero, dilo. No rellenes con lo que había antes.

---

## Paso 3 — la mediana y el rendimiento

```bash
node "<RAIZ>/scripts/mediana.mjs" "fuentes/<archivo>.json"
```

Te devuelve la mediana de views de esa cuenta y el múltiplo de cada pieza.

Cómo se cuenta, para que no salga un número mentiroso:

- La mediana se calcula **solo sobre las piezas que sí traen views**. Una pieza sin views no entra
  como cero: no entra.
- Con menos de 10 piezas con views la mediana es **provisional** (`mediana provisional (n<10)`); con
  menos de 5 no se calcula rendimiento. Dilo así: *"mediana sobre N piezas, tómala con pinzas"*.
- Si la cuenta no tiene ninguna pieza con views, no hay mediana. El rendimiento de todas es `s/d`.
  No inventes un sustituto.

---

## Paso 4 — lo que la API no da

Esto es lo que separa un reporte honesto de uno inflado. Di explícitamente qué métricas **no vinieron**,
por red. Lo medido en esta máquina:

| Red | Da | No da (queda `s/d`) |
|---|---|---|
| Instagram | likes, comentarios, y views **solo en video/reel** | views en carrusel e imagen (no aplica), **compartidos nunca**, guardados, alcance, retención |
| TikTok | views, likes, comentarios, compartidos | guardados, retención, procedencia del tráfico |
| YouTube | views, likes, comentarios | compartidos, retención, CTR de miniatura |
| X (Twitter) | likes, respuestas, reposts, a veces views | lo que no venga en la corrida — decláralo pieza por pieza |

Nada de esto se estima, se interpola ni se rellena con un cero. Se escribe `s/d` y se dice en el
reporte cuántas piezas quedaron con `s/d` en cada columna.

En Instagram, si el perfil publica muchos carruseles, avisa: **la mayoría de las piezas puede no
tener views**, y entonces la matriz de esa cuenta se sostiene con pocas filas.

---

## Paso 5 — el reporte

Escribe `matriz/analiticas-<handle>-<fecha>.md` y además resume en el chat:

1. **La mediana**: "tu mediana de views en <red> es <n>, sobre <k> piezas de las <total> que bajé."
2. **Lo que funcionó** (> 1.5x): lista con fecha, primeras palabras del texto, views, múltiplo.
   Máximo 10, ordenadas de mayor a menor.
3. **Lo que no** (< 0.7x): igual, las peores. Sin suavizarlo.
4. **Lo que ni fu ni fa** (entre 0.7x y 1.5x): solo el conteo. Ahí no hay señal.
5. **Lo que no sé**: la lista de `s/d` del Paso 4, y cuántas piezas afecta cada una.

No saques conclusiones de por qué funcionó todavía. Eso es trabajo de `/matriz-construir`, que necesita el
análisis del video, no solo el número.

---

## Paso 6 — deja el rastro

Actualiza `perfil.json`: en `medianas` guarda por cuenta `{ "red": ..., "handle": ..., "mediana": n,
"piezas_con_views": k, "calculada": "<fecha>", "archivo_fuente": "fuentes/..." }`.
Otros comandos la van a usar; si no está, tienen que recalcularla.

Cierra diciendo qué correr después:

- `/matriz-espiar <handle> <red>` para ver qué hace la competencia.
- `/matriz-construir` cuando tengas videos analizados (esto solo te dio números, no el porqué).

Imprime la lista de archivos que escribiste, con su ruta.
