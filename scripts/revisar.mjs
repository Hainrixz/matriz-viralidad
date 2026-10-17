#!/usr/bin/env node
/**
 * revisar.mjs — comprobaciones de solo lectura que las skills necesitan y que no deben hacerse
 * con comandos en linea (grep sobre el .env, node -e): el guardia los bloquea a proposito.
 *
 *   node revisar.mjs llaves                 que llaves hay (sin imprimir NUNCA su valor)
 *   node revisar.mjs entorno                node, ffmpeg, ffprobe, yt-dlp, skill watch
 *   node revisar.mjs todo                   las dos anteriores en un solo JSON
 *   node revisar.mjs gasto [AAAA-MM]       cuanto credito de Apify se gasto (bitacora .matriz/gasto.jsonl)
 *   node revisar.mjs comentarios <crudo>    cuantos posts traen comentarios dentro
 *   node revisar.mjs horarios <crudo>       cuantas piezas traen fecha/hora de publicacion
 *
 * Salida: JSON por stdout. Codigo 0 si el sistema puede trabajar (APIFY_TOKEN presente), 1 si no.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Lee las CLAVES de un .env y si traen valor. Nunca devuelve el valor. */
export function clavesDelEnv(texto) {
  const salida = {};
  for (const linea of texto.split("\n")) {
    const l = linea.trim();
    if (l === "" || l.startsWith("#")) continue;
    const corte = l.indexOf("=");
    if (corte === -1) continue;
    const clave = l.slice(0, corte).trim();
    let valor = l.slice(corte + 1).trim().replace(/^["']|["']$/g, "");
    salida[clave] = valor;
  }
  return salida;
}

const PLACEHOLDER = /pega_aqui|tu_token|xxxx|changeme/i;

export function estadoLlaves(raiz = process.cwd()) {
  const ruta = join(resolve(raiz), ".env");
  const hayArchivo = existsSync(ruta);
  const vars = hayArchivo ? clavesDelEnv(readFileSync(ruta, "utf8")) : {};
  const estado = (nombre) => {
    const v = vars[nombre] ?? process.env[nombre];
    if (v === undefined || v === "") return "FALTA";
    if (PLACEHOLDER.test(v)) return "PLACEHOLDER (sin cambiar el texto de ejemplo)";
    return "presente";
  };
  const analizador = (vars.MATRIZ_ANALIZADOR || process.env.MATRIZ_ANALIZADOR || "auto").trim();
  return {
    archivo_env: hayArchivo ? "existe" : "FALTA",
    carpeta: resolve(raiz),
    APIFY_TOKEN: estado("APIFY_TOKEN"),
    GEMINI_API_KEY: estado("GEMINI_API_KEY"),
    MATRIZ_ANALIZADOR: analizador,
  };
}

function tiene(binario, args = ["-version"]) {
  const r = spawnSync(binario, args, { encoding: "utf8" });
  if (r.error || r.status === null) return null;
  const primera = (r.stdout || r.stderr || "").split("\n")[0].trim();
  return primera || "ok";
}

/** Busca la skill `watch` (plugin aparte) en los lugares donde Claude Code la deja. */
export function buscarWatch(casa = homedir()) {
  const bases = [
    join(casa, ".claude/plugins/cache"),
    join(casa, ".claude/skills"),
    join(casa, ".codex/skills"),
    join(casa, ".agents/skills"),
  ];
  const hallados = [];
  const recorrer = (dir, prof) => {
    if (prof > 5 || !existsSync(dir)) return;
    let entradas;
    try {
      entradas = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "watch" && existsSync(join(p, "SKILL.md")) && existsSync(join(p, "scripts"))) hallados.push(p);
        else if (e.name === "watch" && existsSync(join(p, "skills/watch/SKILL.md"))) hallados.push(join(p, "skills/watch"));
        else recorrer(p, prof + 1);
      }
    }
  };
  for (const b of bases) recorrer(b, 0);
  return hallados[0] ?? null;
}

export function estadoEntorno() {
  const nodeMayor = Number(process.versions.node.split(".")[0]);
  const watch = buscarWatch();
  return {
    node: { version: process.versions.node, ok: nodeMayor >= 20, minimo: "20" },
    ffmpeg: tiene("ffmpeg"),
    ffprobe: tiene("ffprobe"),
    "yt-dlp": tiene("yt-dlp", ["--version"]),
    skill_watch: watch ? { instalada: true, ruta: watch } : { instalada: false },
  };
}

/** Suma el cargo real por mes. Los runs sin cargo devuelto cuentan aparte: son s/d, no cero. */
export function sumarGasto(texto, mes) {
  let total = 0;
  let corridas = 0;
  let sinCosto = 0;
  for (const linea of texto.split("\n")) {
    if (linea.trim() === "") continue;
    let o;
    try {
      o = JSON.parse(linea);
    } catch {
      continue;
    }
    if (mes && !String(o.fecha).startsWith(mes)) continue;
    corridas++;
    if (typeof o.costo_usd_real === "number") total += o.costo_usd_real;
    else sinCosto++;
  }
  return { mes: mes ?? "todos", corridas, gasto_usd_real: Number(total.toFixed(4)), corridas_sin_costo_devuelto: sinCosto };
}

function leerCrudo(archivo) {
  if (!archivo || !existsSync(archivo)) throw new Error(`No existe el archivo: ${archivo ?? "(sin ruta)"}`);
  const j = JSON.parse(readFileSync(archivo, "utf8"));
  return Array.isArray(j) ? j : (j.items ?? []);
}

export function contarComentarios(items) {
  const con = items.filter((p) => (p.latestComments ?? p.comments ?? []).length > 0).length;
  return { posts: items.length, con_comentarios: con };
}

export function contarHorarios(items) {
  const con = items.filter((p) => p.timestamp || p.createTimeISO || p.createTime || p.date || p.createdAt).length;
  return { piezas: items.length, con_fecha_de_publicacion: con };
}

function principal() {
  const [cmd, arg] = process.argv.slice(2);
  const imprimir = (o) => console.log(JSON.stringify(o, null, 2));
  try {
    if (cmd === "llaves") {
      const e = estadoLlaves();
      imprimir(e);
      process.exit(e.APIFY_TOKEN === "presente" ? 0 : 1);
    } else if (cmd === "entorno") {
      imprimir(estadoEntorno());
    } else if (cmd === "todo") {
      const llaves = estadoLlaves();
      imprimir({ llaves, entorno: estadoEntorno() });
      process.exit(llaves.APIFY_TOKEN === "presente" ? 0 : 1);
    } else if (cmd === "gasto") {
      const ruta = join(process.cwd(), ".matriz/gasto.jsonl");
      const mes = arg ?? new Date().toISOString().slice(0, 7);
      imprimir(existsSync(ruta) ? sumarGasto(readFileSync(ruta, "utf8"), mes) : { mes, corridas: 0, gasto_usd_real: 0, nota: "no hay bitacora todavia" });
    } else if (cmd === "comentarios") {
      imprimir(contarComentarios(leerCrudo(arg)));
    } else if (cmd === "horarios") {
      imprimir(contarHorarios(leerCrudo(arg)));
    } else {
      console.error("uso: node revisar.mjs llaves | entorno | todo | gasto [AAAA-MM] | comentarios <crudo.json> | horarios <crudo.json>");
      process.exit(1);
    }
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) principal();
