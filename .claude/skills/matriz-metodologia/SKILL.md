---
name: matriz-metodologia
description: El metodo completo para construir una matriz de viralidad. Usalo cuando haya que calcular rendimiento contra la mediana, clasificar hooks, construir la tabla de 10 columnas o escribir el documento de analisis.
---

# Metodologia de la matriz de viralidad

Esta es la especificacion operativa. No es una guia de estilo ni una sugerencia:
cualquier agente que construya una matriz aplica esto literalmente. Si un caso no esta
cubierto aqui, se resuelve por la regla mas conservadora y se deja anotado en la seccion
"Lo que no sabemos".

La matriz tiene dos entregables, siempre los dos:

1. **La tabla** de 10 columnas exactas, una fila por pieza.
2. **El documento de analisis** de 4 secciones, la ultima obligatoria.

---

## 1. La formula del rendimiento

```
rendimiento de una pieza = views de esa pieza / MEDIANA de views de ESA cuenta
```

Se escribe como multiplo con un decimal: `3.2x`, `1.0x`, `0.4x`.

### Umbrales (fijos, no se negocian)

| Rendimiento | Lectura |
|---|---|
| **> 1.5x** | "Que funciona". Entra a la seccion 1 del documento. |
| **0.7x a 1.5x** | Zona normal. Es la linea base de la cuenta. No prueba nada, ni a favor ni en contra. |
| **< 0.7x** | "Que no funciona". Entra a la seccion 2 del documento. |

La zona media existe y es la mayoria de las piezas. No se fuerza una pieza de `1.2x` a la
categoria de exito porque el patron nos guste.

### Por que la MEDIANA y no el promedio

Un solo video viral dispara el promedio y esconde la linea base real de la cuenta.

Ejemplo. Una cuenta con 9 reels:

```
views: 4.000  5.000  5.000  6.000  6.000  7.000  8.000  9.000  900.000

promedio = 105.556   ->  el reel de 6.000 mide 0.06x  (parece un fracaso)
mediana  =   6.000   ->  el reel de 6.000 mide 1.0x   (es exactamente lo normal)
                         y el de 900.000 mide 150x    (es lo que realmente paso)
```

Con el promedio, TODA la cuenta se ve fracasada y el unico video que importa se diluye.
Con la mediana, la linea base es la linea base y el outlier se ve del tamano que es.
El promedio mide el resultado agregado; la mediana mide **el video tipico de esa cuenta**,
que es contra lo que queremos comparar.

### Como se calcula la mediana

1. Ordenar de menor a mayor todas las views de las piezas recolectadas de esa cuenta.
2. Si `n` es impar: la mediana es el valor central.
3. Si `n` es par: la mediana es el promedio de los dos valores centrales.
4. Las piezas con views `s/d` **no entran** al calculo y **no reciben** rendimiento.

Reglas operativas derivadas:

- **Minimo n = 10** piezas para una mediana estable. Con `n` entre 5 y 9 se calcula igual
  pero se etiqueta `mediana provisional (n<10)` y se dice en la seccion 4. Con `n < 5` no
  se calcula rendimiento para esa cuenta: se reporta `s/d`.
- **La pieza no se excluye de su propia mediana.** La mediana es robusta a un outlier, y
  excluirla cambiaria la linea base de fila en fila.
- **Una mediana por cuenta y por tipo de contenido.** Si la cuenta mezcla reels y
  carruseles, o shorts y videos largos, se calcula una mediana para cada tipo: no compiten
  en la misma distribucion. La cuenta con un solo tipo tiene una sola mediana.
- **Un solo campo de views por cuenta.** Si la API devuelve `playCount` y `viewCount`, se
  elige uno y se usa el mismo en todas las piezas de esa cuenta. Mezclar campos inventa
  varianza. El campo elegido se anota en la seccion 4.

---

## 2. Por que se normaliza por cuenta

Las views absolutas no dicen nada sobre el contenido: dicen el tamano de la cuenta.

> 500k views en una cuenta de 10k seguidores vale mas que 600k en una de 1M.

La primera rompio su distribucion por 50x: el algoritmo la saco de su audiencia. La segunda
esta por debajo de lo que su propia base ya le garantiza. En absoluto, la segunda gana. En
rendimiento, la primera es la que hay que estudiar.

Consecuencias operativas:

- **Nunca se comparan views crudas entre cuentas.** Ni en la tabla, ni en el documento, ni
  en una frase suelta.
- **Se comparan multiplos.** `3.2x` de una cuenta chica y `3.4x` de una cuenta grande son
  comparables entre si; sus views no lo son.
- La columna RENDIMIENTO es la unica columna cuantitativa que cruza cuentas. Es el eje de
  todo el analisis.

---

## 3. La tabla: 10 columnas exactas

Orden fijo, nombres fijos, ni una columna mas ni una menos:

```
PIEZA | HOOK | TIPO DE HOOK | TEMA | FORMATO | DURACION | EMOCION | CTA | RENDIMIENTO | PATRON
```

### Definicion de cada columna

**1. PIEZA** — plataforma + fecha + titulo corto.
Formato: `plataforma / AAAA-MM-DD / titulo corto`. El titulo corto lo escribe el agente en
3-6 palabras para poder citar la pieza despues; no es el caption del autor.
Ej: `IG Reel / 2025-11-04 / El becario gana mas`

**2. HOOK** — las primeras 1-2 frases **LITERALES**.
Transcritas tal cual, entre comillas. No se parafrasea, no se corrige la gramatica, no se
resume. Si no hay transcripcion, `s/d` (no se reconstruye de memoria ni del caption).

**3. TIPO DE HOOK** — una sola de estas cinco:
- `pregunta directa` — interpela al espectador con una pregunta. "Sabes por que...?"
- `dato sorprendente` — abre con un numero o hecho contraintuitivo. "El 80% de..."
- `contraste` — pone dos cosas en oposicion. "Todos hacen X. Los que ganan hacen Y."
- `confesion` — el autor admite algo propio, costoso o vergonzoso. "Perdi 40 mil pesos en..."
- `promesa` — anuncia lo que el espectador se lleva. "En 30 segundos te enseno a..."

Si el hook tiene dos, gana **la que genera la tension**, no la que va primero.
"El 80% gana menos que su becario. Te muestro los numeros." -> `dato sorprendente`
(la promesa solo sostiene lo que el dato ya abrio).
Si no encaja en ninguna, `s/d` y se anota el caso en la seccion 4. No se inventan tipos
nuevos sobre la marcha.

**4. TEMA** — 3 a 5 palabras. Sustantivo, no frase. Se reusa el mismo texto exacto para el
mismo tema en toda la matriz, porque despues se agrupa por esta columna.
Ej: `precios de infoproductos`

**5. FORMATO** — una sola de estas cinco:
`habla-a-camara` / `tutorial` / `historia` / `lista` / `reaccion`

**6. DURACION** — en segundos, entero, sin unidad. Ej: `34`. Si la API no la da, `s/d`;
no se estima a ojo ni se deduce del tipo de contenido.

**7. EMOCION** — una sola de estas cuatro:
`curiosidad` / `sorpresa` / `identificacion` / `urgencia`
Es la emocion que **el hook produce en el espectador**, no la que el autor muestra en pantalla.

**8. CTA** — el CTA literal, entre comillas, o la palabra `ninguno`.
`ninguno` es un dato, no un hueco: muchas piezas de alto rendimiento no piden nada.
`s/d` solo si no hubo forma de ver el final de la pieza.

**9. RENDIMIENTO** — el multiplo contra la mediana de su cuenta, un decimal + `x`.
Ej: `3.2x`. Si views o mediana son `s/d`, aqui va `s/d`.

**10. PATRON** — **una linea** de por que funciono (o por que no). Descriptiva y especifica,
no un adjetivo. Mal: "buen hook". Bien: "dato numerico contraintuitivo en los primeros 2
segundos + promesa de prueba inmediata".

### Ejemplo de fila bien llena

| PIEZA | HOOK | TIPO DE HOOK | TEMA | FORMATO | DURACION | EMOCION | CTA | RENDIMIENTO | PATRON |
|---|---|---|---|---|---|---|---|---|---|
| IG Reel / 2025-11-04 / El becario gana mas | "El 80% de la gente que vende cursos gana menos que su becario. Te muestro los numeros." | dato sorprendente | precios de infoproductos | habla-a-camara | 34 | sorpresa | "comenta PRECIOS y te mando la plantilla" | 3.2x | dato numerico contraintuitivo en los primeros 2 segundos + promesa de prueba verificable en el mismo video |
| TikTok / 2025-10-22 / Mi rutina de la manana | "Buenos dias, hoy les traigo un dia en mi vida." | s/d | rutina diaria personal | historia | 58 | s/d | ninguno | 0.4x | apertura generica sin tension: los primeros 3 segundos no dan ninguna razon para quedarse |

La segunda fila muestra el uso correcto de `s/d`: el hook existe pero no cae en ninguno de
los cinco tipos, y la emocion no es identificable. Se deja vacio con `s/d` y se anota, no se
fuerza una categoria para que la celda se vea llena.

---

## 4. El documento de analisis: 4 secciones

Se escribe **despues** de la tabla y **solo** a partir de la tabla. Cada afirmacion tiene que
poder rastrearse a filas concretas.

### Seccion 1 — "Que funciona"

De 5 a 7 patrones presentes en piezas con rendimiento **> 1.5x**, **con citas a piezas**.

Cada patron se escribe asi:

```
PATRON: <enunciado en una linea>
Evidencia: <n> piezas, rendimiento de <min>x a <max>x (mediana <med>x)
Citas:
  - IG Reel / 2025-11-04 / El becario gana mas  -> 3.2x
    "El 80% de la gente que vende cursos gana menos que su becario."
  - TikTok / 2025-09-18 / Lo que nadie te dice  -> 2.1x
    "Nadie te va a decir esto porque a todos les conviene que no lo sepas."
```

Sin citas no es un patron: es una opinion. Minimo 2 citas literales por patron.

### Seccion 2 — "Que no funciona"

Mismo formato exacto, para patrones presentes en piezas con rendimiento **< 0.7x**.

Regla dura: **la ausencia de datos no es un patron negativo.** Que 12 piezas tengan la
duracion en `s/d` no permite concluir nada sobre la duracion. Eso va a la seccion 4.

### Seccion 3 — "El patron de viralidad"

**UN parrafo.** Un solo parrafo que sintetiza las cinco variables en una sola frase operativa:
**tipo de hook + tema + formato + duracion + emocion.**

Forma:

> En este nicho, lo que rompe la mediana es un hook de <tipo> sobre <tema>, en formato
> <formato>, de alrededor de <n> segundos, que dispara <emocion>. <Una o dos frases de
> matiz: donde se rompe la regla, que excepcion relevante aparecio.>

Nada mas. Sin vinetas, sin subsecciones. Si no cabe en un parrafo, es que la matriz todavia
no tiene un patron: se dice eso, con esas palabras.

Solo entran a esta seccion patrones que pasaron la regla de evidencia (seccion 6).

### Seccion 4 — "Lo que no sabemos" (OBLIGATORIA)

Es la varianza que la matriz **NO** explica. Esta seccion es lo que hace honesto al sistema:
sin ella, la matriz se lee como una formula causal y no lo es.

Se declara siempre, aunque la matriz haya salido limpia. Cubre como minimo:

- **Hora y dia de publicacion** — no capturado.
- **Miniatura / primer frame** — no capturado.
- **Calidad de edicion, ritmo de cortes, subtitulos, audio en tendencia** — no capturado.
- **Azar del algoritmo** — dos piezas identicas pueden separarse 10x sin causa observable.
- **Tamano, antiguedad y salud de la cuenta** en el momento de cada publicacion.
- **Promocion pagada o colaboraciones** — no distinguibles desde la API.
- **Ventana de recoleccion** — las piezas recientes siguen acumulando views y su
  rendimiento esta subestimado. Decir la fecha de corte.
- **Celdas en `s/d`** — cuantas, en que columnas, y que conclusiones quedan bloqueadas por eso.
- **Camino de analisis de cada pieza** — cuantas por audio (gemini) y cuantas por subtitulo quemado
  (fotogramas). Las segundas miden lo que el video MUESTRA, no lo que DICE.
- **Tamano de muestra por cuenta**, y cuales usaron `mediana provisional (n<10)`.
- **Que campo de views se uso** en cada cuenta.
- **Correlacion, no causalidad** — la matriz describe lo que coincidio con alto rendimiento,
  no lo que lo causo.

---

## 5. Reglas de datos (inviolables)

1. **Metrica que la API no da => `s/d`.** Nunca se inventa un numero. Nunca se interpola un
   cero. Un cero es un dato real ("cero comentarios"); un dato faltante es `s/d`. Confundirlos
   corrompe la mediana.
2. **Solo cuentas y videos PUBLICOS.** Nada privado, nada detras de login.
3. **Los datos crudos del scraper viven en `fuentes/` y NO se editan jamas.** Ni para
   corregir un typo, ni para rellenar un campo, ni para quitar un outlier. Todo lo derivado
   se escribe en `matriz/`. Si un dato crudo esta mal, se anota en la seccion 4 y se deja
   como esta.
4. **Toda estimacion se etiqueta como `basada-en-patrones`, nunca como prediccion.**
   Se escribe: "basada-en-patrones: piezas con este perfil rindieron entre 1.8x y 3.2x en
   esta muestra". No se escribe: "este video va a hacer 200 mil views".
5. **Nada de rellenar celdas por simetria.** Una tabla con `s/d` visibles es mas util que
   una tabla completa e inventada.

---

## 6. Regla de evidencia

> **Menos de 5 piezas para un patron = evidencia insuficiente. Se reporta, pero no se recomienda.**

Como se aplica:

- **n >= 5 piezas** que sostienen el patron -> entra normalmente a la seccion 1 o 2, y puede
  alimentar la seccion 3.
- **n de 2 a 4 piezas** -> se reporta en una lista aparte al final de la seccion 1 o 2,
  titulada **"Senales sin evidencia suficiente"**, con la etiqueta `evidencia insuficiente
  (n=3)`. **No** entra a la seccion 3. **No** se convierte en recomendacion.
- **n = 1 pieza** -> es una anecdota. Se menciona solo si el multiplo es extremo (por encima
  de 5x), y se etiqueta `pieza unica, no generalizable`.

Un patron con 3 piezas a 4x es interesante y hay que decirlo. Tambien hay que decir que con
3 piezas no se distingue de la suerte. Las dos cosas, en la misma frase.

### Piezas que comparten fuente de error

> **Un patron de HOOK no puede sostenerse SOLO con piezas analizadas por fotogramas, sin importar
> cuanto valga n.**

Cuando el HOOK sale del subtitulo quemado y no del audio (`_meta.hook_fuente:
"texto-en-pantalla"`), todas esas piezas comparten **el mismo modo de error**: el subtitulo recorta,
corrige la gramatica y a veces transcribe mal la misma palabra en todas. Cinco piezas asi no son
cinco observaciones independientes; son una observacion repetida cinco veces.

Si las n piezas que sostienen un patron de hook salieron todas por ese camino, se etiqueta
`evidencia insuficiente (fuente correlacionada, n=N)` aunque n >= 5. Basta con que **una** pieza del
grupo venga de audio para levantar la etiqueta, y se dice cual es.

---

## 7. Frecuencia x rendimiento: como se lee la oportunidad

Un patron tiene dos numeros, no uno:

- **RENDIMIENTO del patron** = mediana del rendimiento de las piezas que lo contienen.
  Alto si `>= 1.5x`. Bajo si `<= 0.7x`.
- **FRECUENCIA del patron** = % de piezas de toda la muestra que lo contienen.
  Alta si `>= 30%`. Baja si `<= 15%`. (Umbrales operativos: se declaran en el documento.)

Cruzados:

|  | **Frecuencia BAJA** | **Frecuencia ALTA** |
|---|---|---|
| **Rendimiento ALTO** | **OPORTUNIDAD** — funciona y casi nadie lo esta haciendo. Es lo primero que se recomienda. | **SATURACION** — funciona, pero ya lo hace todo el mundo. Entrar exige un diferencial propio; copiarlo tal cual llega tarde. |
| **Rendimiento BAJO** | **RUIDO** — poca gente lo hace y no rinde. Se ignora; solo se menciona si la evidencia es suficiente y sirve para descartar. | **COSTUMBRE MUERTA** — el nicho entero lo hace por inercia y no rinde. Es lo primero que se deja de hacer. Suele ser el hallazgo mas util de la matriz. |

Lectura:

- La recomendacion sale primero de **OPORTUNIDAD**, despues de dejar de hacer **COSTUMBRE MUERTA**.
- **SATURACION** no es un error: es donde esta la competencia. Se entra ahi solo con un
  angulo que la matriz muestre vacio.
- Alto rendimiento con frecuencia baja **y** menos de 5 piezas no es una oportunidad: es
  evidencia insuficiente (seccion 6). Los dos filtros se aplican, en ese orden.

---

## 8. Flujo de trabajo

1. Leer los datos crudos de `fuentes/` (solo lectura). Si una pieza aparece en varios crudos (corridas
   semanales), cuenta **una sola vez**, del crudo más reciente, tanto en la mediana como en la tabla.
2. Normalizar por cuenta: elegir el campo de views, separar por tipo de contenido.
3. Calcular la mediana de cada cuenta y cada tipo. Anotar `n`.
4. Calcular RENDIMIENTO de cada pieza. `s/d` donde falte el dato.
5. Llenar las 10 columnas. HOOK literal desde la transcripcion; TIPO DE HOOK, FORMATO y
   EMOCION desde las listas cerradas.
6. Agrupar por TEMA, TIPO DE HOOK, FORMATO, EMOCION y rangos de DURACION. Calcular
   rendimiento y frecuencia de cada grupo.
7. Aplicar la regla de evidencia y el cruce frecuencia x rendimiento.
8. Escribir las 4 secciones, en orden, con citas.
9. Antes de entregar, correr la revision de la seccion 9.

---

## 9. Revision antes de entregar

- [ ] La tabla tiene exactamente las 10 columnas, en el orden exacto.
- [ ] Ningun HOOK esta parafraseado. Todos son literales o `s/d`.
- [ ] TIPO DE HOOK, FORMATO y EMOCION solo usan valores de las listas cerradas o `s/d`.
- [ ] Ningun numero inventado. Ningun `0` puesto donde en realidad hay `s/d`.
- [ ] Ningun archivo de `fuentes/` fue modificado.
- [ ] Cada rendimiento se calculo contra la mediana de SU cuenta y SU tipo de contenido.
- [ ] No hay una sola comparacion de views crudas entre cuentas.
- [ ] La seccion 1 tiene entre 5 y 7 patrones, todos con al menos 2 citas.
- [ ] Todo patron con menos de 5 piezas esta etiquetado `evidencia insuficiente` y fuera de
      la seccion 3.
- [ ] La seccion 3 es UN parrafo y nombra las cinco variables.
- [ ] La seccion 4 existe, es especifica de esta matriz y dice la fecha de corte.
- [ ] Toda estimacion dice `basada-en-patrones`. En ningun lado dice "prediccion".
