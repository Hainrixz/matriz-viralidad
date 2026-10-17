---
name: matriz-ganador
description: Cruza qué tan usado está cada patrón contra cuánto rinde, para hallar lo que funciona y todavía no satura
argument-hint: "[propio | competencia | todo]"
---

# /matriz-ganador — lo que funciona y nadie está exprimiendo

`/matriz-construir` te dice **qué funciona**. Este comando te dice **qué funciona y todavía queda espacio**.

La idea entera cabe en un cruce (los mismos cuadrantes y umbrales de la skill `matriz-metodologia`, §7):

```
                    FRECUENCIA BAJA          FRECUENCIA ALTA
RENDIMIENTO ALTO    ->  OPORTUNIDAD          ->  SATURACION
RENDIMIENTO BAJO    ->  RUIDO                ->  COSTUMBRE MUERTA
```

- **OPORTUNIDAD**: rinde y casi nadie lo usa. Aquí es donde hay que ir.
- **SATURACION**: rinde, pero ya lo hace todo el mundo. Entrar exige un diferencial propio.
- **COSTUMBRE MUERTA**: el nicho entero lo hace por inercia y no rinde. Dejar de hacerlo es la ganancia.
- **RUIDO**: poca gente lo hace y no rinde. No hay nada que decir; no lo conviertas en consejo.

---

## Antes de empezar

- Necesitas `matriz/matriz-contenido-viral.md`. Si no existe: dilo y para. **Corre `/matriz-construir` primero.**
- Lee también `matriz/patrones-de-viralidad.md` si está, para no contradecirlo sin darte cuenta.
- `$ARGUMENTS`: `propio` = solo filas de las cuentas de `perfil.json`; `competencia` = solo las demás;
  `todo` o vacío = todas. Di al principio qué recorte estás usando y cuántas filas quedaron.

---

## Paso 1 — cuenta

Las dimensiones que cruzas son las columnas de la matriz que se repiten:

- TIPO DE HOOK
- TEMA (agrupa temas que son el mismo con otras palabras; di cómo los agrupaste)
- FORMATO
- DURACION, en tramos: `0-15s`, `16-30s`, `31-60s`, `+60s`
- EMOCION
- CTA (agrupa en: `ninguno`, `seguir`, `comentar`, `guardar`, `link o perfil`)

Para cada valor de cada dimensión saca dos números:

```
frecuencia  = piezas que lo usan / total de piezas   (en %)
rendimiento = MEDIANA del múltiplo de esas piezas    (mediana, no promedio)
```

Mediana y no promedio, a propósito: un solo video de 12x le sube el promedio a un patrón que en
realidad no rinde. La mediana no se deja.

Las piezas con RENDIMIENTO `s/d` **cuentan para la frecuencia** (sí se publicaron) pero **no para el
rendimiento** (no se sabe cómo les fue). Di cuántas quedaron así en cada celda.

---

## Paso 2 — los cortes

Usa estos, y **declara que son una convención tuya, no una ley**:

- Frecuencia alta: **30% o más** de las piezas. Frecuencia baja: **15% o menos**. Entre 15% y 30% no se clasifica (zona media).
- Rendimiento alto: mediana **1.5x o más** (el mismo umbral de la metodología).
- Rendimiento bajo: mediana **por debajo de 0.7x**.
- **Mínimo 5 piezas** por celda para recomendar (regla de evidencia de la metodología). Con 2 a 4,
  escríbelo `evidencia insuficiente (n=3)`, repórtalo en una lista aparte y no lo conviertas en
  recomendación. Con 1 es una anécdota. Un hook cuyas piezas salieron todas por fotogramas comparte
  fuente de error: `evidencia insuficiente (fuente correlacionada)`.

Si el total de filas de la matriz es menor a 10, avisa arriba del archivo que **los porcentajes de
frecuencia se mueven mucho** con tan pocas piezas y que esto es una orientación, no un veredicto.

---

## Paso 3 — el archivo

Escribe `matriz/ganador.md` con esto:

1. **De dónde sale**: cuántas piezas, de qué cuentas, de qué fechas, qué recorte usaste.
2. **La tabla completa**, ordenada por cuadrante:

```
| DIMENSION | VALOR | PIEZAS | FRECUENCIA | RENDIMIENTO (mediana) | CUADRANTE |
|---|---|---|---|---|---|
| TIPO DE HOOK | contraste | 6 | 18% | 2.9x | OPORTUNIDAD |
| FORMATO | lista | 9 | 41% | 1.8x | SATURACION |
| EMOCION | urgencia | 7 | 32% | 0.5x | COSTUMBRE MUERTA |
| TEMA | rutina de mañana | 2 | 9% | 3.1x | evidencia insuficiente (n=2) |
```

3. **Las 3 oportunidades**, en orden. Cada una:
   - qué es, en una frase que se pueda ejecutar;
   - los dos números (frecuencia y rendimiento);
   - **las piezas que la respaldan**, citadas por su nombre de la columna PIEZA;
   - qué habría que probar para confirmarla (cuántos videos, en cuánto tiempo).
4. **Lo que hay que dejar de hacer**: las COSTUMBRES MUERTAS, con sus piezas citadas. Sin rodeos.
5. **Lo saturado (SATURACION)**: qué sigue funcionando pero ya no es ventaja.
6. **Lo que este cruce no ve**: que frecuencia baja también puede significar *"ya lo probaron y no
   funcionó y por eso nadie lo hace"*; que la muestra es de las cuentas que espiaste, no del nicho
   entero; que un patrón puede rendir por quién lo dice y no por lo que es. Esta parte va, siempre.

Cierra con: *"Esto está **basado en patrones** de <n> piezas. No es una predicción de resultados."*

---

## Si quieres delegarlo

Si hay muchas filas, saca un subagente con **Agent** (`subagent_type: "matricero"`; pásale `RAIZ` y las rutas exactas `matriz/matriz-contenido-viral.md` y `matriz/patrones-de-viralidad.md`) para que haga el
conteo y te devuelva la tabla del Paso 3; tú revisas los cuadrantes y escribes las conclusiones.
Dale la ruta de `matriz/matriz-contenido-viral.md` y los cortes del Paso 2 tal como están escritos aquí.

---

Termina diciendo qué correr después: `/matriz-calendario` para volcarlo a un plan, o `/matriz-espiar` para
conseguir más piezas si alguna celda se quedó en `evidencia insuficiente`.

Imprime la lista de archivos que escribiste, con su ruta.
