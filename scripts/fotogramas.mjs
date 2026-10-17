#!/usr/bin/env node
/**
 * fotogramas.mjs — parte un video local en fotogramas para que Claude los lea.
 *
 * Por que existe: `gemini.mjs` es el unico camino de analisis del sistema. Si la API
 * se cae, se agota la cuota o la key falla, no hay `transcripciones/` y sin eso la
 * matriz no tiene HOOK. Este script es el paracaidas: extrae fotogramas y el agente
 * `analista-video` los mira con su propia vision, sin llamar a ningun servicio de pago.
 *
 * Por que fotogramas y no audio: aqui NO se transcribe audio. Ni una palabra. Lo que
 * se lee es el subtitulo quemado en pantalla. Medido el 2026-08-20 sobre los 6 reels
 * del corpus: los 6 traen subtitulo karaoke legible, y en uno la reconstruccion salio
 * identica caracter por caracter a lo que Gemini saco del audio. Pero es una medicion
 * distinta y quien la use tiene que saberlo.
 *
 * Por que Node pelado y no ffmpeg-wasm ni un wrapper: el plugin corre dentro de Claude
 * Code sin `npm install`. Solo Node nativo mas los binarios que ya estan en la maquina.
 *
 * Por que una rejilla fija de tiempos y no deteccion de escena: medido sobre el corpus,
 * `select='gt(scene,0.30)'` devuelve CERO cortes en 3 de los 6 videos, porque son
 * cabeza parlante sin edicion. Un horario basado en cortes deja esos tres en blanco.
 * Los cortes solo pueden sumar; nunca ser la base.
 */

import { pathToFileURL } from "node:url";
import { existsSync, mkdirSync, rmSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, join, resolve } from "node:path";

/**
 * PUENTE DE LLAMADA. Los comandos del plugin invocan estos scripts con flags
 * (`--handle`, `--url`, `--video`, `--entrada`) mientras que el parseo de aqui
 * abajo es POSICIONAL. En vez de obligar a que las dos formas coincidan para
 * siempre -- cosa que se rompe en cuanto alguien edita un .md -- se aceptan las
 * dos y se traduce la de flags a la posicional antes de parsear.
 */
function normalizarArgv(argv) {
  const tieneFlagsConocidas = argv.some((a) => a === "--video" || a === "--ruta");
  if (!tieneFlagsConocidas) return argv;
  const v = (nombre) => {
    const i = argv.indexOf(nombre);
    if (i === -1) return null;
    const siguiente = argv[i + 1];
    return siguiente && !siguiente.startsWith("--") ? siguiente : null;
  };
  const ruta = v("--video") ?? v("--ruta");
  const resto = argv.filter(
    (a, i) =>
      !["--video", "--ruta"].includes(a) && !["--video", "--ruta"].includes(argv[i - 1]),
  );
  return [ruta ?? "", ...resto];
}

/** Alto en pixeles de la zona del hook. Alto porque de aqui sale `hook_texto`, que es
 *  una transcripcion LITERAL: hay que poder leer los acentos. Medido: a 512 px las
 *  palabras se leen pero la tilde de "¿Sabias?" queda ambigua, y una tilde inventada
 *  ya no es literal. A 1280 no hay duda. */
const ALTO_HOOK = 1280;

/** Alto de cuerpo y cola. Aqui no se transcribe nada palabra por palabra: se describe
 *  que pasa. 512 px cuesta ~196 tokens contra ~1230, seis veces menos, y alcanza de
 *  sobra para ver un cambio de plano o un texto grande. */
const ALTO_CUERPO = 512;

/** Cada cuanto se muestrea el hook. Medido sobre el corpus: los trozos de subtitulo
 *  duran entre 0.27 s (una sola palabra, "literalmente") y 1.0 s. Muestrear mas lento
 *  que el trozo mas corto pierde palabras EN SILENCIO, que es el peor error posible
 *  aqui: la cadena cosida se lee entera y nadie nota el hueco. */
const PASO_HOOK = { completo: 0.28, denso: 0.15, barato: 0.5, hook: 0.28 };

/** Donde arranca la zona A. No en 0.0: medido, en 3 de 6 videos el subtitulo todavia
 *  no aparecio en el primer decimo de segundo, y el fotograma cero suele ser fundido. */
const INICIO_HOOK = 0.1;
const FIN_HOOK = 4.5;

/** Claude cobra las imagenes por pixeles, no por bytes. Sirve para declarar el costo
 *  en contexto antes de gastarlo, que es la mitad honesta de "esto es gratis". */
const tokensDe = (ancho, alto) => Math.ceil((ancho * alto) / 750);

class ErrorHumano extends Error {}

/* ── binarios ────────────────────────────────────────────────────────────────
 * Se invocan con arreglo de argumentos, JAMAS como string de shell. Es el primer
 * script del paquete que llama binarios externos y un nombre de archivo con una
 * comilla no se puede volver inyeccion.
 * ------------------------------------------------------------------------- */

function correr(binario, args) {
  const r = spawnSync(binario, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (r.error?.code === "ENOENT") {
    throw new ErrorHumano(
      `No encuentro ${binario}. Camino B no puede correr sin el.\n` +
        "Instalalo con `brew install ffmpeg`, que trae ffmpeg y ffprobe.",
    );
  }
  if (r.error) throw r.error;
  return r;
}

/** Duracion y dimensiones. Una sola llamada porque son el mismo hecho fisico del
 *  archivo y separarlas seria pagar dos arranques de proceso por nada. */
function sondear(ruta) {
  const r = correr("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "format=duration",
    "-show_entries", "stream=width,height",
    "-of", "json",
    ruta,
  ]);
  if (r.status !== 0) {
    throw new ErrorHumano(
      `ffprobe no pudo leer ${basename(ruta)}. No parece un video valido.\n` +
        `Lo que dijo: ${(r.stderr || "").trim().split("\n")[0] || "nada"}`,
    );
  }
  let datos;
  try {
    datos = JSON.parse(r.stdout);
  } catch {
    throw new ErrorHumano(`ffprobe devolvio algo que no es JSON para ${basename(ruta)}.`);
  }
  const flujo = datos.streams?.[0];
  if (!flujo?.width || !flujo?.height) {
    throw new ErrorHumano(`${basename(ruta)} no tiene flujo de video. ¿Es solo audio?`);
  }
  // La duracion se busca en formato y si no en el flujo. Nunca se estima ni se cuentan
  // fotogramas: `duracion_seg` es un hecho medido y la regla del sistema lo exige.
  const cruda = Number(datos.format?.duration ?? flujo.duration);
  if (!Number.isFinite(cruda) || cruda <= 0) {
    throw new ErrorHumano(
      `No pude medir la duracion de ${basename(ruta)}. Sin duracion no se arma el horario.`,
    );
  }
  return { duracion: cruda, ancho: flujo.width, alto: flujo.height };
}

/* ── horario ─────────────────────────────────────────────────────────────────
 * Tres zonas, cada una con un trabajo distinto. Es la decision de diseno del script.
 * ------------------------------------------------------------------------- */

function horario(duracion, modo) {
  const fin = Math.max(0.15, duracion - 0.35); // ultimo instante decodificable
  const puntos = [];
  const meter = (seg, zona, altoPx) => {
    const t = Math.min(Math.max(seg, 0.05), fin);
    // Dedupe: dos zonas pueden pisarse en videos muy cortos. Gana la primera, que
    // siempre es la mas cara y la mas informativa.
    if (puntos.some((p) => Math.abs(p.seg - t) < 0.1)) return;
    puntos.push({ seg: Number(t.toFixed(2)), zona, alto_px: altoPx });
  };

  // ZONA A -- el hook. Densa y a resolucion alta: de aqui sale hook_texto literal.
  const paso = PASO_HOOK[modo] ?? PASO_HOOK.completo;
  const finA = Math.min(modo === "denso" ? 5.0 : FIN_HOOK, fin);
  for (let t = INICIO_HOOK; t <= finA + 1e-9; t += paso) meter(t, "hook", ALTO_HOOK);

  if (modo === "hook") {
    meter(fin, "cta", ALTO_HOOK);
    return ordenar(puntos);
  }

  // ZONA B -- el cuerpo. Uno cada ~8 s, que es lo que dura un "beat" en este corpus
  // (la estructura que Gemini saco de ig_04 lista 12 momentos en 91 s). Piso de 4
  // para que un video de 12 s tenga cuerpo; techo de 12 para acotar el costo.
  const desdeB = finA + paso;
  const hastaB = fin - 2.5;
  const largoB = hastaB - desdeB;
  if (largoB > 0.5) {
    const cada = modo === "barato" ? 15 : 8;
    const n = Math.min(12, Math.max(4, Math.ceil(largoB / cada)));
    for (let k = 0; k < n; k++) meter(desdeB + (largoB * (k + 0.5)) / n, "cuerpo", ALTO_CUERPO);
  }

  // ZONA C -- la cola. El CTA vive aqui y tambien viene troceado, asi que un solo
  // fotograma lo pierde. Va a resolucion alta porque `cta` es texto literal.
  for (const t of [fin - 2.4, fin - 1.5, fin - 0.7, fin]) {
    if (t > desdeB) meter(t, "cta", ALTO_HOOK);
  }

  return ordenar(puntos);
}

const ordenar = (p) => p.sort((a, b) => a.seg - b.seg).map((x, i) => ({ i, ...x }));

/* ── extraccion ──────────────────────────────────────────────────────────── */

/**
 * Un spawn de ffmpeg por fotograma. Medido: 14 seeks sobre el video de 91 s tardan
 * 0.60 s en total, asi que el ahorro de un solo proceso con filtro `select` no paga
 * lo que cuesta -- timestamps exactos, codigo simple, y un fotograma que falla no
 * arrastra a los demas.
 */
function extraer(video, punto, dir) {
  const nombre = `f_${String(punto.i).padStart(2, "0")}_${punto.zona}_t${punto.seg.toFixed(2)}s.jpg`;
  const destino = join(dir, nombre);
  const r = correr("ffmpeg", [
    "-nostdin",           // no le quita la terminal a Claude Code
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(punto.seg), // ANTES de -i: seek de entrada. Despues de -i decodifica
    "-i", video,              // todo hasta t y convierte 0.6 s en minutos.
    "-frames:v", "1",
    "-an", "-sn", "-dn",      // audio, subtitulos y datos se decodificarian para nada
    "-vf", `scale=-2:'min(${punto.alto_px},ih)':flags=lanczos`,
    "-q:v", "2",              // Claude cobra por pixeles: la calidad aqui es gratis, y
    "-f", "image2",           // el ringing del JPEG sobre texto blanco fino rompe el OCR
    "-y",
    destino,
  ]);
  if (r.status !== 0 || !existsSync(destino)) return null;
  return { ...punto, ruta: destino, bytes: statSync(destino).size };
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */

function uso(codigo) {
  console.error(`
uso: node fotogramas.mjs <ruta-video.mp4> [opciones]

Parte el video en fotogramas para que el agente los lea. NO transcribe audio:
lo que se puede leer es el subtitulo quemado en pantalla.

opciones
  --modo M     completo (default) | hook | denso | barato
                 completo : hook denso + cuerpo + cola
                 hook     : solo la zona del hook y el ultimo fotograma
                 denso    : hook a 0.15 s, el reintento cuando la frase sale con huecos
                 barato   : todo mas espaciado, para lotes grandes
  --dir RUTA   donde escribir. Default: transcripciones/.fotogramas/<id>
  --raiz RUTA  carpeta del proyecto. Default: el directorio actual

El manifiesto sale por stdout como JSON. El progreso y el costo van por stderr.
No se llama a ningun servicio de pago: el costo es contexto de Claude, no dolares.

ejemplo
  node fotogramas.mjs videos/ig_001.mp4 --modo completo
`);
  process.exit(codigo);
}

const BANDERAS_SIN_VALOR = new Set([]);

function banderas(argv) {
  const salida = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) throw new ErrorHumano(`No entiendo el argumento "${argv[i]}".`);
    const clave = argv[i].slice(2);
    if (BANDERAS_SIN_VALOR.has(clave)) {
      salida[clave] = true;
      continue;
    }
    const valor = argv[i + 1];
    if (valor === undefined || valor.startsWith("--")) {
      throw new ErrorHumano(`A la opcion --${clave} le falta el valor.`);
    }
    salida[clave] = valor;
    i++;
  }
  return salida;
}

const pesoTexto = (b) =>
  b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(2)} MB` : `${(b / 1024).toFixed(0)} KB`;

async function principal() {
  const argv = normalizarArgv(process.argv.slice(2));
  if (argv.length === 0 || argv[0] === "--ayuda" || argv[0] === "-h") uso(argv.length === 0 ? 1 : 0);

  const video = resolve(argv[0]);
  const opciones = banderas(argv.slice(1));

  const modo = opciones.modo ?? "completo";
  if (!["completo", "hook", "denso", "barato"].includes(modo)) {
    throw new ErrorHumano(`Modo "${modo}" no existe. Son: completo, hook, denso, barato.`);
  }

  if (!existsSync(video)) throw new ErrorHumano(`No existe el archivo ${video}.`);
  const info = statSync(video);
  if (!info.isFile()) throw new ErrorHumano(`${video} no es un archivo.`);
  // Un mp4 truncado por una descarga cortada revienta mas adelante con un error que
  // parece del decodificador y no lo es. Se atrapa aqui, donde el mensaje puede ser util.
  if (info.size === 0) {
    throw new ErrorHumano(`${basename(video)} pesa 0 bytes. Vuelve a descargarlo.`);
  }

  const id = basename(video).replace(/\.[^.]+$/, "");
  const raiz = resolve(opciones.raiz ?? process.cwd());
  const dir = resolve(opciones.dir ?? join(raiz, "transcripciones", ".fotogramas", id));

  const { duracion, ancho, alto } = sondear(video);
  const puntos = horario(duracion, modo);

  const porZona = puntos.reduce((a, p) => ((a[p.zona] = (a[p.zona] ?? 0) + 1), a), {});
  const escala = (px) => {
    const f = Math.min(px, alto) / alto;
    return { w: Math.round((ancho * f) / 2) * 2, h: Math.round(px > alto ? alto : px) };
  };
  const tokensEstimados = puntos.reduce((s, p) => {
    const { w, h } = escala(p.alto_px);
    return s + tokensDe(w, h);
  }, 0);

  console.error(
    `-> ${basename(video)} · ${duracion.toFixed(1)} s · ${ancho}x${alto} · modo ${modo}`,
  );
  console.error(
    `   ${puntos.length} fotogramas (` +
      Object.entries(porZona).map(([z, n]) => `${n} ${z}`).join(" · ") +
      `)`,
  );
  console.error("   costo de API externa: $0.00 — no se llama a ningun servicio de pago.");
  console.error(
    `   costo real: ~${tokensEstimados} tokens de contexto de Claude al leerlos.`,
  );

  // Se borra y recrea solo este id. Una corrida repetida no debe dejar fotogramas
  // viejos mezclados, y otro id no se toca nunca.
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const fotogramas = [];
  const fallados = [];
  for (const punto of puntos) {
    const salida = extraer(video, punto, dir);
    if (salida) fotogramas.push(salida);
    else fallados.push(punto.seg);
  }

  if (fotogramas.length === 0) {
    throw new ErrorHumano(
      `ffmpeg no pudo extraer ni un fotograma de ${basename(video)}. El archivo puede estar truncado.`,
    );
  }
  if (fallados.length) {
    console.error(
      `AVISO: ${fallados.length} fotograma(s) no salieron (segundos ${fallados.join(", ")}). ` +
        "Se sigue con los demas; la cadena del hook puede quedar con huecos.",
    );
  }

  const bytes = fotogramas.reduce((s, f) => s + f.bytes, 0);
  console.error(`   ${fotogramas.length} escritos · ${pesoTexto(bytes)} · ${dir}`);
  console.error(`   no se borran solos: rm -rf "${dir}"`);

  const manifiesto = {
    video,
    id,
    duracion_seg: Math.round(duracion),
    duracion_exacta: duracion,
    duracion_fuente: "ffprobe",
    ancho,
    alto,
    modo,
    dir,
    n: fotogramas.length,
    tokens_estimados: tokensEstimados,
    costo_api_usd: 0,
    fotogramas: fotogramas.map(({ i, zona, seg, alto_px, ruta }) => ({ i, zona, seg, alto_px, ruta })),
  };
  process.stdout.write(JSON.stringify(manifiesto, null, 2) + "\n");
}

// Solo corre el CLI cuando se ejecuta directo. Importado (por una prueba, por ejemplo)
// el modulo solo expone sus funciones y no escribe nada en disco.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  principal().catch((e) => {
    if (e instanceof ErrorHumano) {
      console.error(`\nERROR: ${e.message}\n`);
    } else if (e?.code === "ENOENT") {
      console.error(`\nERROR: no encuentro ${e.path ?? "un binario"}. Revisa la ruta.\n`);
    } else {
      console.error(`\nERROR inesperado: ${e?.stack ?? e}\n`);
    }
    process.exit(1);
  });
}

export { horario, sondear, tokensDe, ErrorHumano };
