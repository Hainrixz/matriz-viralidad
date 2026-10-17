---
name: matriz-sentimiento
description: Lee los comentarios de los posts más virales de una cuenta y dice qué piensa, qué duda y qué pide la audiencia
argument-hint: "<handle> <red> [cuantos-posts]"
---

# /matriz-sentimiento — qué está diciendo la gente

Las métricas te dicen que un video funcionó. Los comentarios te dicen **por qué la gente se quedó**,
qué no entendió, y qué está pidiendo que nadie le ha dado. Eso último es el material de tu próximo
video.

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

- `node "<RAIZ>/scripts/revisar.mjs" llaves` debe decir `APIFY_TOKEN: presente`. Si falta: dilo, di que sale de
  https://apify.com/sign-up, y para.
- `$ARGUMENTS`: handle y red. Si viene vacío, pregunta de qué cuenta y espera. No adivines.
  El tercer argumento (opcional) es de cuántos posts leer los comentarios; por defecto **5**.
- Solo cuentas públicas.

---

## Paso 1 — mira lo que ya tienes antes de gastar

Busca en `fuentes/` un archivo de esa cuenta y esa red:
`ls fuentes/<red>-<handle>-*.json 2>/dev/null`

Si existe y **ya trae comentarios dentro**, úsalos. En Instagram el actor devuelve los últimos
comentarios de cada post **sin costo adicional** — está medido, no supuesto. Gastar otra corrida
para traer lo que ya está en disco es tirar dinero.

Revisa el crudo para ver si hay comentarios y cuántos:

```bash
node "<RAIZ>/scripts/revisar.mjs" comentarios "fuentes/<archivo>.json"
```

Si no hay nada guardado, o lo que hay es de hace semanas, corre el scraper de comentarios (la operación
`comentarios` del mismo script; en Instagram los comentarios viajan dentro del post). **Primero
`--estimar` y el sí de la persona.** Por defecto `--posts 5 --limite 20 --tope 0.50`:

```bash
node "<RAIZ>/scripts/apify.mjs" comentarios <handle> <red> --posts 5 --limite 20 --tope 0.50 --estimar
node "<RAIZ>/scripts/apify.mjs" comentarios <handle> <red> --posts 5 --limite 20 --tope 0.50 > ".matriz/comentarios-<red>-<handle>.json"
```

Redes con comentarios: `instagram`, `tiktok`, `youtube`. En `x` las respuestas son tuits: se traen con
`posts` sobre la conversación.

**Si el actor de esa red no devuelve comentarios**, no inventes otro actor de memoria. Dilo, y ofrece
buscar uno en el Store de Apify (con el buscador de actores) mostrando su costo **antes** de correrlo.
Si el usuario no quiere gastar, di que los comentarios de esa red quedan `s/d` y para.

---

## Paso 2 — elige los posts

Corre `mediana.mjs` sobre el crudo para ordenar por rendimiento:

```bash
node "<RAIZ>/scripts/mediana.mjs" "fuentes/<archivo>.json"
```

Toma los **N más virales** (por defecto 5). Son los que tienen la conversación interesante: un post
promedio trae comentarios de gente que ya te seguía; un post que se disparó trae a los que llegaron
de fuera, y esos son los que preguntan lo que tú ya dabas por sabido.

Di en el chat cuáles elegiste, con su múltiplo y cuántos comentarios trae cada uno.

---

## Paso 3 — saca el subagente `sentimiento`

Con **Agent**, `subagent_type: "sentimiento"`. Dale:

- la ruta del crudo y los ids de los posts elegidos;
- el nicho, de `perfil.json` si existe;
- las cuatro preguntas que tiene que contestar y nada más:

  1. **Qué piensan** — cómo reaccionan, qué les gustó, en qué se reconocen.
  2. **Qué dudas repiten** — lo que preguntan más de una vez. Cada duda repetida es un video.
  3. **Qué objeciones tienen** — por qué dicen que no les va a funcionar, o que no es para ellos.
  4. **Qué piden** — lo que están pidiendo explícitamente y todavía no existe.

- y las reglas de abajo, tal cual.

---

## Reglas al leer comentarios

- **Cita textual.** El comentario va entre comillas, tal como se escribió: sin corregir la ortografía,
  sin traducir, sin "limpiarlo". La forma en que la gente escribe es parte del dato, y además es de
  donde salen los hooks que suenan a persona.
- Cada cita lleva de qué pieza salió.
- **Distingue el uno del muchos.** "Lo preguntaron 14 veces" y "lo dijo una persona" no son lo mismo,
  y escribirlos igual es mentir. Pon el conteo.
- Un tema con **menos de 3 menciones** no es un patrón. Ponlo en una lista aparte de "señales
  sueltas", si acaso.
- **No inventes comentarios**, ni siquiera como ejemplo o para ilustrar. Si necesitas un ejemplo y no
  lo tienes, di que no lo tienes.
- Di **cuántos comentarios leíste de cuántos posts**. Ese número es el techo de todo lo que afirmes.
  Si son 60 comentarios de 5 posts, eso no es "lo que piensa tu audiencia", es lo que dijeron 60
  personas que comentaron, que además son las más activas y no las más representativas. Escríbelo.
- Los comentarios de spam, bots y emojis sueltos se descartan; di cuántos descartaste.
- No pongas un porcentaje de "sentimiento positivo/negativo". Con esta muestra, ese número no
  significa nada. Describe, no puntúes.

---

## Paso 4 — el archivo

`matriz/sentimiento-<handle>-<fecha>.md`, con:

1. **De dónde sale**: cuentas, posts, cuántos comentarios, fechas, archivo crudo.
2. **Qué piensan** — 3 a 5 puntos, cada uno con 2 citas.
3. **Qué dudas repiten** — ordenadas por número de menciones, con el conteo delante.
4. **Qué objeciones tienen** — igual.
5. **Qué piden** — igual. Esta lista es la más accionable; ponla en un formato que se pueda convertir
   en temas de video directo.
6. **Lo que esto no me dice**: quién no comentó, si los que comentan son los que compran, cuántos
   comentarios vio realmente el algoritmo, y que la muestra son los últimos comentarios de cada post,
   no todos.

---

Cierra sugiriendo: los temas de "qué piden" y "qué dudas repiten" entran a `/matriz-calendario` como
contenido con demanda comprobada.

Imprime la lista de archivos que escribiste, con su ruta.
