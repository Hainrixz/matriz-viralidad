// Ejercita apify.mjs de punta a punta contra un servidor local que imita la API de Apify
// (APIFY_API_BASE). No hay red, no hay gasto, no hay llaves reales.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = "apify_api_TOKEN_DE_PRUEBA_000000000000";

function servidor({ rechazarTope = false } = {}) {
  const vistos = [];
  const srv = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    vistos.push({ metodo: req.method, ruta: url.pathname, query: url.search, auth: req.headers.authorization });
    const json = (codigo, cuerpo) => {
      res.writeHead(codigo, { "content-type": "application/json" });
      res.end(JSON.stringify(cuerpo));
    };
    if (req.method === "POST" && url.pathname.startsWith("/acts/")) {
      if (rechazarTope && url.searchParams.has("maxTotalChargeUsd")) {
        return json(400, { error: { message: "maxTotalChargeUsd is not supported by this Actor" } });
      }
      return json(201, { data: { id: "RUN1", status: "READY" } });
    }
    if (url.pathname === "/actor-runs/RUN1") {
      return json(200, { data: { id: "RUN1", status: "SUCCEEDED", defaultDatasetId: "DS1", usageTotalUsd: 0.0123 } });
    }
    if (url.pathname === "/datasets/DS1/items") {
      const items = Array.from({ length: 12 }, (_, i) => ({
        shortCode: `M${i}`, url: `https://example.invalid/reel/M${i}`, timestamp: "2026-10-01T10:00:00.000Z",
        caption: `[SINTETICO] pieza ${i}`, videoPlayCount: 1000 + i * 100, likesCount: 10, commentsCount: 1, videoDuration: 20,
      }));
      return json(200, items);
    }
    json(404, { error: { message: "no existe" } });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, vistos, base: `http://127.0.0.1:${srv.address().port}` })));
}

function correr(args, { cwd, env }) {
  return new Promise((ok) => {
    const p = spawn("node", [join(RAIZ, "scripts/apify.mjs"), ...args], { cwd, env: { PATH: process.env.PATH, ...env } });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (status) => ok({ status, out, err }));
  });
}

function proyecto() {
  const dir = mkdtempSync(join(tmpdir(), "matriz-mock-"));
  writeFileSync(join(dir, ".env"), `APIFY_TOKEN=${TOKEN}\n`);
  return dir;
}

test("corrida completa: crudo intacto en fuentes/, bitacora de gasto real, token en header y no en la URL", async () => {
  const { srv, vistos, base } = await servidor();
  const dir = proyecto();
  try {
    const r = await correr(["posts", "cuenta_demo", "instagram-reels", "--limite", "12", "--tope", "0.50"], { cwd: dir, env: { APIFY_API_BASE: base } });
    assert.equal(r.status, 0, r.err);
    const normalizado = JSON.parse(r.out);
    assert.equal(normalizado.length, 12);
    assert.equal(normalizado[0].views, 1000);
    assert.equal(normalizado[0].shares, null, "shares es s/d sin el add-on");

    const crudos = readdirSync(join(dir, "fuentes"));
    assert.equal(crudos.length, 1);
    const crudo = JSON.parse(readFileSync(join(dir, "fuentes", crudos[0]), "utf8"));
    assert.ok(crudo._no_editar);
    assert.equal(crudo.items.length, 12);
    assert.equal(crudo.costo_usd_real, 0.0123);
    assert.equal(crudo.tope_usd, 0.5);

    const linea = JSON.parse(readFileSync(join(dir, ".matriz/gasto.jsonl"), "utf8").trim());
    assert.equal(linea.costo_usd_real, 0.0123);
    assert.equal(linea.run_id, "RUN1");

    const arranque = vistos.find((v) => v.metodo === "POST");
    assert.match(arranque.query, /maxTotalChargeUsd=0\.50/, "el tope duro viaja en cada corrida");
    for (const v of vistos) {
      assert.equal(v.auth, `Bearer ${TOKEN}`, `${v.ruta} debe llevar el token en el header`);
      assert.ok(!v.query.includes("token"), "el token no debe ir en la URL");
    }
    assert.ok(!r.err.includes(TOKEN) && !r.out.includes(TOKEN), "el token no se imprime");
  } finally {
    srv.close();
  }
});

test("si la plataforma rechaza el tope en dolares, se detiene en vez de correr sin freno", async () => {
  const { srv, vistos, base } = await servidor({ rechazarTope: true });
  const dir = proyecto();
  try {
    const r = await correr(["posts", "cuenta_demo", "instagram-reels", "--limite", "5", "--tope", "0.50"], { cwd: dir, env: { APIFY_API_BASE: base } });
    assert.equal(r.status, 1);
    assert.match(r.err, /No corro sin tope/);
    assert.equal(vistos.filter((v) => v.metodo === "POST").length, 1, "no hubo un segundo intento sin tope");
    assert.equal(existsSync(join(dir, "fuentes")), false, "no se guardo nada");
  } finally {
    srv.close();
  }
});

test("--sin-tope-usd permite correr sin tope en dolares, de forma explicita", async () => {
  const { srv, vistos, base } = await servidor({ rechazarTope: true });
  const dir = proyecto();
  try {
    const r = await correr(["posts", "cuenta_demo", "instagram-reels", "--limite", "5", "--tope", "0.50", "--sin-tope-usd"], { cwd: dir, env: { APIFY_API_BASE: base } });
    assert.equal(r.status, 0, r.err);
    assert.match(r.err, /AVISO: .* --sin-tope-usd/);
    assert.equal(vistos.filter((v) => v.metodo === "POST").length, 2);
  } finally {
    srv.close();
  }
});

test("un .env en una carpeta padre NO se carga (solo el de la carpeta del proyecto)", async () => {
  const { srv, base } = await servidor();
  const padre = proyecto();
  const hijo = join(padre, "sub");
  (await import("node:fs")).mkdirSync(hijo);
  try {
    const r = await correr(["posts", "cuenta_demo", "instagram-reels", "--limite", "5"], { cwd: hijo, env: { APIFY_API_BASE: base } });
    assert.equal(r.status, 1);
    assert.match(r.err, /Falta APIFY_TOKEN/);
  } finally {
    srv.close();
  }
});
