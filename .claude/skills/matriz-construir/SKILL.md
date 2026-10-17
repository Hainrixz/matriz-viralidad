---
name: matriz-construir
description: Construye la matriz de viralidad de 10 columnas y el documento que la explica
argument-hint: "[propio | competencia | todo]"
---

# /matriz-construir — la tabla y el porqué

Dos archivos, siempre los dos:

- `matriz/matriz-contenido-viral.md` — la tabla de **10 columnas exactas**, una fila por pieza analizada.
- `matriz/patrones-de-viralidad.md` — el documento de **4 secciones**, la última obligatoria.

La metodología completa está en la skill **`matriz-metodologia`**. Léela antes de construir nada y
aplícala literal. Lo de abajo es el procedimiento del comando, no una versión alterna del método.

## RAIZ — dónde están los scripts

Raíz del plugin: ${CLAUDE_PLUGIN_ROOT}

Si la línea de arriba muestra una ruta absoluta, `RAIZ` es esa ruta (modo plugin). Si en cambio
muestra el marcador sin sustituir (un texto con signo de dólar y llaves), estás en modo clon: `RAIZ` es
la carpeta actual (`ls scripts/apify.mjs` lo confirma). Los datos de la persona viven siempre en la
carpeta actual.

---

## Antes de empezar

1. Cuenta el material: `ls transcripciones/*.json 2>/dev/null | wc -l`.
   (`transcripciones/.fotogramas/` es material de trabajo de Camino B, no análisis. Empieza con
   punto justamente para no aparecer en este conteo ni en ningún `ls`. No lo cuentes ni lo leas.)
   - **0 piezas** → dilo y para: *"no hay nada analizado todavía. Corre `/matriz-espiar <handle> <red>` o
     `/matriz-analiticas` y analiza al menos unos videos."*
   - **1 a 9 piezas** → **no te niegues.** Constrúyela igual y marca la evidencia como insuficiente
     (ver abajo).
   - **10 o más** → adelante.
2. `$ARGUMENTS`: `propio` = solo cuentas de `perfil.json`; `competencia` = solo las demás; `todo` o
   vacío = todas. Si mezclas propio y competencia, la columna PIEZA tiene que dejar claro de quién es
   cada fila, porque **cada pieza se compara contra la mediana de SU cuenta**, nunca contra otra.

---

## Si hay menos de 10 piezas

Constrúyela, y pon este aviso arriba de **los dos** archivos, tal cual:

```
> EVIDENCIA INSUFICIENTE — esta matriz está hecha con <n> piezas. Con menos de 10, un patrón
> puede ser casualidad. Sirve para orientarte, no para decidir. Analiza más piezas con /matriz-espiar.
```

Y en el documento de análisis, en vez de 5-7 patrones, escribe los que de verdad se sostengan, aunque
sean dos, y di cuántas piezas respaldan cada uno.

---

## Paso 1 — saca el subagente `matricero`

Con **Agent**, `subagent_type: "matricero"`. Dale:

- La lista de archivos de `transcripciones/` que entran.
- Las medianas por cuenta que estén en `perfil.json`, y las de los archivos de `fuentes/` si hacen falta.
- La instrucción de leer la skill `matriz-metodologia` y seguirla al pie de la letra.
- Las rutas de salida: `matriz/matriz-contenido-viral.md` y `matriz/patrones-de-viralidad.md`.

---

## Paso 2 — la tabla

La cabecera va **copiada carácter por carácter**, sin cambiar el orden, sin añadir ni quitar columnas:

```
| PIEZA | HOOK | TIPO DE HOOK | TEMA | FORMATO | DURACION | EMOCION | CTA | RENDIMIENTO | PATRON |
```

Qué va en cada una:

| Columna | Qué se escribe |
|---|---|
| **PIEZA** | plataforma + fecha + título corto. Ej: `IG 2026-07-14 desayuno estancado` |
| **HOOK** | las primeras 1-2 frases **literales**, entre comillas. Sin corregir, sin resumir |
| **TIPO DE HOOK** | una de: pregunta directa / dato sorprendente / contraste / confesión / promesa |
| **TEMA** | 3 a 5 palabras. Ni una más |
| **FORMATO** | una de: habla-a-camara / tutorial / historia / lista / reaccion, o `s/d` (p. ej. una pieza sin video) |
| **DURACION** | en segundos, solo el número. Si no se sabe: `s/d` |
| **EMOCION** | una de: curiosidad / sorpresa / identificacion / urgencia, o `s/d` (si el analizador devolvió `otra`, va `s/d`) |
| **CTA** | el CTA tal como se dice, o `ninguno` |
| **RENDIMIENTO** | el múltiplo contra la mediana de esa cuenta, ej `3.2x`. Sin mediana: `s/d` |
| **PATRON** | **una línea** de por qué funcionó. Una, no tres |

Orden de las filas: por RENDIMIENTO, de mayor a menor. Las `s/d` al final.

Prohibido, y esto es lo que hace que la matriz valga algo:

- Inventar un valor porque la casilla se ve fea vacía. Va `s/d`.
- Meter una categoría nueva en TIPO DE HOOK, FORMATO o EMOCION. Si de verdad no encaja en ninguna,
  pon `s/d` y anótalo en "Lo que no sabemos". No fuerces una categoría para que la casilla se vea llena (regla de `matriz-metodologia`).
- Poner un cero donde no hubo dato. Cero es un dato; `s/d` es la ausencia de dato.
- Parafrasear el HOOK. Va literal o no va.

---

## Paso 3 — el documento de análisis

`matriz/patrones-de-viralidad.md`, exactamente estas cuatro secciones, en este orden:

### 1. Qué funciona
De 5 a 7 patrones que estén presentes en las piezas con rendimiento **> 1.5x**. Cada patrón:
qué es, en cuántas de esas piezas aparece, y **citando las piezas por su nombre de la columna PIEZA**.
Un patrón sin citas es una opinión; bórralo.

### 2. Qué no funciona
Los patrones que aparecen en las piezas por **debajo de 0.7x**. Mismas reglas, mismas citas.
Si un patrón está en los dos lados, dilo: es señal de que la causa está en otra parte.

### 3. El patrón de viralidad
**Un párrafo.** Uno. Que junte en una sola frase larga o dos: tipo de hook + tema + formato +
duración + emoción. Tiene que poder leerse y ejecutarse mañana. Ejemplo de la forma
(no del contenido): *"lo que rinde aquí es un dato sorprendente sobre <tema> dicho a cámara en
menos de 30 segundos, apostando a la curiosidad y sin pedir nada al final."*

### 4. Lo que no sabemos
**Obligatoria.** Es la sección que hace honesto al sistema. Va la varianza que la matriz **no**
explica. Como mínimo:

- La **hora y el día** de publicación, si no se midieron.
- La **miniatura** y el primer fotograma, que no están en la tabla.
- La **edición**: cortes, subtítulos, música, calidad de audio.
- El **azar del algoritmo**: dos videos casi iguales pueden separarse 10x sin razón visible.
- El **tamaño de la muestra**: cuántas piezas, de cuántas cuentas, de cuánto tiempo.
- El **sesgo de supervivencia**: solo se analizó lo que ya se publicó, no lo que nunca se grabó.
- Cuántas casillas quedaron en `s/d` y en qué columnas.

Ninguna de estas se convierte en recomendación. Se nombran y se dejan abiertas.

Además, cierra el documento con una línea: *"Todo lo que aquí se propone está **basado en patrones**
de <n> piezas. No es una predicción."*

---

## Paso 4 — revisa antes de entregar

Comprueba tú mismo, y dilo:

- La cabecera de la tabla tiene 10 columnas y dice exactamente lo de arriba.
- Hay **una fila por cada archivo de `transcripciones/` que entró** (solo piezas analizadas; las demás viven en `fuentes/` y solo cuentan para la mediana). Si una pieza aparece en dos crudos (rutina semanal), se toma **una vez**, del crudo más reciente.
- Todos los HOOK están entre comillas.
- No hay ninguna casilla vacía: o tiene dato o dice `s/d`.
- El documento tiene las 4 secciones, y la 4 no está vacía.

Si algo de esto falla, arréglalo antes de terminar.

Después, despacha un subagente `validador` (**Agent**, `subagent_type: "validador"`, pásale el valor de
`RAIZ`; el valor sale de la sección de arriba): audita la matriz con ojos que no la escribieron —
HOOK literales, listas cerradas, medianas recalculadas desde `fuentes/`. Si devuelve `FAIL`, corrige
las filas que nombra y vuelve a despacharlo. **No entregues una matriz con `FAIL`.** Di el veredicto en
el chat, con lo que no pudo comprobar.

---

Imprime la lista de archivos que escribiste, con su ruta, y una línea con el conteo:
piezas totales, cuántas > 1.5x, cuántas < 0.7x, cuántas `s/d`.
