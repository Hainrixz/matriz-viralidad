#!/usr/bin/env node
/**
 * gemini.mjs — mira un video y devuelve el hook, la estructura y la emocion en JSON.
 *
 * Que hace y que NO hace: describe lo que el video muestra. No dice si va a funcionar.
 * El rendimiento sale de la mediana de la cuenta (mediana.mjs), nunca de aqui. Lo que
 * esto entrega son las columnas descriptivas de la matriz — HOOK, EMOCION, CTA,
 * DURACION — para que el juicio se haga sobre lo que se ve, no sobre lo que se recuerda.
 *
 * La clasificacion TIPO DE HOOK (pregunta directa / dato sorprendente / contraste /
 * confesion / promesa) NO se le pide al modelo a proposito: esa la hace Claude Code,
 * que es donde vive el criterio de la metodologia. Aqui solo se recoge el hook LITERAL.
 *
 * Files API siempre, nunca inline: un reel de 50 MB metido en el cuerpo del request se
 * convierte en cientos de MB de pico en Node por el base64. Con Files se sube una vez
 * y el modelo lo lee por URI.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

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
  return ruta ? [ruta, ...resto] : resto;
}


/** El host se puede reapuntar con GEMINI_API_BASE. Existe para ejercitar los cuatro pasos
 *  de la Files API contra un servidor de prueba sin gastar tokens, y para quien salga por
 *  un proxy. En uso normal no se toca. */
const BASE = process.env.GEMINI_API_BASE?.trim() || "https://generativelanguage.googleapis.com";
const MODELO = "gemini-3.7-flash"; // gemini-2.5-flash devuelve 404 "no longer available to new users"

/** Precio publicado, en dolares por millon de tokens. */
const PRECIO_ENTRADA_MILLON = 0.75;
const PRECIO_SALIDA_MILLON = 3.75;

/** El archivo tarda en pasar a ACTIVE. 60 intentos de 3 s = 3 minutos de tope. */
const ESPERA_MS = 3000;
const INTENTOS = 60;

/**
 * `salida` es el codigo con que muere el proceso. Existe para que el llamador ramifique
 * por `$?` y no por regex sobre prosa en espanol, que se rompe en cuanto alguien mejora
 * una redaccion. 3 = Gemini es INALCANZABLE (key, cuota, red) y caer a Camino B es
 * legitimo. 1 = todo lo demas, donde caer taparia la causa real.
 */
class ErrorHumano extends Error {
  constructor(mensaje, salida = 1) {
    super(mensaje);
    this.salida = salida;
  }
}

const dormir = (ms) => new Promise((seguir) => setTimeout(seguir, ms));
const txt = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/* ── .env ────────────────────────────────────────────────────────────────────
 * Duplicado a proposito en cada script: cada uno tiene que poder correr solo, sin
 * imports cruzados, porque el plugin no instala nada.
 * ------------------------------------------------------------------------- */
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

/* ── El esquema ──────────────────────────────────────────────────────────────
 * Los tipos van en MAYUSCULAS porque la REST API de Gemini usa el subconjunto de
 * OpenAPI, no JSON Schema. `propertyOrdering` no es decorativo: sin el, el modelo
 * decide el orden de generacion y la calidad de los campos largos baja.
 * `emocion` lleva enum con el vocabulario exacto de la metodologia, mas "otra":
 * forzar las cuatro opciones haria que el modelo invente una que no esta, y una
 * emocion inventada contamina la columna EMOCION de la matriz.
 * ------------------------------------------------------------------------- */
const ESQUEMA = {
  type: "OBJECT",
  properties: {
    hook_visual: {
      type: "STRING",
      description:
        "Que se VE en el primer segundo, antes de que nadie hable. Una frase corta y concreta.",
    },
    hook_texto: {
      type: "STRING",
      description:
        "Las primeras 1 o 2 frases LITERALES que se dicen o se leen en pantalla, transcritas tal cual, sin resumir ni corregir. Si el video arranca sin palabras, escribe exactamente: sin texto.",
    },
    primeros_3s: {
      type: "STRING",
      description:
        "Que pasa en los primeros 3 segundos: encuadre, movimiento, texto en pantalla y corte, en una o dos frases.",
    },
    estructura: {
      type: "ARRAY",
      description: "Los momentos del video en orden, del primero al ultimo.",
      items: {
        type: "OBJECT",
        properties: {
          desde_seg: { type: "NUMBER", description: "Segundo en que empieza el momento." },
          que_pasa: { type: "STRING", description: "Que ocurre en ese momento, en una frase." },
        },
        required: ["desde_seg", "que_pasa"],
        propertyOrdering: ["desde_seg", "que_pasa"],
      },
    },
    emocion: {
      type: "STRING",
      enum: ["curiosidad", "sorpresa", "identificacion", "urgencia", "otra"],
      description: "La emocion dominante que el video busca. 'otra' si ninguna de las cuatro aplica.",
    },
    cta: {
      type: "STRING",
      description:
        "La llamada a la accion tal como se dice o se escribe. Si el video no pide nada, escribe exactamente: ninguno.",
    },
    duracion_seg: { type: "NUMBER", description: "Duracion total del video en segundos." },
  },
  required: ["hook_visual", "hook_texto", "primeros_3s", "estructura", "emocion", "cta", "duracion_seg"],
  propertyOrdering: [
    "hook_visual",
    "hook_texto",
    "primeros_3s",
    "estructura",
    "emocion",
    "cta",
    "duracion_seg",
  ],
};

const PROMPT =
  "Analiza este video corto de redes sociales y describe SOLO lo que se ve y se oye. " +
  "El hook_texto tiene que ser una transcripcion literal de las primeras frases, palabra por palabra: " +
  "no lo resumas, no lo mejores, no lo traduzcas. " +
  "Si un dato no esta en el video, no lo supongas. " +
  "No opines sobre si el video es bueno ni si va a funcionar. " +
  "Responde en espanol.";

/** El mime por extension. La Files API lo exige y rechaza el generico. */
function mimeDe(ruta) {
  const ext = extname(ruta).toLowerCase();
  const tabla = {
    ".mp4": "video/mp4",
    ".m4v": "video/x-m4v",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mpeg": "video/mpeg",
    ".mpg": "video/mpg",
    ".avi": "video/x-msvideo",
    ".3gp": "video/3gpp",
  };
  const mime = tabla[ext];
  if (!mime) {
    throw new ErrorHumano(
      `No se que tipo de video es "${ext || "sin extension"}". Formatos aceptados: ${Object.keys(tabla).join(", ")}.`,
    );
  }
  return mime;
}

async function cuerpo(respuesta) {
  const texto = await respuesta.text();
  try {
    return JSON.parse(texto);
  } catch {
    return { crudo: texto };
  }
}

/** Traduce el error de Google a algo accionable. Los tres que de verdad pasan son:
 *  key mal pegada, modelo que ya no existe, y cuota. */
function fallar(respuesta, datos, contexto) {
  const detalle = txt(datos?.error?.message) ?? txt(datos?.crudo) ?? "sin detalle";
  if (respuesta.status === 400 && /API key not valid|API_KEY_INVALID/i.test(detalle)) {
    throw new ErrorHumano(
      "Gemini rechazo la GEMINI_API_KEY. Revisa el .env: se manda en el header x-goog-api-key " +
        "(con 'Bearer' da 401) y no lleva comillas ni espacios.",
      3,
    );
  }
  if (respuesta.status === 403) {
    throw new ErrorHumano(
      `Gemini contesto 403 al ${contexto}: ${detalle}. La key existe pero no tiene permiso para la Files API o para el modelo.`,
      3,
    );
  }
  if (respuesta.status === 404) {
    throw new ErrorHumano(
      `Gemini contesto 404 al ${contexto}: ${detalle}. Si menciona el modelo, ${MODELO} cambio de nombre; ` +
        "es la unica linea de este archivo que hay que tocar.",
    );
  }
  if (respuesta.status === 429) {
    throw new ErrorHumano(
      `Gemini contesto 429 (cuota) al ${contexto}. Espera unos minutos y reintenta este mismo video; ` +
        "el archivo ya subido vive 48 h, no se pierde.",
      3,
    );
  }
  throw new ErrorHumano(`Gemini contesto ${respuesta.status} al ${contexto}: ${detalle}`);
}

/* ── (a) y (b): subida reanudable ───────────────────────────────────────────
 * Dos requests: uno que pide permiso y devuelve la URL de subida en un HEADER
 * (x-goog-upload-url, no en el JSON), y otro que manda los bytes. Es el unico
 * camino que soporta archivos grandes.
 * ------------------------------------------------------------------------- */
async function subir(ruta, mime, apiKey) {
  const bytes = statSync(ruta).size;
  if (bytes === 0) throw new ErrorHumano(`El archivo ${ruta} pesa 0 bytes: la descarga quedo trunca.`);

  const inicio = await fetch(`${BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes),
      "X-Goog-Upload-Header-Content-Type": mime,
      "content-type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: basename(ruta) } }),
  });
  if (!inicio.ok) fallar(inicio, await cuerpo(inicio), "pedir la URL de subida");

  const urlSubida = inicio.headers.get("x-goog-upload-url");
  if (!urlSubida) {
    throw new ErrorHumano(
      "La Files API acepto el inicio pero no devolvio el header x-goog-upload-url. " +
        "Sin esa URL no hay donde mandar los bytes; reintenta.",
    );
  }

  // Se lee entero a memoria: un reel son 3-50 MB y mandar un stream por fetch obliga a
  // half-duplex sin Content-Length, que es justo lo que este endpoint necesita saber.
  const contenido = readFileSync(ruta);
  const puesta = await fetch(urlSubida, {
    method: "PUT",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: contenido,
  });
  const datos = await cuerpo(puesta);
  if (!puesta.ok) fallar(puesta, datos, "subir el video");

  const archivo = datos?.file;
  if (!archivo?.name) throw new ErrorHumano("La Files API no devolvio el nombre del archivo subido.");
  return archivo;
}

/* ── (c): esperar ACTIVE ─────────────────────────────────────────────────────
 * Un archivo en PROCESSING usado en un prompt devuelve un error CON PINTA de limite
 * de cuota que no es cuota. Esperar aqui evita horas de diagnostico equivocado.
 * ------------------------------------------------------------------------- */
async function esperarActivo(archivo, apiKey) {
  let actual = archivo;
  for (let intento = 0; intento < INTENTOS; intento++) {
    if (actual.state === "ACTIVE") return actual;
    if (actual.state === "FAILED") {
      throw new ErrorHumano(
        `Gemini no pudo procesar el video (${txt(actual.error?.message) ?? "sin detalle"}). ` +
          "Suele ser un mp4 corrupto o truncado: vuelve a descargarlo.",
      );
    }
    await dormir(ESPERA_MS);
    const r = await fetch(`${BASE}/v1beta/${actual.name}`, { headers: { "x-goog-api-key": apiKey } });
    const datos = await cuerpo(r);
    if (!r.ok) fallar(r, datos, "consultar el estado del archivo");
    actual = datos;
  }
  throw new ErrorHumano(
    `El video sigue en ${actual.state ?? "estado desconocido"} despues de ${(INTENTOS * ESPERA_MS) / 1000} s. ` +
      "No llego a ACTIVE, asi que no se analizo nada y no se cobro la generacion.",
  );
}

/* ── (d): el analisis ─────────────────────────────────────────────────────── */
async function analizar(archivo, apiKey, mimeRespaldo) {
  const r = await fetch(`${BASE}/v1beta/models/${MODELO}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { fileData: { mimeType: archivo.mimeType ?? mimeRespaldo, fileUri: archivo.uri } },
            { text: PROMPT },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: ESQUEMA,
      },
    }),
  });
  const datos = await cuerpo(r);
  if (!r.ok) fallar(r, datos, "analizar el video");

  const bloqueo = txt(datos?.promptFeedback?.blockReason);
  if (bloqueo) {
    throw new ErrorHumano(
      `Gemini bloqueo el video por filtros de contenido (${bloqueo}). No hay analisis de esta pieza; ` +
        "en la matriz va s/d, no un hueco silencioso.",
    );
  }

  const candidato = datos?.candidates?.[0];
  const razon = txt(candidato?.finishReason);
  if (razon && razon !== "STOP") {
    throw new ErrorHumano(
      `La respuesta termino en ${razon} en vez de STOP: el JSON viene incompleto y no se puede confiar en el.`,
    );
  }

  const texto = (candidato?.content?.parts ?? [])
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("");
  if (texto.trim() === "") throw new ErrorHumano("Gemini contesto 200 pero sin texto. Reintenta el video.");

  let analisis;
  try {
    analisis = JSON.parse(texto);
  } catch {
    // Con responseSchema no deberia pasar; si pasa, se dice, no se parchea a mano.
    throw new ErrorHumano(`Gemini devolvio algo que no es JSON pese al esquema:\n${texto.slice(0, 400)}`);
  }

  const uso = datos.usageMetadata ?? {};
  const entrada = uso.promptTokenCount ?? 0;
  // Los tokens de razonamiento se facturan como salida. Dejarlos fuera hace que el
  // costo reportado salga mas barato que el cargo real, que es la peor mentira posible
  // en un sistema cuyo argumento es el control de gasto.
  const salida = (uso.candidatesTokenCount ?? 0) + (uso.thoughtsTokenCount ?? 0);
  return { analisis, entrada, salida };
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */

function uso(codigo) {
  console.error(`
uso: node gemini.mjs <ruta-video.mp4>

Imprime el analisis en JSON por stdout y el costo real por stderr.
Necesita GEMINI_API_KEY en el .env de la raiz del proyecto.

ejemplo
  node gemini.mjs videos/ig_001.mp4 > transcripciones/ig_001.json
`);
  process.exit(codigo);
}

async function principal() {
  const argv = normalizarArgv(process.argv.slice(2));
  if (argv.length === 0 || argv[0] === "--ayuda" || argv[0] === "-h") uso(argv.length === 0 ? 1 : 0);

  const ruta = resolve(argv[0]);
  if (!existsSync(ruta)) throw new ErrorHumano(`No existe el archivo ${ruta}.`);
  const info = statSync(ruta);
  if (!info.isFile()) throw new ErrorHumano(`${ruta} no es un archivo.`);
  const mime = mimeDe(ruta);

  const envUsado = cargarEnv(process.cwd());
  const apiKey = txt(process.env.GEMINI_API_KEY);
  if (apiKey === null) {
    // Se distingue "no esta" de "esta vacia": un .env que declara la variable en blanco
    // (porque el secreto vive en el Keychain) da un sintoma identico y una cura distinta.
    throw new ErrorHumano(
      process.env.GEMINI_API_KEY === undefined
        ? `Falta GEMINI_API_KEY. Se busco un .env en ${process.cwd()}` +
          (envUsado === null ? " y no habia ninguno." : ` y el que se leyo (${envUsado}) no la trae.`)
        : `GEMINI_API_KEY existe pero esta vacia en ${envUsado ?? "el entorno"}. Pega ahi la key de Gemini.`,
      3,
    );
  }

  const peso =
    info.size >= 1024 * 1024
      ? `${(info.size / 1024 / 1024).toFixed(1)} MB`
      : `${(info.size / 1024).toFixed(0)} KB`;
  console.error(`-> subiendo ${basename(ruta)} (${peso}, ${mime})`);
  const subido = await subir(ruta, mime, apiKey);

  console.error(`   ${subido.name} · esperando ACTIVE`);
  const listo = await esperarActivo(subido, apiKey);

  console.error(`   analizando con ${MODELO}`);
  const { analisis, entrada, salida } = await analizar(listo, apiKey, mime);

  const costoEntrada = (entrada / 1e6) * PRECIO_ENTRADA_MILLON;
  const costoSalida = (salida / 1e6) * PRECIO_SALIDA_MILLON;
  console.error(
    `   costo real: $${(costoEntrada + costoSalida).toFixed(5)}  ` +
      `(entrada ${entrada} tok = $${costoEntrada.toFixed(5)} · salida ${salida} tok = $${costoSalida.toFixed(5)})`,
  );

  process.stdout.write(JSON.stringify(analisis, null, 2) + "\n");
}

principal().catch((e) => {
  let salida = 1;
  if (e instanceof ErrorHumano) {
    console.error(`\nERROR: ${e.message}\n`);
    salida = e.salida ?? 1;
  } else if (e instanceof TypeError && /fetch failed/i.test(e.message)) {
    console.error("\nERROR: no hubo salida a internet para hablar con generativelanguage.googleapis.com.\n");
    salida = 3; // sin red Gemini es inalcanzable, no equivocado: Camino B es legitimo
  } else {
    console.error(`\nERROR inesperado: ${e?.stack ?? e}\n`);
  }
  process.exit(salida);
});
