---
name: matriz-guion
description: >-
  Escribe 5 guiones nuevos siguiendo el patrón de viralidad de tu matriz y simula cada uno contra las
  piezas reales (qué patrones cumple, señales a favor y en contra, estimación alta/media/baja y
  confianza). Úsala con "escríbeme guiones", "simula este guion", "qué grabo", "guiones con el patrón".
argument-hint: "[tema o ángulo opcional]  |  simular <ruta-de-un-guion-tuyo>"
---

# /matriz-guion — crea y simula

La matriz te da **estructura y técnica, no palabras**. Aquí conviertes el patrón de viralidad en guiones
nuevos, con la voz de la persona, y los pones a prueba contra lo que ya pasó.

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

1. Necesitas `matriz/matriz-contenido-viral.md` y `matriz/patrones-de-viralidad.md`. Si faltan: dilo y
   para. **Corre `/matriz-construir` primero.**
2. Lee también `perfil.json` (nicho, tono, frecuencia) y, si existen, `matriz/ganador.md` y
   `matriz/sentimiento-*.md` (los temas que la audiencia ya pidió).
3. Si el patrón de viralidad dice que no hay patrón claro (evidencia insuficiente), **dilo antes de
   escribir**: los guiones serán apuestas y se marcarán como apuesta, no como "siguiendo el patrón".
4. `$ARGUMENTS` puede traer un tema o ángulo. Si empieza con `simular`, salta al **Paso 3** con el
   guion que la persona escribió (no lo reescribas).

## Paso 1 — escribe los 5 guiones

Cada guion, en el tono de `perfil.json` y sobre el nicho de la persona:

- **Palabra por palabra:** hook, desarrollo y cierre con su CTA.
- **Notas de entrega:** dónde pausar, qué enfatizar, duración objetivo (en segundos).
- **Anclado a la matriz:** nombra qué tipo de hook, formato, emoción y duración usa, y las piezas de
  la matriz en que se apoya (por su nombre de la columna PIEZA).
- **Sin copiar frases literales** de las transcripciones ni de los captions. La matriz da la forma; las
  palabras son de la persona. Cuatro de los cinco siguen el patrón; uno puede ser una apuesta
  declarada (`APUESTA — sin respaldo en la matriz`).

Guarda cada uno en `guiones/AAAA-MM-DD-<slug>.md` (fecha con `date +%F`) con esta forma:

```markdown
# <título corto>
**Tema:** ... · **Hook (tipo):** ... · **Formato:** ... · **Emoción:** ... · **Duración objetivo:** NN s

## Guion
**HOOK** — "..."  *(pausa corta; enfatiza «...»)*
**DESARROLLO** — ...
**CIERRE / CTA** — "..."

## Simulación
(la rellena el Paso 3)
```

## Paso 2 — revisa que no copiaste

Para cada guion:

```bash
node "<RAIZ>/scripts/similitud.mjs" "guiones/<archivo>.md" --min 5
```

Si devuelve coincidencias (exit 1), reescribe esa parte con otras palabras y vuelve a correrlo. No
entregues un guion con frases de 5 palabras o más copiadas de otra cuenta.

## Paso 3 — simula (agente `simulador`)

Despacha un subagente `simulador` **por guion, en paralelo**, con **Agent** (`subagent_type:
"simulador"`). Pásale la ruta del guion, `matriz/matriz-contenido-viral.md`,
`matriz/patrones-de-viralidad.md` y, si existe, `matriz/ganador.md`. Él devuelve, para cada guion:

1. **Qué patrones cumple:** tipo de hook, tema, formato, duración, emoción — cada uno contra la matriz.
2. **Señales a favor y señales en contra**, comparando con piezas reales (citadas, con su múltiplo).
3. **Estimación:** alta / media / baja probabilidad de rendir por encima de lo normal de la cuenta,
   con la razón en 2–3 líneas. **Reglas duras:** `alta` solo si ≥5 piezas parecidas de la matriz
   superaron 1.5x; con 2–4 piezas parecidas el techo es `media`; sin piezas parecidas es `baja` y se
   dice `sin evidencia comparable`.
4. **Confianza:** cuánta evidencia parecida hay (n) y por qué es confiable o no.

Pega la simulación al final de cada archivo, bajo `## Simulación`, y añade siempre esta línea:
*«Estimación **basada-en-patrones** sobre <n> piezas pasadas. No es una predicción.»*

## Paso 4 — el ranking y el recordatorio

Entrega el ranking de los 5 (con su estimación y confianza) y cierra recordando, sin sermón:

> El algoritmo es impredecible. Una estimación sirve para ordenar prioridades, no para censurar:
> **los guiones con estimación baja también se publican.** A veces son justo los que pegan. Y después
> de publicar, `/matriz-rutina` mide el acierto o el fallo de cada simulación para que la siguiente sea
> mejor con evidencia, no con opinión.

Si la persona no ha publicado nada todavía, no hay acierto que medir: dilo, no lo inventes.
Imprime la lista de archivos que escribiste, con su ruta.
