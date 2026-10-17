# Contribuir a Matriz Viralidad · Contributing

Gracias por querer mejorarlo. / Thanks for helping. Español primero, English below the line.

## Qué es este repo

Un agente de Claude Code hecho de **skills** (`.claude/skills/*/SKILL.md`), **subagentes** (`.claude/agents/*.md`)
y **scripts de Node sin dependencias** (`scripts/*.mjs`). No hay servidor ni interfaz. El método vive en
`.claude/skills/matriz-metodologia/SKILL.md`: si cambias un umbral o una columna, cámbialo ahí y en los
scripts que lo implementan (`scripts/mediana.mjs`), y actualiza las pruebas.

## Reglas que no se negocian

1. **Nada de métricas inventadas.** Lo que no viene del scraper o del análisis del video es `s/d`.
2. **Nada de llaves.** Ni en código, ni en ejemplos, ni en issues. Los scripts leen el `.env`; Claude nunca.
3. **Todo lo que gasta dinero lleva tope y aviso.** Una corrida nueva de Apify o Gemini pasa por `--estimar` y por el sí de la persona.
4. **No subas datos de usuario**: `fuentes/`, `videos/`, `transcripciones/`, `matriz/`, `guiones/`, `perfil.json`, `.env`. El único dato permitido es `examples/demo/`, y es **sintético** (lleva la marca `_sintetico`).
5. **Los comandos de las skills usan `<RAIZ>`**, nunca la variable de plugin pegada a mano, y solo banderas que existen (`node scripts/apify.mjs --ayuda`).
6. **Las skills no declaran `allowed-tools`**: pre-aprobaría Bash y se saltaría el `ask` de `apify.mjs` y `gemini.mjs`.
7. **Precios y actores se verifican contra la API pública de Apify**, no de memoria. Si cambian, actualiza `CATALOGO` en `scripts/apify.mjs` y las tablas de ambos README con la fecha de consulta.

## Antes de abrir un PR

```bash
npm test                          # pruebas offline (node --test)
node scripts/validar-repo.mjs     # frontmatter, versiones, enlaces, higiene de llaves
```

Los dos corren también en CI (`.github/workflows/validate.yml`). Si cambias una skill, prueba el flujo a mano en Claude Code (clona, abre, `/matriz-doctor`, luego el paso que tocaste) y dilo en el PR.

## Versiones

`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` y `package.json` llevan **la misma versión** (el validador lo comprueba). Anota el cambio en `CHANGELOG.md`.

## Ideas bienvenidas

Nuevos actores o redes (en `CATALOGO`, con su normalizador y sus pruebas) · mejores heurísticas de clasificación de hook · traducciones · una forma de probar las skills de punta a punta · soporte verificado para Windows.

---

## English

This repo is an agent built from skills, subagents and zero-dependency Node scripts. The method lives in
`matriz-metodologia`. Non-negotiables: no invented metrics (`s/d`), no keys anywhere, every paid run has a cap and
an estimate and the person's yes, no user data in the repo (the only data allowed is the synthetic `examples/demo/`),
skills use `<RAIZ>` and real flags, and skills never declare `allowed-tools`. Run `npm test` and
`node scripts/validar-repo.mjs` before opening a PR. Versions in `plugin.json`, `marketplace.json` and
`package.json` must match. Verify Apify prices against the public API and date them.
