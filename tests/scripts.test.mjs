// Pruebas offline: no gastan dinero, no necesitan llaves ni red. Corren con `node --test tests/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const correr = (script, args, opciones = {}) =>
  spawnSync("node", [join(RAIZ, "scripts", script), ...args], { encoding: "utf8", ...opciones });
const DEMO = join(RAIZ, "examples/demo/fuentes/instagram-reels-cuenta_demo-posts-demo.json");

const { mediana } = await import("../scripts/mediana.mjs");
const apify = await import("../scripts/apify.mjs");
const { revisarComando, revisarEntrada, esRutaEnv } = await import("../scripts/guardia.mjs");
const { clavesDelEnv, estadoLlaves, contarHorarios, contarComentarios, sumarGasto } = await import("../scripts/revisar.mjs");
const { coincidencias, textoDelGuion, palabras } = await import("../scripts/similitud.mjs");

test("mediana: impar toma el centro, par promedia los dos centrales", () => {
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
});

test("mediana.mjs sobre el demo: mediana 7300, s/d fuera del calculo, umbrales de la metodologia", () => {
  const r = correr("mediana.mjs", [DEMO, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const salida = JSON.parse(r.stdout);
  assert.equal(salida.mediana, 7300);
  assert.equal(salida.piezas_con_dato, 13);
  assert.equal(salida.piezas_sin_dato, 2, "las dos piezas sin views quedan fuera, no valen cero");
  assert.ok(salida.sin_dato.every((p) => p.valor === null));
  assert.equal(salida.mediana_fragil, false);
  const conRend = salida.piezas;
  assert.equal(conRend.filter((p) => p.marca === "FUNCIONA").length, 3);
  assert.equal(conRend.filter((p) => p.marca === "NO FUNCIONA").length, 1);
  const mejor = Math.max(...conRend.map((p) => p.rendimiento));
  assert.ok(Math.abs(mejor - 31800 / 7300) < 0.01);
});

test("normalizadores: -1 (oculto) es s/d pero 0 se respeta", () => {
  assert.equal(apify.num(-1), null);
  assert.equal(apify.num(0), 0);
  assert.equal(apify.num("12"), null);
  const p = apify.normalizarInstagram({ shortCode: "X", likesCount: -1, commentsCount: 0, videoPlayCount: 10 });
  assert.equal(p.likes, null);
  assert.equal(p.comentarios, 0);
  assert.equal(p.shares, null, "Instagram sin add-on: shares es s/d, no cero");
});

test("apify.mjs --estimar no pide token, calcula costo y respeta el tope", () => {
  const r = correr("apify.mjs", ["posts", "cuenta", "instagram-reels", "--limite", "5000", "--tope", "1", "--estimar"], {
    env: { PATH: process.env.PATH },
  });
  assert.equal(r.status, 0, r.stderr);
  const e = JSON.parse(r.stdout);
  assert.equal(e.actor, "apify/instagram-reel-scraper");
  assert.ok(e.piezas_maximas < 5000, "el tope en dolares recorta las piezas");
  assert.ok(e.costo_estimado_usd <= 1.0011);
});

test("apify.mjs rechaza una bandera desconocida en vez de ignorarla", () => {
  const r = correr("apify.mjs", ["posts", "cuenta", "x", "--max-items", "40", "--estimar"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No existe la opcion --max-items/);
});

test("apify.mjs sin .env ni token falla con un mensaje que dice donde se busco", () => {
  const dir = mkdtempSync(join(tmpdir(), "matriz-"));
  const r = correr("apify.mjs", ["posts", "cuenta", "x", "--raiz", dir], { env: { PATH: process.env.PATH } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Falta APIFY_TOKEN/);
  assert.ok(r.stderr.includes(dir));
});

test("guardia: bloquea leer llaves, deja pasar lo legitimo", () => {
  for (const malo of ["cat .env", "grep TOKEN .env", "head -1 .env.local", "echo $APIFY_TOKEN", "printenv", "node -e \"require('fs').readFileSync('.env')\"", "sed -n 1p ./.env"]) {
    assert.ok(revisarComando(malo), `debia bloquear: ${malo}`);
  }
  for (const bueno of ["cp .env.example .env", "ls -a", "node scripts/revisar.mjs llaves", "cat .env.example", "node scripts/apify.mjs posts nasa x --estimar"]) {
    assert.equal(revisarComando(bueno), null, `debia dejar pasar: ${bueno}`);
  }
  assert.ok(revisarEntrada({ tool_name: "Read", tool_input: { file_path: "/a/b/.env" } }));
  assert.equal(revisarEntrada({ tool_name: "Read", tool_input: { file_path: "/a/b/.env.example" } }), null);
  assert.ok(esRutaEnv(".env.production"));
  assert.ok(!esRutaEnv("environment.md"));
});

test("guardia por stdin: exit 2 al bloquear, exit 0 con basura", () => {
  const bloquear = correr("guardia.mjs", [], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "cat .env" } }) });
  assert.equal(bloquear.status, 2);
  assert.match(bloquear.stderr, /BLOQUEADO/);
  assert.equal(correr("guardia.mjs", [], { input: "no es json" }).status, 0);
});

test("revisar: nunca devuelve el valor de una llave", () => {
  const dir = mkdtempSync(join(tmpdir(), "matriz-"));
  writeFileSync(join(dir, ".env"), "APIFY_TOKEN=apify_api_SECRETO123\nGEMINI_API_KEY=pega_aqui_tu_llave\n");
  const e = estadoLlaves(dir);
  assert.equal(e.APIFY_TOKEN, "presente");
  assert.match(e.GEMINI_API_KEY, /PLACEHOLDER/);
  assert.ok(!JSON.stringify(e).includes("SECRETO123"));
  assert.equal(clavesDelEnv("A=1\n#c\nB=\"2\"").B, "2");
});

test("revisar: conteos de comentarios y horarios", () => {
  assert.deepEqual(contarComentarios([{ latestComments: [1] }, {}]), { posts: 2, con_comentarios: 1 });
  assert.deepEqual(contarHorarios([{ timestamp: "x" }, {}]), { piezas: 2, con_fecha_de_publicacion: 1 });
});

test("gasto: suma el cargo real por mes y cuenta aparte los runs sin costo (s/d, no cero)", () => {
  const texto = [
    JSON.stringify({ fecha: "2026-10-03T10:00:00Z", costo_usd_real: 0.04 }),
    JSON.stringify({ fecha: "2026-10-09T10:00:00Z", costo_usd_real: 0.06 }),
    JSON.stringify({ fecha: "2026-10-10T10:00:00Z", costo_usd_real: null }),
    JSON.stringify({ fecha: "2026-09-30T10:00:00Z", costo_usd_real: 9 }),
    "linea rota",
  ].join("\n");
  assert.deepEqual(sumarGasto(texto, "2026-10"), { mes: "2026-10", corridas: 3, gasto_usd_real: 0.1, corridas_sin_costo_devuelto: 1 });
});

test("similitud: detecta 5+ palabras copiadas aunque cambie la puntuacion, e ignora la simulacion", () => {
  const ref = "Nadie te va a decir esto porque a todos les conviene que no lo sepas.";
  const guion = "# Guion\nHola. Nadie te va a decir esto, porque a todos...\n\n## Simulacion\nnadie te va a decir esto porque a todos les conviene";
  const hallazgos = coincidencias(textoDelGuion(guion), ref, 5);
  assert.equal(hallazgos.length, 1);
  assert.match(hallazgos[0], /^nadie te va a decir esto porque a todos/);
  assert.deepEqual(coincidencias("texto totalmente distinto y original aqui", ref, 5), []);
  assert.deepEqual(palabras("¿Qué TAL, Señor?"), ["que", "tal", "senor"]);
});
