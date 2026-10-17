#!/usr/bin/env node
/**
 * apify.mjs — trae piezas PUBLICAS de una cuenta y las deja normalizadas.
 *
 * Por que existe: la matriz se calcula contra la MEDIANA de la propia cuenta, asi
 * que lo unico que este script tiene que garantizar es que cada pieza traiga su
 * numero real o `null`. Un cero inventado corre la mediana hacia abajo y hace que
 * piezas mediocres aparezcan como "1.8x". Por eso aqui no se interpola nunca.
 *
 * Por que la REST API cruda y no el SDK: el plugin corre dentro de Claude Code sin
 * `npm install`. Solo Node nativo.
 *
 * Por que start + polling y nunca el endpoint sincrono: los endpoints
 * `run-sync-get-dataset-items` topan a 5 minutos y si el proceso muere se pierde el
 * run YA PAGADO. Con el runId en mano el run se puede rescatar desde la consola de
 * Apify aunque este script se caiga.
 */

import { pathToFileURL } from "node:url";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * PUENTE DE LLAMADA. Los comandos del plugin invocan estos scripts con flags
 * (`--handle`, `--url`, `--video`, `--entrada`) mientras que el parseo de aqui
 * abajo es POSICIONAL. En vez de obligar a que las dos formas coincidan para
 * siempre -- cosa que se rompe en cuanto alguien edita un .md -- se aceptan las
 * dos y se traduce la de flags a la posicional antes de parsear.
 */
function normalizarArgv(argv) {
  const tieneFlagsConocidas = argv.some((a) => ["--handle", "--actor", "--red", "--operacion"].includes(a));
  if (!tieneFlagsConocidas) return argv;
  const v = (nombre) => {
    const i = argv.indexOf(nombre);
    if (i === -1) return null;
    const siguiente = argv[i + 1];
    return siguiente && !siguiente.startsWith("--") ? siguiente : null;
  };
  const actor = v("--actor") ?? "";
  const red =
    v("--red") ??
    (/tiktok/.test(actor) ? "tiktok"
      : /youtube/.test(actor) ? "youtube"
      : /tweet|twitter/.test(actor) ? "x"
      : /reel/.test(actor) ? "instagram-reels"
      : "instagram");
  const resto = argv.filter(
    (a, i) =>
      !["--handle", "--actor", "--red", "--operacion"].includes(a) &&
      !["--handle", "--actor", "--red", "--operacion"].includes(argv[i - 1]),
  );
  return [v("--operacion") ?? "posts", v("--handle") ?? "", red, ...resto];
}


/** El host se puede reapuntar con APIFY_API_BASE. Existe para poder ejercitar el flujo
 *  completo — arranque, polling, dataset — contra un servidor de prueba sin pagar un run,
 *  y para quien tenga que salir por un proxy. En uso normal no se toca. */
const API = process.env.APIFY_API_BASE?.trim() || "https://api.apify.com/v2";

/** Cada cuanto se pregunta por el run. Medido: 5 posts tardan 13-49 s y 20 posts 100 s,
 *  asi que preguntar cada 5 s es barato y se siente vivo. */
const INTERVALO_MS = 5000;
/** Techo de espera. Pasado esto el run SIGUE VIVO en Apify: se imprime el runId para
 *  que nadie vuelva a pagar el mismo scrape. */
const MAX_ESPERA_MS = 15 * 60 * 1000;

const TERMINALES = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT", "TIMING-OUT"]);

/* ══════════════════════════════════════════════════════════════════════════
 * .env
 * ══════════════════════════════════════════════════════════════════════════ */

/*
 * No pisa lo que ya este en process.env: una variable exportada a mano gana.
 */
function cargarEnv(desde) {
  // Solo la carpeta del proyecto (cwd o --raiz): subir por carpetas padre podia cargar el .env de
  // OTRO proyecto con otro token. Si no esta aqui, el mensaje de error dice donde se busco.
  const ruta = join(resolve(desde), ".env");
  if (!existsSync(ruta)) return null;
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    const l = linea.trim();
    if (l === "" || l.startsWith("#")) continue;
    const corte = l.indexOf("=");
    if (corte === -1) continue;
    const clave = l.slice(0, corte).trim();
    let valor = l.slice(corte + 1).trim();
    const comillado =
      (valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"));
    if (comillado) valor = valor.slice(1, -1);
    if (process.env[clave] === undefined) process.env[clave] = valor;
  }
  return ruta;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Helpers de normalizacion
 * ══════════════════════════════════════════════════════════════════════════ */

/** Texto util o null. La cadena vacia es ausencia de dato, no dato vacio. */
export const txt = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/**
 * Numero util o null. Los negativos son la forma que tienen las redes de decir
 * "oculto" (Instagram manda likesCount -1 cuando la cuenta esconde los likes): eso
 * es ausencia. El 0 SI se respeta cuando la API lo manda — un video con 0 comentarios
 * reales es un dato, y es distinto de no saberlo.
 */
export const num = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** ISO 8601 o null. Acepta fecha en texto y epoch en segundos o milisegundos. */
export function iso(v) {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  }
  const s = txt(v);
  if (s === null) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "1:23" o "01:02:03" -> segundos. YouTube entrega la duracion asi, no en numero. */
export function segundosDeReloj(v) {
  const s = txt(v);
  if (s === null) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const partes = s.split(":").map(Number);
  if (partes.some((p) => !Number.isFinite(p))) return null;
  return partes.reduce((total, p) => total * 60 + p, 0);
}

/* ══════════════════════════════════════════════════════════════════════════
 * Normalizadores por red
 * Los nombres de campo salen del outputSchema real de cada actor, verificado el
 * 2026-08-20 contra Apify, no de la memoria.
 * ══════════════════════════════════════════════════════════════════════════ */

export function normalizarInstagram(it) {
  return {
    id: txt(it.shortCode) ?? txt(it.id),
    url: txt(it.url) ?? (txt(it.shortCode) ? `https://www.instagram.com/p/${it.shortCode}/` : null),
    fecha: iso(it.timestamp),
    texto: txt(it.caption),
    // Medido: videoViewCount y videoPlayCount solo existen en posts de video. En
    // carrusel e imagen queda null porque el concepto NO APLICA, no porque falte.
    views: num(it.videoViewCount) ?? num(it.videoPlayCount),
    likes: num(it.likesCount),
    comentarios: num(it.commentsCount),
    // Instagram NO da shares salvo que se pague el add-on includeSharesCount, que es
    // lo que enciende la bandera --shares. Sin add-on, s/d.
    shares: num(it.sharesCount),
    duracion: num(it.videoDuration),
    urlVideo: txt(it.videoUrl),
  };
}

export function normalizarTikTok(it) {
  const meta = it.videoMeta ?? {};
  return {
    id: txt(it.id),
    url: txt(it.webVideoUrl) ?? txt(it.url),
    fecha: iso(it.createTimeISO ?? it.createTime),
    texto: txt(it.text),
    views: num(it.playCount),
    likes: num(it.diggCount),
    comentarios: num(it.commentCount),
    shares: num(it.shareCount),
    duracion: num(meta.duration),
    urlVideo: txt(meta.downloadAddr) ?? txt(meta.playAddr) ?? txt(it.mediaUrls?.[0]),
  };
}

export function normalizarYouTube(it) {
  return {
    id: txt(it.id),
    url: txt(it.url),
    fecha: iso(it.date ?? it.uploadDate),
    // En YouTube el HOOK es el titulo: eso es lo que decide el clic. La descripcion
    // completa se queda en el crudo de fuentes/, que no se toca.
    texto: txt(it.title),
    views: num(it.viewCount),
    likes: num(it.likes),
    comentarios: num(it.commentsCount),
    // El actor no expone compartidos. s/d, no cero.
    shares: null,
    duracion: segundosDeReloj(it.duration),
    // El actor devuelve la pagina, no el archivo. Para bajar el video hace falta otra
    // herramienta: decir null es lo honesto.
    urlVideo: null,
  };
}

/** El mp4 de mayor bitrate entre las variantes que trae un tweet con video. */
export function videoDeTweet(it) {
  const media = it.extendedEntities?.media ?? it.entities?.media ?? [];
  for (const m of media) {
    const variantes = (m.video_info?.variants ?? []).filter((v) => v.content_type === "video/mp4");
    if (variantes.length === 0) continue;
    variantes.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
    const ms = m.video_info?.duration_millis;
    return { url: txt(variantes[0].url), duracion: num(ms) === null ? null : Math.round(ms / 1000) };
  }
  return { url: null, duracion: null };
}

export function normalizarX(it) {
  const video = videoDeTweet(it);
  return {
    id: txt(it.id) ?? txt(it.id_str),
    url: txt(it.twitterUrl) ?? txt(it.url),
    fecha: iso(it.createdAt),
    texto: txt(it.text) ?? txt(it.fullText),
    views: num(it.viewCount),
    likes: num(it.likeCount),
    comentarios: num(it.replyCount),
    // El retweet es el compartir de X. Las citas van aparte y NO se suman: sumarlas
    // seria inventar una metrica que la red no reporta como una sola cosa.
    shares: num(it.retweetCount),
    duracion: video.duracion,
    urlVideo: video.url,
  };
}

/**
 * Comentario normalizado. Los nombres cambian en cada red — Instagram manda `text` y
 * `ownerUsername`, TikTok `text` y `uniqueId`, YouTube `comment` y `author` — asi que
 * cada campo prueba los tres. Mismo trato de siempre: lo que no viene es null.
 *
 * Sobre la fecha de YouTube: su actor manda `publishedTimeText`, que es texto relativo
 * ("hace 2 meses"), no una fecha. Ahi `fecha` queda en s/d a proposito: convertir "hace
 * 2 meses" a un dia concreto seria inventarlo.
 */
export function normalizarComentario(it, urlPost) {
  return {
    id: txt(it.id) ?? txt(it.cid) ?? txt(it.commentId),
    urlPost:
      urlPost ??
      txt(it.postUrl) ??
      txt(it.videoWebUrl) ??
      txt(it.pageUrl) ??
      txt(it.submittedVideoUrl) ??
      txt(it.videoUrl),
    autor:
      txt(it.ownerUsername) ??
      txt(it.uniqueId) ??
      txt(it.author) ??
      txt(it.username) ??
      txt(it.owner?.username),
    fecha: iso(it.timestamp ?? it.createTimeISO ?? it.createTime ?? it.publishedTimeText),
    texto: txt(it.text) ?? txt(it.comment) ?? txt(it.content),
    likes: num(it.likesCount) ?? num(it.diggCount) ?? num(it.voteCount),
    respuestas: num(it.repliesCount) ?? num(it.replyCount) ?? num(it.replyCommentTotal),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * Catalogo de actores
 *
 * Unico lugar del paquete donde vive un id de actor: cuando uno se cae o cambia de
 * nombre, se edita AQUI y ningun otro archivo se entera.
 *
 * `costoMil` es el precio por 1000 resultados de la hoja de costos del sistema. Es
 * una ESTIMACION con el precio del plan FREE (consultado a la API publica de Apify el
 * 2026-10-17; los planes de pago pagan menos): los actores cobran por evento y el precio
 * cambia con el plan de la cuenta. Por eso sirve solo para avisar antes de correr; el numero
 * que se reporta despues es `usageTotalUsd`, el cargo real del run.
 *
 * Los nombres de los campos de entrada estan verificados contra el input schema real
 * de cada actor el 2026-08-20.
 * ══════════════════════════════════════════════════════════════════════════ */

export const CATALOGO = {
  "instagram-reels": {
    alias: ["reels", "ig-reels", "instagram_reels"],
    normalizar: normalizarInstagram,
    posts: {
      actor: "apify/instagram-reel-scraper",
      costoMil: 2.6,
      campoLimite: "resultsLimit",
      entrada: (handle, limite, opciones) => ({
        username: [handle],
        resultsLimit: limite,
        // Add-on de pago ($0.006-0.007 por reel): apagado salvo que se pida. Sin el,
        // shares queda s/d, que es la verdad y no cuesta nada.
        includeSharesCount: opciones.shares === true,
      }),
    },
    // Los comentarios de Instagram viajan GRATIS dentro de cada reel en
    // `latestComments`. Correr el actor de comentarios aparte seria pagar dos veces
    // por el mismo dato.
    comentarios: {
      actor: "apify/instagram-reel-scraper",
      costoMil: 2.6,
      dentroDelPost: (it) => it.latestComments,
      entrada: (handle, _limite, _opciones, posts) => ({
        username: [handle],
        resultsLimit: posts,
      }),
    },
  },

  instagram: {
    alias: ["ig", "instagram-posts"],
    normalizar: normalizarInstagram,
    posts: {
      actor: "apify/instagram-scraper",
      costoMil: 2.7,
      campoLimite: "resultsLimit",
      entrada: (handle, limite) => ({
        directUrls: [`https://www.instagram.com/${handle}/`],
        resultsType: "posts",
        resultsLimit: limite,
        addParentData: false,
      }),
    },
    comentarios: {
      actor: "apify/instagram-scraper",
      costoMil: 2.7,
      dentroDelPost: (it) => it.latestComments,
      entrada: (handle, _limite, _opciones, posts) => ({
        directUrls: [`https://www.instagram.com/${handle}/`],
        resultsType: "posts",
        resultsLimit: posts,
        addParentData: false,
      }),
    },
  },

  tiktok: {
    alias: ["tt"],
    normalizar: normalizarTikTok,
    posts: {
      actor: "clockworks/tiktok-scraper",
      costoMil: 3.7,
      campoLimite: "resultsPerPage",
      entrada: (handle, limite) => ({
        profiles: [handle],
        resultsPerPage: limite,
        excludePinnedPosts: true, // el fijado suele ser viejo y distorsiona la ventana reciente
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSlideshowImages: false,
      }),
    },
    // Este actor acepta el handle directo, asi que no hay que traer los posts primero.
    comentarios: {
      actor: "clockworks/tiktok-comments-scraper",
      costoMil: 1.25,
      entrada: (handle, limite, _opciones, posts) => ({
        profiles: [handle],
        resultsPerPage: posts,
        commentsPerPost: limite,
        maxRepliesPerComment: 0, // las respuestas a comentarios no dicen nada del hook
      }),
    },
  },

  youtube: {
    alias: ["yt"],
    normalizar: normalizarYouTube,
    posts: {
      actor: "streamers/youtube-scraper",
      costoMil: 4.0,
      campoLimite: "maxResults",
      entrada: (handle, limite) => ({
        startUrls: [{ url: `https://www.youtube.com/@${handle.replace(/^@/, "")}/videos` }],
        maxResults: limite,
        maxResultsShorts: 0,
        maxResultStreams: 0,
      }),
    },
    // El unico que si necesita dos corridas: su actor de comentarios solo acepta URLs
    // de video, no un canal.
    comentarios: {
      actor: "streamers/youtube-comments-scraper",
      costoMil: 2.0,
      requierePosts: true,
      entrada: (urls, limite) => ({
        startUrls: urls.map((url) => ({ url })),
        maxComments: limite,
        sortCommentsBy: "TOP_COMMENTS", // los de arriba son los que revelan que resono
      }),
    },
  },

  x: {
    alias: ["twitter", "tuiter"],
    normalizar: normalizarX,
    posts: {
      actor: "apidojo/tweet-scraper",
      costoMil: 0.4,
      campoLimite: "maxItems",
      entrada: (handle, limite) => ({
        twitterHandles: [handle.replace(/^@/, "")],
        maxItems: limite,
        sort: "Latest",
      }),
    },
    // Sin operacion de comentarios: en X las respuestas son tweets y se traen con una
    // busqueda por conversacion, no con un actor de comentarios. Decir "no soportado"
    // es mas util que devolver una lista vacia que parece un dato.
    comentarios: null,
  },
};

function resolverRed(nombre) {
  const clave = nombre.toLowerCase();
  if (CATALOGO[clave]) return { clave, config: CATALOGO[clave] };
  for (const [k, config] of Object.entries(CATALOGO)) {
    if (config.alias.includes(clave)) return { clave: k, config };
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Cliente de Apify
 * ══════════════════════════════════════════════════════════════════════════ */

class ErrorHumano extends Error {}

const dormir = (ms) => new Promise((seguir) => setTimeout(seguir, ms));

async function cuerpo(respuesta) {
  const texto = await respuesta.text();
  try {
    return JSON.parse(texto);
  } catch {
    return { crudo: texto };
  }
}

const detalleApify = (datos) => txt(datos?.error?.message) ?? txt(datos?.crudo) ?? "sin detalle";

/**
 * Arranca el actor con `maxTotalChargeUsd` como TOPE DURO. Los cinco actores cobran
 * por evento, y para esos el tope en dolares es el freno que la plataforma respeta:
 * llegado el monto, Apify aborta el run. El limite de items va DENTRO de la entrada
 * (resultsLimit / resultsPerPage / maxResults / maxItems segun el actor) y no como
 * query param, que solo existe para actores de pago por resultado y ahi rebota.
 *
 * Si aun asi la API rechaza el tope, se reintenta una vez sin el y se avisa fuerte:
 * el gasto queda acotado solo por el limite de items, que es una proteccion mas
 * debil, y el usuario tiene derecho a saberlo.
 */
async function arrancarActor({ actor, entrada, tope, token, sinTopeUsd = process.env.MATRIZ_SIN_TOPE_USD === "1" }) {
  const ruta = actor.replace("/", "~"); // en la URL el actor lleva ~, no /

  const lanzar = async (conTope) => {
    const q = new URLSearchParams();
    if (conTope) q.set("maxTotalChargeUsd", tope.toFixed(2));
    const r = await fetch(`${API}/acts/${ruta}/runs?${q}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(entrada),
    });
    return { r, datos: await cuerpo(r) };
  };

  let { r, datos } = await lanzar(true);

  if (r.status === 400 && /maxTotalChargeUsd/i.test(JSON.stringify(datos))) {
    // El tope en dolares es la regla de la casa: no se pierde en silencio. Si la plataforma lo
    // rechaza, se corta aqui y la persona decide con --sin-tope-usd (queda solo el limite de items).
    if (!sinTopeUsd) {
      throw new ErrorHumano(
        `${actor} no acepta tope en dolares (maxTotalChargeUsd). No corro sin tope. ` +
          "Si quieres correr igual, con el limite de items como unica proteccion, repite con --sin-tope-usd.",
      );
    }
    console.error(
      `AVISO: ${actor} no acepta tope en dolares y pediste --sin-tope-usd. Gasto acotado solo por el ` +
        "limite de items; revisa el cargo real al terminar.",
    );
    ({ r, datos } = await lanzar(false));
  }

  if (r.status === 401 || r.status === 403) {
    throw new ErrorHumano(
      "Apify rechazo el token. Revisa APIFY_TOKEN en el .env del proyecto: tiene que ser el token " +
        "personal de la consola de Apify, sin comillas y sin espacios.",
    );
  }
  if (r.status === 402) {
    throw new ErrorHumano(
      "La cuenta de Apify se quedo sin credito. Nada se scrapeo y nada se cobro. " +
        "Recarga en la consola de Apify o baja el --limite.",
    );
  }
  if (r.status === 404) {
    throw new ErrorHumano(
      `El actor ${actor} ya no existe o cambio de nombre en Apify. Se corrige en el CATALOGO de ` +
        "scripts/apify.mjs, que es el unico archivo del paquete que nombra actores.",
    );
  }
  if (r.status === 400) {
    throw new ErrorHumano(
      `Apify rechazo la entrada de ${actor}: ${detalleApify(datos)}. ` +
        "El actor cambio su esquema de entrada; hay que ajustar su `entrada()` en el CATALOGO.",
    );
  }
  if (!r.ok) {
    throw new ErrorHumano(`Apify contesto ${r.status} al arrancar ${actor}: ${detalleApify(datos)}`);
  }

  const run = datos?.data;
  if (!run?.id) throw new ErrorHumano(`Apify no devolvio el id del run de ${actor}.`);
  return run.id;
}

/** Consulta el run hasta que sea terminal. El runId se imprime ANTES del primer poll a
 *  proposito: si esto se muere, ese run ya esta pagado y se puede rescatar. */
async function esperarRun(runId, token) {
  console.error(`   run ${runId} · https://console.apify.com/actors/runs/${runId}`);
  let esperado = 0;
  for (;;) {
    const r = await fetch(`${API}/actor-runs/${runId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const datos = await cuerpo(r);
    if (!r.ok) {
      throw new ErrorHumano(
        `Apify contesto ${r.status} al consultar el run ${runId}: ${detalleApify(datos)}`,
      );
    }
    if (TERMINALES.has(datos.data.status)) return datos.data;
    if (esperado >= MAX_ESPERA_MS) {
      throw new ErrorHumano(
        `El run ${runId} lleva ${Math.round(esperado / 1000)} s sin terminar. NO se cancelo: sigue ` +
          `corriendo y sus resultados se pueden bajar de https://console.apify.com/actors/runs/${runId}`,
      );
    }
    await dormir(INTERVALO_MS);
    esperado += INTERVALO_MS;
  }
}

/** Los items del dataset, tal cual. Sin `clean`: lo que se guarda en fuentes/ tiene que
 *  ser el crudo del scraper, no una version recortada por mi. */
async function itemsDelRun(run, token, limite) {
  if (!run.defaultDatasetId) return [];
  const q = new URLSearchParams({ limit: String(limite) });
  const r = await fetch(`${API}/datasets/${run.defaultDatasetId}/items?${q}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    throw new ErrorHumano(
      `Apify contesto ${r.status} al bajar el dataset ${run.defaultDatasetId}: ${detalleApify(await cuerpo(r))}`,
    );
  }
  const items = await r.json();
  return Array.isArray(items) ? items : [];
}

const costoDe = (run) => (typeof run.usageTotalUsd === "number" ? run.usageTotalUsd : null);
const costoTexto = (usd) => (usd === null ? "s/d" : `$${usd.toFixed(4)}`);

function exigirExito(run, actor) {
  if (run.status === "SUCCEEDED") return;
  throw new ErrorHumano(
    `El run de ${actor} termino en ${run.status}. ` +
      (run.status === "ABORTED"
        ? "Si lo aborto el tope de gasto, sube --tope o baja --limite. "
        : `El actor puede estar caido o la entrada no le cuadro. `) +
      `El log completo esta en https://console.apify.com/actors/runs/${run.id}`,
  );
}

/**
 * Un actor que "termina bien" y no trae nada casi nunca es un bug: es una cuenta
 * privada, un handle mal escrito o una cuenta sin nada publico. Los tres se arreglan
 * distinto, asi que el mensaje los nombra a los tres en vez de decir "0 resultados".
 */
export function revisarItems(items, handle, red) {
  // El tweet-scraper no falla cuando no encuentra nada: escribe un item centinela
  // `{noResults: true}`. Sin esto, esa nada se normalizaria como una pieza vacia.
  const utiles = items.filter((it) => it?.noResults !== true);
  if (utiles.length === 0 && items.length > 0) {
    throw new ErrorHumano(
      `El actor no encontro nada publico de @${handle} en ${red} (devolvio "sin resultados"). ` +
        "Revisa el handle; si esta bien, la cuenta es privada o no tiene contenido publico.",
    );
  }
  const conError = items.filter((it) => txt(it?.error) !== null);
  if (conError.length > 0 && conError.length === items.length) {
    throw new ErrorHumano(
      `El actor devolvio error para @${handle} en ${red}: ` +
        `${txt(conError[0].errorDescription) ?? txt(conError[0].error)}. ` +
        "Suele ser cuenta privada, handle mal escrito, o contenido no disponible desde el proxy.",
    );
  }
  if (items.length === 0) {
    throw new ErrorHumano(
      `El run termino bien pero no trajo nada de @${handle} en ${red}. Las tres causas posibles: ` +
        "la cuenta es privada, el handle esta mal escrito, o no tiene contenido publico de ese tipo. " +
        "Este sistema solo trabaja con cuentas publicas.",
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * Guardado y reportes
 * ══════════════════════════════════════════════════════════════════════════ */

const marcaDeTiempo = () =>
  new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");

/** El crudo se guarda ANTES de normalizar. Es la unica copia de algo que ya se pago y
 *  que el CDN va a dejar de servir: si el normalizador tiene un bug, se arregla el
 *  normalizador y se relee este archivo, sin pagar otro run. */
/** Bitacora de gasto: una linea por run, con el cargo REAL que devolvio Apify (o null si no lo
 *  devolvio: s/d, nunca un cero). La rutina semanal suma esto para decir cuanto va en el mes. */
function registrarGasto(raiz, { red, handle, operacion, actor, run }) {
  const dir = join(raiz, ".matriz");
  mkdirSync(dir, { recursive: true });
  const linea = {
    fecha: new Date().toISOString(),
    red,
    handle,
    operacion,
    actor,
    run_id: run.id,
    estado: run.status,
    costo_usd_real: costoDe(run),
  };
  appendFileSync(join(dir, "gasto.jsonl"), JSON.stringify(linea) + "\n", "utf8");
}

function guardarCrudo(raiz, { red, handle, operacion, actor, run, entrada, tope, items }) {
  registrarGasto(raiz, { red, handle, operacion, actor, run });
  const dir = join(raiz, "fuentes");
  mkdirSync(dir, { recursive: true });
  const limpio = handle.replace(/[^\w.-]/g, "_");
  const ruta = join(dir, `${red}-${limpio}-${operacion}-${marcaDeTiempo()}.json`);
  writeFileSync(
    ruta,
    JSON.stringify(
      {
        _no_editar:
          "Crudo del scraper. No se edita jamas. Si algo esta mal, se arregla el normalizador.",
        capturado_en: new Date().toISOString(),
        red,
        handle,
        operacion,
        actor,
        run_id: run.id,
        run_estado: run.status,
        costo_usd_real: costoDe(run),
        tope_usd: tope,
        entrada,
        items,
      },
      null,
      2,
    ),
    "utf8",
  );
  return ruta;
}

/** Cobertura real por campo. Lo que aqui sale s/d es lo que la matriz va a llevar en
 *  s/d, y eso hay que verlo ANTES de escribir la matriz, no despues. */
function reporteCobertura(piezas) {
  console.error(`   piezas normalizadas: ${piezas.length}`);
  for (const campo of ["views", "likes", "comentarios", "shares", "duracion", "urlVideo"]) {
    const con = piezas.filter((p) => p[campo] !== null && p[campo] !== undefined).length;
    console.error(
      `   ${campo.padEnd(12)} ${String(con).padStart(3)} con dato · ${piezas.length - con} s/d`,
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * CLI
 * ══════════════════════════════════════════════════════════════════════════ */

function uso(codigo) {
  console.error(`
uso: node apify.mjs <operacion> <handle> <red> [opciones]

operaciones : posts | comentarios
redes       : instagram-reels | instagram | tiktok | youtube | x

opciones
  --limite N   piezas a traer (posts) o comentarios por post (comentarios). Default 30
  --posts N    cuantos posts se revisan cuando se piden comentarios. Default 5
  --tope USD   tope duro de gasto del run. Default 1.00
  --raiz RUTA  carpeta del proyecto donde vive fuentes/. Default: el directorio actual
  --shares     solo instagram-reels: paga el add-on de shares. Sin esto, shares es s/d
  --sin-tope-usd  solo si la plataforma rechaza el tope en dolares: corre igual, con el limite de items como unica proteccion
  --estimar    NO corre nada: imprime actor, piezas y costo estimado y sale. No pide token.

ejemplos
  node apify.mjs posts danielacuerpofit instagram-reels --limite 30 --tope 1.00
  node apify.mjs posts nasa x --limite 50 --tope 0.50
  node apify.mjs comentarios mareviteri.fit tiktok --posts 5 --limite 20 --tope 0.50

El normalizado sale por stdout como JSON; el crudo se guarda en fuentes/.
`);
  process.exit(codigo);
}

const BANDERAS_SIN_VALOR = new Set(["shares", "estimar", "sin-tope-usd"]);
const BANDERAS_VALIDAS = new Set(["limite", "posts", "tope", "raiz", "shares", "estimar", "sin-tope-usd"]);

function banderas(argv) {
  const salida = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) throw new ErrorHumano(`No entiendo el argumento "${argv[i]}".`);
    const clave = argv[i].slice(2);
    // Una bandera desconocida NO se ignora en silencio: si alguien escribe --max-items creyendo
    // que pone un tope y el script la descarta, el gasto real no es el que la persona cree.
    if (!BANDERAS_VALIDAS.has(clave)) {
      throw new ErrorHumano(
        `No existe la opcion --${clave}. Las validas: ${[...BANDERAS_VALIDAS].map((b) => "--" + b).join(", ")}.`,
      );
    }
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

function entero(valor, nombre, porDefecto) {
  if (valor === undefined) return porDefecto;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ErrorHumano(`--${nombre} tiene que ser un numero mayor que 0.`);
  }
  return Math.floor(n);
}

/** El limite de items que cabe en el tope, segun el precio estimado. Es el cinturon;
 *  maxTotalChargeUsd es los tirantes. Cuando el precio real por evento es mas alto que
 *  el estimado, quien frena es el tope en dolares. */
function limitePorTope(pedido, costoMil, tope) {
  if (!costoMil) return pedido;
  const cabe = Math.floor((tope / costoMil) * 1000);
  return Math.max(1, Math.min(pedido, cabe));
}

async function principal() {
  const argv = normalizarArgv(process.argv.slice(2));
  if (argv.length === 0 || argv[0] === "--ayuda" || argv[0] === "-h") uso(argv.length === 0 ? 1 : 0);

  const [operacion, handleCrudo, redCruda] = argv;
  if (operacion !== "posts" && operacion !== "comentarios") {
    throw new ErrorHumano(`Operacion "${operacion}" desconocida. Solo hay dos: posts y comentarios.`);
  }
  if (!handleCrudo || !redCruda) uso(1);

  const opciones = banderas(argv.slice(3));
  const handle = handleCrudo.replace(/^@/, "");
  const encontrada = resolverRed(redCruda);
  if (!encontrada) {
    throw new ErrorHumano(
      `Red "${redCruda}" desconocida. Las que hay: ${Object.keys(CATALOGO).join(", ")}.`,
    );
  }
  const { clave: red, config } = encontrada;

  const limite = entero(opciones.limite, "limite", 30);
  const postsARevisar = entero(opciones.posts, "posts", 5);
  const tope = Number(opciones.tope ?? "1.00");
  if (!Number.isFinite(tope) || tope <= 0) {
    throw new ErrorHumano("--tope tiene que ser un monto mayor que 0.");
  }
  const raiz = resolve(opciones.raiz ?? process.cwd());
  if (opciones["sin-tope-usd"] === true) process.env.MATRIZ_SIN_TOPE_USD = "1";

  if (opciones.estimar === true) {
    // Modo de solo lectura: la persona ve el costo ANTES de que se gaste nada.
    const trabajoEst = config[operacion];
    if (!trabajoEst) {
      throw new ErrorHumano(`${red} no tiene operacion "${operacion}" configurada.`);
    }
    const volumen = operacion === "posts" ? limite : postsARevisar * limite;
    const cuantosEst = limitePorTope(volumen, trabajoEst.costoMil, tope);
    const costoEst = (cuantosEst * trabajoEst.costoMil) / 1000;
    console.log(
      JSON.stringify(
        {
          actor: trabajoEst.actor,
          operacion,
          handle,
          red,
          piezas_maximas: cuantosEst,
          costo_estimado_usd: Number((costoEst + 0.001).toFixed(4)),
          incluye_inicio_de_actor_usd: 0.001,
          tope_usd: tope,
          nota: "Precio del plan Free por 1000 resultados, consultado a la API publica de Apify el 2026-10-17. Los planes de pago son mas baratos. Los add-ons (transcripcion, descarga de video) NO se activan aqui. El cargo real sale al terminar.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const envUsado = cargarEnv(raiz);
  const token = txt(process.env.APIFY_TOKEN);
  if (token === null) {
    // Se distingue "no esta" de "esta vacia": encontrado corriendo esto contra un .env
    // real cuyas variables existian con valor vacio porque los secretos vivian en el
    // Keychain. Los dos casos se arreglan distinto y el mensaje tiene que decir cual es.
    throw new ErrorHumano(
      process.env.APIFY_TOKEN === undefined
        ? `Falta APIFY_TOKEN. Se busco un .env en ${raiz}` +
          (envUsado === null ? " y no habia ninguno." : ` y el que se leyo (${envUsado}) no lo trae.`)
        : `APIFY_TOKEN existe pero esta vacio en ${envUsado ?? "el entorno"}. Pega ahi el token de Apify.`,
    );
  }

  const trabajo = config[operacion];
  if (!trabajo) {
    throw new ErrorHumano(
      `${red} no tiene operacion de comentarios configurada. En X las respuestas son tweets: se traen ` +
        "con posts sobre la conversacion, no con esta operacion.",
    );
  }
  if (opciones.shares === true && red !== "instagram-reels") {
    console.error(`AVISO: --shares solo aplica a instagram-reels; en ${red} se ignora.`);
  }

  const escritos = [];
  let piezas = [];

  if (operacion === "posts") {
    const cuantos = limitePorTope(limite, trabajo.costoMil, tope);
    if (cuantos < limite) {
      console.error(
        `AVISO: con un tope de $${tope.toFixed(2)} y ~$${trabajo.costoMil}/1000 solo caben ${cuantos} piezas ` +
          `(pediste ${limite}).`,
      );
    }
    const entrada = trabajo.entrada(handle, cuantos, opciones);
    console.error(`-> ${trabajo.actor} · @${handle} · ${cuantos} piezas · tope $${tope.toFixed(2)}`);
    const runId = await arrancarActor({ actor: trabajo.actor, entrada, tope, token });
    const run = await esperarRun(runId, token);
    const items = run.defaultDatasetId ? await itemsDelRun(run, token, cuantos) : [];
    // Se guarda el crudo ANTES de validar: si el run trajo basura, quiero poder verla.
    escritos.push(
      guardarCrudo(raiz, { red, handle, operacion, actor: trabajo.actor, run, entrada, tope, items }),
    );
    exigirExito(run, trabajo.actor);
    revisarItems(items, handle, red);
    piezas = items.map(config.normalizar).filter((p) => p.id !== null || p.url !== null);
    console.error(`   costo real: ${costoTexto(costoDe(run))}`);
    reporteCobertura(piezas);
  } else if (trabajo.dentroDelPost) {
    // Instagram: los comentarios viajan dentro del post del mismo run. Un actor de
    // comentarios aparte seria pagar dos veces por el mismo dato.
    const cuantos = limitePorTope(postsARevisar, trabajo.costoMil, tope);
    const entrada = trabajo.entrada(handle, limite, opciones, cuantos);
    console.error(
      `-> ${trabajo.actor} · @${handle} · ${cuantos} posts (los comentarios viajan dentro) · tope $${tope.toFixed(2)}`,
    );
    const runId = await arrancarActor({ actor: trabajo.actor, entrada, tope, token });
    const run = await esperarRun(runId, token);
    const items = run.defaultDatasetId ? await itemsDelRun(run, token, cuantos) : [];
    escritos.push(
      guardarCrudo(raiz, { red, handle, operacion, actor: trabajo.actor, run, entrada, tope, items }),
    );
    exigirExito(run, trabajo.actor);
    revisarItems(items, handle, red);
    for (const post of items) {
      const lista = trabajo.dentroDelPost(post);
      if (!Array.isArray(lista)) continue;
      for (const c of lista.slice(0, limite)) piezas.push(normalizarComentario(c, txt(post.url)));
    }
    console.error(`   costo real: ${costoTexto(costoDe(run))}`);
    console.error(`   comentarios: ${piezas.length} de ${items.length} posts`);
    if (piezas.length === 0) {
      console.error(
        "   AVISO: los posts no traian comentarios cargados. No es que no tengan: es que el actor no los " +
          "adjunto en esta corrida.",
      );
    }
  } else if (trabajo.requierePosts) {
    // YouTube: su actor de comentarios solo acepta URLs de video, asi que son DOS runs.
    // El tope se parte a la mitad para que la suma nunca pase de lo autorizado.
    const mitad = tope / 2;
    const paso1 = config.posts;
    const cuantosPosts = limitePorTope(postsARevisar, paso1.costoMil, mitad);
    const entrada1 = paso1.entrada(handle, cuantosPosts, opciones);
    console.error(
      `-> paso 1/2 ${paso1.actor} · @${handle} · ${cuantosPosts} videos · tope $${mitad.toFixed(2)}`,
    );
    const run1 = await esperarRun(
      await arrancarActor({ actor: paso1.actor, entrada: entrada1, tope: mitad, token }),
      token,
    );
    const items1 = run1.defaultDatasetId ? await itemsDelRun(run1, token, cuantosPosts) : [];
    escritos.push(
      guardarCrudo(raiz, {
        red,
        handle,
        operacion: "posts",
        actor: paso1.actor,
        run: run1,
        entrada: entrada1,
        tope: mitad,
        items: items1,
      }),
    );
    exigirExito(run1, paso1.actor);
    revisarItems(items1, handle, red);
    const urls = items1.map((it) => config.normalizar(it).url).filter((u) => u !== null);
    if (urls.length === 0) {
      throw new ErrorHumano(
        `Se trajeron ${items1.length} videos de @${handle} pero ninguno con URL utilizable, asi que no ` +
          "hay a que pedirle comentarios.",
      );
    }

    const porVideo = limitePorTope(limite, trabajo.costoMil, mitad / urls.length);
    const entrada2 = trabajo.entrada(urls, porVideo);
    console.error(
      `-> paso 2/2 ${trabajo.actor} · ${urls.length} videos x ${porVideo} comentarios · tope $${mitad.toFixed(2)}`,
    );
    const run2 = await esperarRun(
      await arrancarActor({ actor: trabajo.actor, entrada: entrada2, tope: mitad, token }),
      token,
    );
    const items2 = run2.defaultDatasetId ? await itemsDelRun(run2, token, urls.length * porVideo) : [];
    escritos.push(
      guardarCrudo(raiz, {
        red,
        handle,
        operacion,
        actor: trabajo.actor,
        run: run2,
        entrada: entrada2,
        tope: mitad,
        items: items2,
      }),
    );
    exigirExito(run2, trabajo.actor);
    revisarItems(items2, handle, red);
    piezas = items2.map((c) => normalizarComentario(c, null));
    console.error(
      `   costo real de los dos runs: ${costoTexto((costoDe(run1) ?? 0) + (costoDe(run2) ?? 0))}`,
    );
    console.error(`   comentarios: ${piezas.length}`);
  } else {
    // TikTok: un solo run, el actor acepta el handle.
    const entrada = trabajo.entrada(handle, limite, opciones, postsARevisar);
    const techo = limitePorTope(postsARevisar * limite, trabajo.costoMil, tope);
    console.error(
      `-> ${trabajo.actor} · @${handle} · ${postsARevisar} posts x ${limite} comentarios · tope $${tope.toFixed(2)}`,
    );
    const run = await esperarRun(
      await arrancarActor({ actor: trabajo.actor, entrada, tope, token }),
      token,
    );
    const items = run.defaultDatasetId ? await itemsDelRun(run, token, techo) : [];
    escritos.push(
      guardarCrudo(raiz, { red, handle, operacion, actor: trabajo.actor, run, entrada, tope, items }),
    );
    exigirExito(run, trabajo.actor);
    revisarItems(items, handle, red);
    piezas = items.map((c) => normalizarComentario(c, null));
    console.error(`   costo real: ${costoTexto(costoDe(run))}`);
    console.error(`   comentarios: ${piezas.length}`);
  }

  for (const ruta of escritos) console.error(`   crudo guardado en ${ruta}`);
  process.stdout.write(JSON.stringify(piezas, null, 2) + "\n");
}

// Solo corre el CLI cuando se ejecuta directo. Importado (por una prueba, por ejemplo)
// el modulo solo expone sus funciones y no arranca ningun run pagado.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  principal().catch((e) => {
    if (e instanceof ErrorHumano) {
      console.error(`\nERROR: ${e.message}\n`);
    } else if (e instanceof TypeError && /fetch failed/i.test(e.message)) {
      console.error("\nERROR: no hubo salida a internet para hablar con api.apify.com.\n");
    } else {
      console.error(`\nERROR inesperado: ${e?.stack ?? e}\n`);
    }
    process.exit(1);
  });
}
