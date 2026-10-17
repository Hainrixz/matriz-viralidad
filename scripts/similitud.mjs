#!/usr/bin/env node
/**
 * similitud.mjs — hace cumplir la regla de oro "nunca copies frases literales".
 *
 *   node similitud.mjs <guion.md> [--min 5] [--transcripciones transcripciones] [--fuentes fuentes]
 *
 * Compara el guion contra lo que dicen los videos analizados (hook_texto, cta, estructura) y los
 * textos del crudo (caption / text / title) y reporta toda secuencia de >= --min palabras seguidas
 * que aparezca en los dos. La matriz da estructura y tecnica; las palabras son de la persona.
 *
 * Ignora las secciones del guion que citan evidencia a proposito: todo lo que cuelgue de un
 * encabezado "Simulacion" y las lineas que empiecen con ">" (citas).
 * Salida: JSON. Exit 0 si no hay coincidencias, 1 si las hay, 2 si falla la lectura.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Minusculas, sin acentos, sin puntuacion: dos frases iguales dichas distinto de escribir cuentan. */
export function palabras(texto) {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** El texto del guion SIN la simulacion ni las citas. */
export function textoDelGuion(md) {
  const salida = [];
  let enSimulacion = false;
  for (const linea of String(md).split("\n")) {
    if (/^#{1,6}\s+.*simulaci[oó]n/i.test(linea)) enSimulacion = true;
    else if (/^#{1,2}\s+/.test(linea) && enSimulacion) enSimulacion = false;
    if (enSimulacion || linea.trim().startsWith(">")) continue;
    salida.push(linea);
  }
  return salida.join("\n");
}

export function ngramas(lista, n) {
  const salida = new Map();
  for (let i = 0; i + n <= lista.length; i++) {
    const clave = lista.slice(i, i + n).join(" ");
    if (!salida.has(clave)) salida.set(clave, i);
  }
  return salida;
}

/** Devuelve las coincidencias maximales: runs de palabras >= n compartidos con `referencia`. */
export function coincidencias(guion, referencia, n = 5) {
  const g = palabras(guion);
  const refs = ngramas(palabras(referencia), n);
  const hallazgos = [];
  let i = 0;
  while (i + n <= g.length) {
    const clave = g.slice(i, i + n).join(" ");
    if (refs.has(clave)) {
      let fin = i + n;
      while (fin < g.length && refs.has(g.slice(fin - n + 1, fin + 1).join(" "))) fin++;
      hallazgos.push(g.slice(i, fin).join(" "));
      i = fin;
    } else i++;
  }
  return hallazgos;
}

function textosDeReferencia(dirTranscripciones, dirFuentes) {
  const refs = [];
  const leerJson = (ruta) => {
    try {
      return JSON.parse(readFileSync(ruta, "utf8"));
    } catch {
      return null;
    }
  };
  if (existsSync(dirTranscripciones)) {
    for (const f of readdirSync(dirTranscripciones)) {
      if (!f.endsWith(".json") || f.startsWith(".")) continue;
      const j = leerJson(join(dirTranscripciones, f));
      if (!j) continue;
      const partes = [j.hook_texto, j.cta, ...(Array.isArray(j.estructura) ? j.estructura.map((e) => e?.que_pasa) : [])];
      refs.push({ origen: `transcripciones/${f}`, texto: partes.filter((x) => typeof x === "string").join(" \n ") });
    }
  }
  if (existsSync(dirFuentes)) {
    for (const f of readdirSync(dirFuentes)) {
      if (!f.endsWith(".json")) continue;
      const j = leerJson(join(dirFuentes, f));
      const items = Array.isArray(j) ? j : (j?.items ?? []);
      const texto = items.map((p) => p?.caption ?? p?.text ?? p?.title ?? "").filter((x) => typeof x === "string").join(" \n ");
      if (texto) refs.push({ origen: `fuentes/${f}`, texto });
    }
  }
  return refs;
}

function principal() {
  const args = process.argv.slice(2);
  const valor = (nombre, def) => {
    const i = args.indexOf(nombre);
    return i === -1 ? def : args[i + 1];
  };
  const archivo = args[0];
  if (!archivo || archivo.startsWith("--")) {
    console.error("uso: node similitud.mjs <guion.md> [--min 5] [--transcripciones DIR] [--fuentes DIR]");
    process.exit(2);
  }
  if (!existsSync(archivo)) {
    console.error(`ERROR: no existe ${archivo}`);
    process.exit(2);
  }
  const min = Number(valor("--min", "5"));
  if (!Number.isInteger(min) || min < 2) {
    console.error("ERROR: --min tiene que ser un entero de 2 o mas.");
    process.exit(2);
  }
  const refs = textosDeReferencia(valor("--transcripciones", "transcripciones"), valor("--fuentes", "fuentes"));
  const guion = textoDelGuion(readFileSync(archivo, "utf8"));
  const hallazgos = [];
  for (const r of refs) {
    for (const frase of coincidencias(guion, r.texto, min)) hallazgos.push({ origen: r.origen, frase });
  }
  console.log(
    JSON.stringify(
      { guion: archivo, minimo_palabras: min, referencias_revisadas: refs.length, coincidencias: hallazgos },
      null,
      2,
    ),
  );
  process.exit(hallazgos.length === 0 ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) principal();
