#!/usr/bin/env node
/**
 * descargar.mjs — baja un video a disco desde un CDN que expira.
 *
 * Dos reglas que no se negocian:
 *
 *  1. Streaming, jamas `arrayBuffer()`. El cuerpo pasa de la red al disco por trozos.
 *     Juntar un reel de 50 MB en memoria son cientos de MB de pico en Node, y la
 *     rutina baja decenas seguidos.
 *  2. Se escribe en un `.parcial` que se renombra al terminar. Un corte a media
 *     descarga deja un mp4 truncado con nombre de mp4 bueno, y ese archivo despues
 *     falla en Gemini con un error que parece del modelo y no lo es.
 *
 * Sobre la frescura: la URL de video de un CDN social vive minutos u horas. Medido el
 * 2026-08-20 sobre Instagram: 6 de 6 descargas OK sobre URLs de minutos antes, y el
 * Referer resulto NO ser necesario (5 de 5 bajaron sin el). Se manda igual porque no
 * cuesta nada y otros CDN si lo miran. Un 403/404 aqui casi nunca es un bloqueo: es
 * que la URL vencio, y la unica cura es volver a scrapear.
 */

import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * PUENTE DE LLAMADA. Los comandos del plugin invocan estos scripts con flags
 * (`--handle`, `--url`, `--video`, `--entrada`) mientras que el parseo de aqui
 * abajo es POSICIONAL. En vez de obligar a que las dos formas coincidan para
 * siempre -- cosa que se rompe en cuanto alguien edita un .md -- se aceptan las
 * dos y se traduce la de flags a la posicional antes de parsear.
 */
function normalizarArgv(argv) {
  const tieneFlagsConocidas = argv.some((a) => ["--url", "--salida", "--destino"].includes(a));
  if (!tieneFlagsConocidas) return argv;
  const v = (nombre) => {
    const i = argv.indexOf(nombre);
    if (i === -1) return null;
    const siguiente = argv[i + 1];
    return siguiente && !siguiente.startsWith("--") ? siguiente : null;
  };
  const url = v("--url");
  const salida = v("--salida") ?? v("--destino");
  const resto = argv.filter(
    (a, i) =>
      !["--url", "--salida", "--destino"].includes(a) &&
      !["--url", "--salida", "--destino"].includes(argv[i - 1]),
  );
  return [url, salida, ...resto].filter((x) => x !== null && x !== undefined);
}


/** Chrome de verdad. Un request que no parece navegador se lleva 403 sistematicos, y
 *  ese 403 se confunde con "la URL expiro": el diagnostico se va horas por el camino
 *  equivocado. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** El Referer se deduce del dominio del CDN. */
const REFERER_POR_DOMINIO = [
  [/cdninstagram|fbcdn/i, "https://www.instagram.com/"],
  [/tiktokcdn|tiktokv|byteoversea|muscdn/i, "https://www.tiktok.com/"],
  [/googlevideo|ytimg|youtube/i, "https://www.youtube.com/"],
  [/twimg|twitter|x\.com/i, "https://x.com/"],
  [/licdn|linkedin/i, "https://www.linkedin.com/"],
];

/** Los dos status que NO se arreglan reintentando: el recurso ya no esta ahi. */
const DEFINITIVOS = new Set([403, 404, 410]);

/** Reintentos ADICIONALES al primer intento. 2 = tres intentos en total. */
const REINTENTOS = 2;
const ESPERA_BASE_MS = 1500;

class ErrorHumano extends Error {}

const dormir = (ms) => new Promise((seguir) => setTimeout(seguir, ms));

function refererDe(url) {
  for (const [patron, referer] of REFERER_POR_DOMINIO) {
    if (patron.test(url)) return referer;
  }
  return null;
}

function headers(url) {
  const cabeceras = {
    "User-Agent": USER_AGENT,
    Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
    "Accept-Encoding": "identity", // sin compresion: el mp4 ya viene comprimido y asi el tamano en disco cuadra con content-length
    Connection: "keep-alive",
  };
  const referer = refererDe(url);
  if (referer) cabeceras.Referer = referer;
  return cabeceras;
}

function humano(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** Un intento completo: pide, revisa, y vuelca al `.parcial`. */
async function intentar(url, parcial) {
  const respuesta = await fetch(url, { headers: headers(url), redirect: "follow" });

  if (DEFINITIVOS.has(respuesta.status)) {
    throw new ErrorHumano(
      `El CDN contesto ${respuesta.status}. La URL del video EXPIRO — estas URLs viven minutos u horas. ` +
        "Reintentar no la revive: hay que volver a scrapear la cuenta y bajar el video de inmediato, " +
        "en la misma corrida.",
    );
  }
  if (!respuesta.ok) {
    // Recuperable: 5xx, 429, cortes del CDN. Lo atrapa el bucle de reintentos.
    const error = new Error(`el CDN contesto ${respuesta.status}`);
    error.reintentable = true;
    throw error;
  }
  if (!respuesta.body) {
    const error = new Error("el CDN contesto 200 pero sin cuerpo");
    error.reintentable = true;
    throw error;
  }

  // Una pagina HTML con status 200 es la otra cara de la URL vencida: el CDN redirige
  // a un "contenido no disponible" en vez de dar 404. Guardarla como .mp4 produce un
  // archivo que solo falla mucho despues, en Gemini.
  const tipo = respuesta.headers.get("content-type") ?? "";
  if (/text\/html|application\/json/i.test(tipo)) {
    throw new ErrorHumano(
      `El CDN contesto 200 pero mando "${tipo}" en vez de video. Es una pagina de error disfrazada: ` +
        "la URL ya no sirve y hay que volver a scrapear.",
    );
  }

  const esperado = Number(respuesta.headers.get("content-length"));
  await pipeline(Readable.fromWeb(respuesta.body), createWriteStream(parcial));

  const bytes = statSync(parcial).size;
  if (bytes === 0) {
    const error = new Error("la descarga llego vacia");
    error.reintentable = true;
    throw error;
  }
  if (Number.isFinite(esperado) && esperado > 0 && bytes !== esperado) {
    // Truncado. Reintentable, y sobre todo: NO se renombra a .mp4.
    const error = new Error(`se esperaban ${esperado} bytes y llegaron ${bytes}`);
    error.reintentable = true;
    throw error;
  }
  return bytes;
}

function uso(codigo) {
  console.error(`
uso: node descargar.mjs <url> <destino.mp4>

Baja el video en streaming al destino. El directorio se crea si falta.
Reintenta 2 veces los fallos de red; un 403/404 no se reintenta porque la URL vencio.

ejemplo
  node descargar.mjs "https://scontent.cdninstagram.com/....mp4" videos/ig_001.mp4
`);
  process.exit(codigo);
}

async function principal() {
  const argv = normalizarArgv(process.argv.slice(2));
  if (argv.length === 0 || argv[0] === "--ayuda" || argv[0] === "-h") uso(argv.length === 0 ? 1 : 0);
  if (argv.length < 2) uso(1);

  const [url, destinoCrudo] = argv;
  if (!/^https?:\/\//i.test(url)) throw new ErrorHumano(`"${url}" no parece una URL http(s).`);

  const destino = resolve(destinoCrudo);
  // El destino SOLO puede ser un .mp4 dentro de videos/ (de la carpeta del proyecto): sin esto, un
  // destino como scripts/guardia.mjs o .claude/settings.json reemplazaria archivos del sistema.
  const videos = resolve(process.cwd(), "videos") + sep;
  if (!destino.startsWith(videos) || !/\.mp4$/i.test(destino)) {
    throw new ErrorHumano(`El destino tiene que ser un .mp4 dentro de videos/ (recibi "${destinoCrudo}").`);
  }
  const parcial = `${destino}.parcial`;
  mkdirSync(dirname(destino), { recursive: true });
  if (existsSync(parcial)) rmSync(parcial); // sobra de una corrida que se murio

  let ultimo = null;
  for (let intento = 0; intento <= REINTENTOS; intento++) {
    try {
      if (intento > 0) {
        const espera = ESPERA_BASE_MS * intento;
        console.error(`   reintento ${intento}/${REINTENTOS} en ${espera / 1000}s (${ultimo.message})`);
        await dormir(espera);
      }
      const bytes = await intentar(url, parcial);
      // El rename es lo ultimo: hasta aqui, en disco solo hubo un .parcial.
      renameSync(parcial, destino);
      console.error(`   descargado`);
      process.stdout.write(`${destino}\n${humano(bytes)} (${bytes} bytes)\n`);
      return;
    } catch (e) {
      if (existsSync(parcial)) rmSync(parcial, { force: true });
      if (e instanceof ErrorHumano) throw e; // definitivo: no se reintenta
      if (e instanceof TypeError && /fetch failed/i.test(e.message)) {
        e.reintentable = true;
        e.message = "no hubo salida a internet o el CDN corto la conexion";
      }
      if (!e.reintentable) throw e;
      ultimo = e;
    }
  }

  throw new ErrorHumano(
    `Los ${REINTENTOS + 1} intentos fallaron. Ultimo: ${ultimo.message}. ` +
      "Si se repite en varios videos de la misma tanda, las URLs ya vencieron: vuelve a scrapear.",
  );
}

principal().catch((e) => {
  if (e instanceof ErrorHumano) {
    console.error(`\nERROR: ${e.message}\n`);
  } else {
    console.error(`\nERROR inesperado: ${e?.stack ?? e}\n`);
  }
  process.exit(1);
});
