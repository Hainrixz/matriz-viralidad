#!/usr/bin/env node
/**
 * validar-repo.mjs — guardias del repositorio. Sin dependencias. Corre en CI y antes de cada commit.
 *
 *   node scripts/validar-repo.mjs
 *
 * Comprueba: manifiestos y versiones coherentes · frontmatter de skills y agentes · que cada comando
 * de las skills use banderas que existen · que cada script y cada skill nombrada exista · que no haya
 * llaves ni rutas personales · que los enlaces del README apunten a archivos reales · que ningun
 * archivo de datos de usuario este en el repo.
 * Exit 0 si todo pasa, 1 si algo falla (con la lista).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const fallos = [];
const avisos = [];
const falla = (donde, que) => fallos.push(`${donde}: ${que}`);

const leer = (ruta) => readFileSync(join(RAIZ, ruta), "utf8");
const json = (ruta) => {
  try {
    return JSON.parse(leer(ruta));
  } catch (e) {
    falla(ruta, `JSON invalido (${e.message})`);
    return null;
  }
};

function archivos(dir, salida = []) {
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    if ([".git", "node_modules", ".DS_Store"].includes(e.name)) continue;
    const ruta = join(dir, e.name);
    if (e.isDirectory()) archivos(ruta, salida);
    else salida.push(ruta);
  }
  return salida;
}

/** Frontmatter YAML plano: clave: valor, con soporte de `>-` multilinea. */
export function frontmatter(texto) {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const salida = {};
  let clave = null;
  for (const linea of m[1].split("\n")) {
    const kv = linea.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) {
      clave = kv[1];
      salida[clave] = kv[2].replace(/^(>-?|\|-?)$/, "").trim();
    } else if (clave && /^\s+/.test(linea)) {
      salida[clave] = `${salida[clave]} ${linea.trim()}`.trim();
    }
  }
  return salida;
}

// ── 1. manifiestos y versiones ─────────────────────────────────────────────
const plugin = json(".claude-plugin/plugin.json");
const market = json(".claude-plugin/marketplace.json");
const paquete = json("package.json");
json(".claude/settings.json");
const hooks = json("hooks/hooks.json");

if (plugin) {
  for (const k of ["name", "version", "description", "author", "license", "repository"]) {
    if (!plugin[k]) falla(".claude-plugin/plugin.json", `falta '${k}'`);
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(plugin.name ?? "")) falla("plugin.json", "name debe ser kebab-case");
  const versiones = new Set([plugin.version, market?.plugins?.[0]?.version, paquete?.version]);
  if (versiones.size !== 1) falla("versiones", `plugin.json, marketplace.json y package.json no coinciden: ${[...versiones].join(" / ")}`);
  for (const a of plugin.agents ?? []) {
    if (!existsSync(join(RAIZ, a))) falla("plugin.json", `agente listado que no existe: ${a}`);
  }
  for (const s of plugin.skills ?? []) {
    if (!existsSync(join(RAIZ, s))) falla("plugin.json", `ruta de skills que no existe: ${s}`);
  }
}

// ── 2. skills ──────────────────────────────────────────────────────────────
const skills = readdirSync(join(RAIZ, ".claude/skills"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
for (const nombre of skills) {
  const ruta = `.claude/skills/${nombre}/SKILL.md`;
  if (!existsSync(join(RAIZ, ruta))) {
    falla(ruta, "falta SKILL.md");
    continue;
  }
  const fm = frontmatter(leer(ruta));
  if (!fm) falla(ruta, "sin frontmatter");
  else {
    if (fm.name !== nombre) falla(ruta, `name '${fm.name}' no coincide con la carpeta '${nombre}'`);
    if (!fm.description || fm.description.length < 30) falla(ruta, "description vacia o muy corta");
    if ("allowed-tools" in fm) falla(ruta, "no uses allowed-tools: pre-aprobaria Bash y se saltaria el 'ask' de apify/gemini");
  }
}

// ── 3. agentes ─────────────────────────────────────────────────────────────
const agentes = readdirSync(join(RAIZ, ".claude/agents")).filter((f) => f.endsWith(".md"));
for (const f of agentes) {
  const ruta = `.claude/agents/${f}`;
  const fm = frontmatter(leer(ruta));
  if (!fm) {
    falla(ruta, "sin frontmatter");
    continue;
  }
  if (fm.name !== f.replace(/\.md$/, "")) falla(ruta, `name '${fm.name}' no coincide con el archivo`);
  if (!fm.description) falla(ruta, "sin description");
  const principal = fm.name === "matriz-viralidad";
  if (!principal && !fm.tools) falla(ruta, "un subagente debe declarar sus tools");
  if (!principal && !(plugin?.agents ?? []).includes(`./${ruta}`)) falla(ruta, "no esta listado en plugin.json");
  if (principal && (plugin?.agents ?? []).includes(`./${ruta}`)) falla(ruta, "el agente principal NO va en plugin.json (secuestraria las sesiones)");
}
const settings = json(".claude/settings.json");
if (settings?.agent && !agentes.includes(`${settings.agent}.md`)) falla(".claude/settings.json", `agent '${settings.agent}' no existe`);

// ── 4. comandos dentro de skills y agentes ─────────────────────────────────
const BANDERAS_APIFY = new Set(["limite", "posts", "tope", "raiz", "shares", "estimar", "sin-tope-usd", "ayuda"]);
const md = [...skills.map((s) => `.claude/skills/${s}/SKILL.md`), ...agentes.map((a) => `.claude/agents/${a}`)];
const scriptsReales = new Set(readdirSync(join(RAIZ, "scripts")));
for (const ruta of md) {
  const t = leer(ruta);
  if (/\$\{CLAUDE_PLUGIN_ROOT\}\/scripts/.test(t)) falla(ruta, "usa ${CLAUDE_PLUGIN_ROOT}/scripts directo: usa <RAIZ>/scripts");
  if (t.includes("<RAIZ>") && !ruta.includes("/agents/") && !t.includes("## RAIZ")) falla(ruta, "usa <RAIZ> pero no define la seccion '## RAIZ'");
  for (const m of t.matchAll(/scripts\/([\w-]+\.mjs)/g)) {
    if (!scriptsReales.has(m[1])) falla(ruta, `referencia a scripts/${m[1]} que no existe`);
  }
  for (const linea of t.split("\n")) {
    if (!/scripts\/apify\.mjs/.test(linea)) continue;
    for (const b of linea.matchAll(/\s--([a-z][\w-]*)/g)) {
      if (!BANDERAS_APIFY.has(b[1])) falla(ruta, `apify.mjs con bandera inexistente --${b[1]}: ${linea.trim().slice(0, 90)}`);
    }
  }
  for (const m of t.matchAll(/(?<![\w/.-])\/(matriz-[a-z]+)\b(?!:)/g)) {
    if (!skills.includes(m[1])) falla(ruta, `nombra el comando /${m[1]} que no existe`);
  }
}

// ── 5. higiene: llaves, rutas personales, datos de usuario ─────────────────
const todos = archivos(".");
const PROHIBIDOS = [
  [/apify_api_[A-Za-z0-9]{20,}/, "token de Apify"],
  [/AIza[0-9A-Za-z_-]{35}/, "llave de Google"],
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "llave de Anthropic"],
  [/(?:^|[^\w])\/Users\/[a-z0-9_.-]+\//i, "ruta personal /Users/..."],
  [/[\w.+-]+@(gmail|hotmail|outlook|yahoo)\.[a-z]+/i, "correo personal"],
];
const BINARIOS = /\.(png|jpg|jpeg|gif|webp|mp4|pdf|ico)$/i;
for (const ruta of todos) {
  if (BINARIOS.test(ruta)) continue;
  if (ruta === "scripts/validar-repo.mjs" || ruta === "tests/scripts.test.mjs") continue; // contienen los patrones a proposito
  const t = leer(ruta);
  for (const [re, nombre] of PROHIBIDOS) if (re.test(t)) falla(ruta, `contiene ${nombre}`);
}
const DATOS = [/^\.env($|\.(?!example))/, /^perfil\.json$/, /^(fuentes|videos|transcripciones|matriz|guiones|calendario|perfiles|simulaciones)\//];
for (const ruta of todos) {
  if (ruta.startsWith("examples/")) continue;
  for (const re of DATOS) if (re.test(ruta)) falla(ruta, "archivo de datos de usuario dentro del repo");
}
for (const ruta of todos.filter((r) => r.startsWith("examples/demo/fuentes/"))) {
  if (!/_sintetico/.test(leer(ruta))) falla(ruta, "el demo debe llevar la marca '_sintetico'");
}

// ── 6. hooks apuntan a un script real ──────────────────────────────────────
for (const [donde, cfg] of [[".claude/settings.json", settings], ["hooks/hooks.json", hooks]]) {
  for (const grupo of Object.values(cfg?.hooks ?? {}).flat()) {
    for (const h of grupo.hooks ?? []) {
      const s = h.command?.match(/scripts\/([\w-]+\.mjs)/)?.[1];
      if (s && !scriptsReales.has(s)) falla(donde, `hook apunta a scripts/${s} que no existe`);
    }
  }
}

// ── 7. enlaces del README ──────────────────────────────────────────────────
for (const readme of ["README.md", "README.en.md"]) {
  if (!existsSync(join(RAIZ, readme))) {
    avisos.push(`${readme} todavia no existe`);
    continue;
  }
  const t = leer(readme);
  const rutas = [...t.matchAll(/\]\(((?!https?:|#|mailto:)[^)\s#]+)(?:#[^)]*)?\)/g)].map((m) => m[1]);
  rutas.push(...[...t.matchAll(/(?:src|srcset)="((?!https?:|data:)[^"]+)"/g)].map((m) => m[1]));
  for (const r of rutas) {
    if (!existsSync(join(RAIZ, decodeURIComponent(r)))) falla(readme, `enlace roto: ${r}`);
  }
}

// ── 8. archivos obligatorios ───────────────────────────────────────────────
for (const f of ["LICENSE", "CLAUDE.md", "README.md", "README.en.md", "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md", ".env.example", ".gitignore"]) {
  if (!existsSync(join(RAIZ, f))) falla(f, "falta");
}
if (existsSync(join(RAIZ, ".gitignore"))) {
  const gi = leer(".gitignore");
  for (const p of [".env", "fuentes/", "perfil.json"]) if (!gi.includes(p)) falla(".gitignore", `no ignora ${p}`);
}

const total = todos.length;
if (fallos.length === 0) {
  console.log(`OK · ${skills.length} skills · ${agentes.length} agentes · ${total} archivos revisados${avisos.length ? ` · avisos: ${avisos.join("; ")}` : ""}`);
} else {
  console.error(`FALLA · ${fallos.length} problema(s):\n` + fallos.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
void relative;
void statSync;
