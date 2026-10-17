#!/usr/bin/env node
/**
 * mediana.mjs — calcula el RENDIMIENTO de cada pieza contra la mediana de su cuenta.
 *
 *     rendimiento = views de la pieza / MEDIANA de views de ESA cuenta
 *     > 1.5x  ->  que funciona
 *     < 0.7x  ->  que no funciona
 *
 * Por que mediana y no promedio: un solo video que se disparo levanta el promedio y
 * deja a todo lo demas por debajo, y entonces "lo normal" de la cuenta queda definido
 * por su excepcion. La mediana ni se entera de ese video. Esa es la razon entera por la
 * que este archivo existe y por la que aqui no hay ninguna funcion de promedio.
 *
 * Por que las piezas sin dato NO valen cero: un null es "no lo se", y meterlo como cero
 * baja la mediana y hace que piezas mediocres aparezcan como 1.8x. Se listan aparte,
 * marcadas s/d, y no entran al calculo.
 */

import { pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * PUENTE DE LLAMADA. Los comandos del plugin invocan estos scripts con flags
 * (`--handle`, `--url`, `--video`, `--entrada`) mientras que el parseo de aqui
 * abajo es POSICIONAL. En vez de obligar a que las dos formas coincidan para
 * siempre -- cosa que se rompe en cuanto alguien edita un .md -- se aceptan las
 * dos y se traduce la de flags a la posicional antes de parsear.
 */
function normalizarArgv(argv) {
  const tieneFlagsConocidas = argv.some((a) => ["--entrada", "--archivo", "--fuente"].includes(a));
  if (!tieneFlagsConocidas) return argv;
  const v = (nombre) => {
    const i = argv.indexOf(nombre);
    if (i === -1) return null;
    const siguiente = argv[i + 1];
    return siguiente && !siguiente.startsWith("--") ? siguiente : null;
  };
  const archivo = v("--entrada") ?? v("--archivo") ?? v("--fuente");
  const resto = argv.filter(
    (a, i) =>
      !["--entrada", "--archivo", "--fuente"].includes(a) &&
      !["--entrada", "--archivo", "--fuente"].includes(argv[i - 1]),
  );
  return archivo ? [archivo, ...resto] : resto;
}


const SINONIMOS = {
  // Orden = el de apify.mjs (videoViewCount antes que videoPlayCount): UN solo campo de views por cuenta.
  views: ["views", "videoViewCount", "videoPlayCount", "playCount", "viewCount", "play_count"],
  likes: ["likes", "likesCount", "diggCount", "likeCount", "favoriteCount"],
  comentarios: ["comentarios", "commentsCount", "commentCount", "replyCount"],
  shares: ["shares", "sharesCount", "shareCount", "reshareCount"],
  duracion: ["duracion", "videoDuration", "duration", "durationSeconds"],
};

/**
 * Lee un campo tolerando las DOS formas que circulan por el sistema: la
 * normalizada que `apify.mjs` escribe a stdout (`views`) y la CRUDA que se
 * guarda intacta en `fuentes/` (`videoPlayCount`). Sin esto, pasarle a este
 * script un archivo de `fuentes/` -- lo natural, porque es el que queda en
 * disco -- fallaba diciendo que no hay views cuando si las hay.
 */
function valorDelCampo(pieza, campo) {
  if (!pieza || typeof pieza !== "object") return null;
  for (const clave of SINONIMOS[campo] ?? [campo]) {
    const v = pieza[clave];
    if (v !== undefined && v !== null) return v;
  }
  return null;
}


/** Los umbrales de la metodologia. No se tocan sin cambiar la metodologia. */
const UMBRAL_FUNCIONA = 1.5;
const UMBRAL_NO_FUNCIONA = 0.7;

/** Debajo de esto la mediana la mueve una sola pieza. Se avisa, no se bloquea. */
const MINIMO_CONFIABLE = 10;
/** Debajo de esto NO se calcula rendimiento (metodologia §1). */
const MINIMO_PARA_RENDIMIENTO = 5;

class ErrorHumano extends Error {}

const txt = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Solo cuenta lo que ES un numero. "1200" en texto no se convierte: si el
 *  normalizador dejo texto donde va un numero, eso es un bug que hay que ver, no algo
 *  que este script deba tapar. */
const num = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/**
 * La mediana de verdad: con cantidad par es el promedio de los dos de en medio, no el
 * de mas abajo. Con 8 piezas la diferencia entre las dos definiciones mueve el
 * rendimiento de todas.
 */
export function mediana(valores) {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

/** El array de piezas, venga suelto o envuelto. Los crudos de fuentes/ lo traen en
 *  `items`; la salida de apify.mjs es un array pelon. */
function extraerPiezas(datos, ruta) {
  if (Array.isArray(datos)) return datos;
  for (const llave of ["items", "piezas", "posts", "datos", "results"]) {
    if (Array.isArray(datos?.[llave])) return datos[llave];
  }
  throw new ErrorHumano(
    `${ruta} no tiene un array de piezas. Se esperaba un array en la raiz o dentro de items/piezas/posts/datos.`,
  );
}

/** Como se nombra la pieza en la salida: lo que sirva para encontrarla despues. */
function etiquetar(pieza, indice) {
  const id = txt(pieza.id) ?? txt(pieza.shortCode) ?? txt(pieza.url) ?? `#${indice + 1}`;
  const fechaCruda = txt(pieza.fecha) ?? txt(pieza.timestamp) ?? txt(pieza.createTimeISO) ?? txt(pieza.date);
  const fecha = fechaCruda ? fechaCruda.slice(0, 10) : "s/d";
  const textoCrudo =
    txt(pieza.texto) ?? txt(pieza.caption) ?? txt(pieza.text) ?? txt(pieza.title) ?? "";
  const resumen = textoCrudo.replace(/\s+/g, " ").slice(0, 46);
  return { id, fecha, resumen: resumen + (textoCrudo.length > 46 ? "..." : "") };
}

function marcar(rendimiento) {
  if (rendimiento > UMBRAL_FUNCIONA) return "FUNCIONA";
  if (rendimiento < UMBRAL_NO_FUNCIONA) return "NO FUNCIONA";
  return "";
}

const miles = (n) => n.toLocaleString("es-MX", { maximumFractionDigits: 0 });

function uso(codigo) {
  console.error(`
uso: node mediana.mjs <archivo.json> [--campo views] [--json]

Lee un array de piezas, calcula la MEDIANA del campo (no el promedio) ignorando los
null, e imprime el rendimiento de cada pieza contra esa mediana, de mayor a menor.

  > 1.5x  FUNCIONA        < 0.7x  NO FUNCIONA

opciones
  --campo N   metrica contra la que se mide. Default: views
  --json      salida a maquina en vez de tabla

ejemplo
  node mediana.mjs fuentes/tiktok-mareviteri-posts.json --campo views
`);
  process.exit(codigo);
}

function principal() {
  const argv = normalizarArgv(process.argv.slice(2));
  if (argv.length === 0 || argv[0] === "--ayuda" || argv[0] === "-h") uso(argv.length === 0 ? 1 : 0);

  const ruta = resolve(argv[0]);
  let campo = "views";
  let comoJson = false;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--json") comoJson = true;
    else if (argv[i] === "--campo") {
      campo = argv[i + 1];
      if (!campo || campo.startsWith("--")) throw new ErrorHumano("A --campo le falta el nombre de la metrica.");
      i++;
    } else throw new ErrorHumano(`Opcion desconocida: ${argv[i]}`);
  }

  if (!existsSync(ruta)) throw new ErrorHumano(`No existe el archivo ${ruta}.`);
  let datos;
  try {
    datos = JSON.parse(readFileSync(ruta, "utf8"));
  } catch (e) {
    throw new ErrorHumano(`${ruta} no es JSON valido: ${e.message}`);
  }

  const piezas = extraerPiezas(datos, ruta);
  if (piezas.length === 0) throw new ErrorHumano(`${ruta} trae el array vacio: no hay nada que medir.`);

  const conDato = [];
  const sinDato = [];
  piezas.forEach((pieza, indice) => {
    
const valor = num(valorDelCampo(pieza, campo));
    const etiqueta = etiquetar(pieza ?? {}, indice);
    if (valor === null) sinDato.push(etiqueta);
    else conDato.push({ ...etiqueta, valor });
  });

  if (conDato.length === 0) {
    throw new ErrorHumano(
      `Ninguna de las ${piezas.length} piezas trae "${campo}" como numero. ` +
        (campo === "views"
          ? "En Instagram las views solo existen en posts de video: en carruseles e imagenes el concepto no aplica. Prueba --campo likes."
          : "Revisa el nombre del campo contra el archivo."),
    );
  }

  if (conDato.length < MINIMO_PARA_RENDIMIENTO) {
    throw new ErrorHumano(
      `Solo hay ${conDato.length} pieza(s) con ${campo}. Con menos de ${MINIMO_PARA_RENDIMIENTO} no hay base para ` +
        "calcular rendimiento: todas quedan s/d (regla de matriz-metodologia). Trae mas piezas.",
    );
  }
  const med = mediana(conDato.map((p) => p.valor));
  if (med === 0) {
    throw new ErrorHumano(
      `La mediana de "${campo}" es 0, asi que el rendimiento no se puede calcular (seria dividir entre cero). ` +
        "Con la mitad de las piezas en cero, esa metrica no describe a esta cuenta: mide con otra.",
    );
  }

  const medidas = conDato
    .map((p) => ({ ...p, rendimiento: p.valor / med }))
    .sort((a, b) => b.rendimiento - a.rendimiento);

  if (comoJson) {
    process.stdout.write(
      JSON.stringify(
        {
          archivo: ruta,
          campo,
          mediana: med,
          piezas_con_dato: conDato.length,
          piezas_sin_dato: sinDato.length,
          mediana_fragil: conDato.length < MINIMO_CONFIABLE,
          piezas: medidas.map((p) => ({
            id: p.id,
            fecha: p.fecha,
            valor: p.valor,
            rendimiento: Number(p.rendimiento.toFixed(2)),
            marca: marcar(p.rendimiento) || "normal",
          })),
          sin_dato: sinDato.map((p) => ({ id: p.id, fecha: p.fecha, valor: null })),
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  const lineas = [];
  lineas.push("");
  lineas.push(`MEDIANA de ${campo}: ${miles(med)}   (sobre ${conDato.length} piezas con dato)`);
  if (sinDato.length > 0) {
    lineas.push(`${sinDato.length} pieza(s) sin dato quedan FUERA del calculo — s/d no es cero.`);
  }
  if (conDato.length < MINIMO_CONFIABLE) {
    lineas.push("");
    lineas.push(
      `AVISO: con ${conDato.length} piezas la mediana es fragil. Una sola pieza la mueve, y con ella se`,
    );
    lineas.push(
      `mueve el rendimiento de TODAS. Trae al menos ${MINIMO_CONFIABLE} antes de escribir conclusiones.`,
    );
  }
  lineas.push("");
  lineas.push(
    `${"RENDIM.".padStart(8)}  ${"MARCA".padEnd(11)}  ${campo.toUpperCase().padStart(11)}  PIEZA`,
  );
  lineas.push("-".repeat(78));
  for (const p of medidas) {
    const rend = `${p.rendimiento.toFixed(2)}x`.padStart(8);
    lineas.push(
      `${rend}  ${marcar(p.rendimiento).padEnd(11)}  ${miles(p.valor).padStart(11)}  ${p.id} · ${p.fecha} · ${p.resumen}`,
    );
  }
  for (const p of sinDato) {
    lineas.push(`${"s/d".padStart(8)}  ${"".padEnd(11)}  ${"s/d".padStart(11)}  ${p.id} · ${p.fecha} · ${p.resumen}`);
  }

  const funcionan = medidas.filter((p) => p.rendimiento > UMBRAL_FUNCIONA).length;
  const noFuncionan = medidas.filter((p) => p.rendimiento < UMBRAL_NO_FUNCIONA).length;
  lineas.push("-".repeat(78));
  lineas.push(
    `${funcionan} por encima de ${UMBRAL_FUNCIONA}x · ${medidas.length - funcionan - noFuncionan} en la banda normal · ${noFuncionan} por debajo de ${UMBRAL_NO_FUNCIONA}x`,
  );
  lineas.push("");
  lineas.push(
    "Este multiplo solo compara la cuenta contra si misma. Para comparar dos cuentas hay que",
  );
  lineas.push("calcular la mediana de cada una por separado.");
  lineas.push("");
  process.stdout.write(lineas.join("\n") + "\n");
}

// Solo corre el CLI cuando se ejecuta directo; importado, solo expone `mediana`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    principal();
  } catch (e) {
    if (e instanceof ErrorHumano) console.error(`\nERROR: ${e.message}\n`);
    else console.error(`\nERROR inesperado: ${e?.stack ?? e}\n`);
    process.exit(1);
  }
}
