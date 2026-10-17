#!/usr/bin/env node
/**
 * guardia.mjs — hook PreToolUse. Impide que Claude LEA las llaves.
 *
 * Los scripts del sistema leen el .env ellos solos; Claude nunca necesita su contenido. Este
 * hook viaja con el plugin (hooks/hooks.json) y con el modo clon (.claude/settings.json), asi que
 * la proteccion no depende de que existan reglas `permissions` del proyecto.
 *
 * Protocolo de Claude Code: recibe JSON por stdin ({tool_name, tool_input}). Exit 0 = deja pasar.
 * Exit 2 = bloquea y le devuelve a Claude lo que haya en stderr.
 *
 * Se bloquea (lectura): cat/head/tail/grep/sed/awk/source/... sobre .env o .env.<algo>, scripts en
 * linea (node -e, python -c) que mencionen .env, printenv/env sueltos, y `$APIFY_TOKEN` /
 * `$GEMINI_API_KEY` en cualquier comando. Tambien Read/Grep/Glob sobre un .env.
 * Se deja pasar: .env.example, `cp .env.example .env`, `ls`, `test -f .env`, y los scripts del
 * sistema, que leen el .env por dentro.
 */

import { pathToFileURL } from "node:url";

/** `.env` o `.env.algo` (sin distinguir mayusculas), pero NO `.env.example|sample|template`. */
const RE_ENV = /\.env(?!\.(example|sample|template)\b)/i;
/** Variantes con comodines o partes sueltas: `.en?`, `.e*`, `.en[v]`, `.e'n'v`, `.\env`. */
const RE_ENV_OFUSCADO = /\.(e["'\\]+n|en["'\\]+v|e["'\\]*n["'\\]*[?*[]|e["'\\]*[?*[]|[?*]nv)|\.\*(?![\w.-])/i;
const RE_LLAVE = /APIFY_TOKEN|GEMINI_API_KEY/i;
/** Buscar llaves con grep/rg/ag aunque no nombren la variable completa. */
const RE_BUSCA_LLAVES = /\b(APIFY|GEMINI|API_KEY|TOKEN|SECRET)\b/i;
/** Verbos que, cuando el comando menciona un .env, son inofensivos (no leen su contenido). */
const VERBOS_SEGUROS = new Set(["ls", "test", "[", "stat", "touch", "open", "cp", "git"]);
/** Verbos que ejecutan codigo arbitrario o vuelcan el entorno: se bloquean siempre. */
const VERBOS_PELIGROSOS = new Set(["eval", "xargs", "set", "declare", "compgen", "printenv", "typeset"]);
const INTERPRETES = new Set(["node", "python", "python3", "ruby", "perl", "php", "deno", "bun", "bash", "sh", "zsh", "fish", "dash", "ksh"]);

export function esRutaEnv(ruta) {
  if (typeof ruta !== "string") return false;
  return RE_ENV.test(ruta) || RE_ENV_OFUSCADO.test(ruta);
}

/** Parte un comando de shell en segmentos simples (aproximacion suficiente para un guardia). */
function segmentos(comando) {
  return comando
    .split(/\|\||&&|[;|&\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function revisarComando(comando) {
  if (typeof comando !== "string" || comando === "") return null;
  if (RE_LLAVE.test(comando)) {
    return "No imprimas ni uses el valor de las llaves en un comando. Los scripts las leen del .env ellos solos.";
  }
  const menciona = RE_ENV.test(comando) || RE_ENV_OFUSCADO.test(comando);
  for (const seg of segmentos(comando)) {
    const palabras = seg.split(/\s+/);
    let i = 0;
    while (i < palabras.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(palabras[i])) i++;
    const verbo = (palabras[i] ?? "").replace(/^.*\//, "").toLowerCase();
    if (/^(grep|egrep|fgrep|rg|ag|ack|find)$/.test(verbo) && RE_BUSCA_LLAVES.test(seg)) return "No busques llaves o tokens en el disco.";
    if (VERBOS_PELIGROSOS.has(verbo)) return "No vuelques el entorno ni ejecutes codigo indirecto: puede traer las llaves.";
    if ((verbo === "env" && palabras.length - i <= 1) || (verbo === "export" && /\s-p\b/.test(seg))) {
      return "No vuelques el entorno: puede traer las llaves.";
    }
    if (INTERPRETES.has(verbo)) {
      // node scripts/x.mjs es el uso normal; -e/-p/-c y --eval ejecutan codigo en linea.
      if (/(^|\s)(-e|-p|-c|--eval|--print|-pe|-ne|-ple)(\s|$)/.test(seg)) {
        return "No ejecutes codigo en linea (node -e, python -c, bash -c...). Usa los scripts de scripts/.";
      }
    }
  }
  if (menciona) {
    const seg = segmentos(comando).find((x) => RE_ENV.test(x) || RE_ENV_OFUSCADO.test(x)) ?? comando;
    const verbo = (seg.split(/\s+/).find((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) ?? "").replace(/^.*\//, "").toLowerCase();
    const seguro = VERBOS_SEGUROS.has(verbo) && !/[$`<>]|\$\(/.test(seg) && !(verbo === "cp" && !/^cp\s+\.env\.example\s+\.env\s*$/.test(seg)) && !(verbo === "open" && !/^open\s+-e\s+\.env\s*$/.test(seg)) && !(verbo === "git" &&!/^git\s+(check-ignore|status|ls-files)\b/.test(seg));
    if (!seguro) return "No leas el .env: guarda las llaves y no es para Claude. Para saber si hay una llave: node scripts/revisar.mjs llaves";
  }
  return null;
}

export function revisarEntrada(entrada) {
  const nombre = entrada?.tool_name;
  const args = entrada?.tool_input ?? {};
  if (nombre === "Bash") return revisarComando(args.command);
  if (nombre === "Read" || nombre === "Grep" || nombre === "Glob") {
    for (const campo of [args.file_path, args.path, args.pattern, args.glob]) {
      if (esRutaEnv(campo)) return "No leas el .env: guarda las llaves y no es para Claude.";
    }
    if (nombre === "Grep" && RE_LLAVE.test(String(args.pattern ?? ""))) return "No busques las llaves.";
  }
  return null;
}

async function leerStdin() {
  const trozos = [];
  for await (const t of process.stdin) trozos.push(t);
  return Buffer.concat(trozos).toString("utf8");
}

async function principal() {
  let entrada;
  try {
    entrada = JSON.parse(await leerStdin());
  } catch {
    process.exit(0); // si no se entiende la entrada, no se rompe la sesion
  }
  const motivo = revisarEntrada(entrada);
  if (motivo) {
    process.stderr.write(`BLOQUEADO por matriz-viralidad (regla: las llaves no son de Claude). ${motivo}\n`);
    process.exit(2);
  }
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) principal();
