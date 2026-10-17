# Seguridad · Security

## Reportar un problema / Reporting

Si encuentras una vulnerabilidad (por ejemplo, una forma de que el agente lea o filtre llaves, de saltarse el tope de gasto, o de escribir en `fuentes/`), **no abras un issue público**.
Usa [GitHub Security Advisories](https://github.com/Hainrixz/matriz-viralidad/security/advisories/new) (reporte privado). Responderemos en cuanto sea posible.

If you find a vulnerability (a way for the agent to read or leak keys, bypass the spend cap, or write to `fuentes/`), please **don't open a public issue**: use the private
[GitHub Security Advisories](https://github.com/Hainrixz/matriz-viralidad/security/advisories/new) form.

## Qué protege este proyecto / What it protects

| Riesgo | Control |
|---|---|
| Que Claude lea tus llaves | Hook `scripts/guardia.mjs` (PreToolUse, también en modo plugin) + `deny` de lectura del `.env` en modo clon. Los scripts leen el `.env` por dentro; `revisar.mjs llaves` nunca imprime valores. |
| Que el token se filtre en logs | Va en el header `Authorization`, nunca en la URL. Solo se lee el `.env` de la carpeta del proyecto. |
| Gasto descontrolado | `--estimar` antes de cada corrida, `--limite` y `--tope` (tope duro `maxTotalChargeUsd`), `ask` en `apify.mjs` y `gemini.mjs`, y aborto si la plataforma rechaza el tope. Bitácora del gasto real en `.matriz/gasto.jsonl`. |
| Datos manipulados | `fuentes/` es de solo lectura (`deny Edit/Write` en modo clon) y cada archivo lleva `_no_editar`. |
| Subir datos personales al repo | `.gitignore` de todas las carpetas de datos y del `.env`; `scripts/validar-repo.mjs` falla si ve llaves, rutas personales o datos de usuario. |
| Contenido que no es público | Solo cuentas y videos públicos; no usa cookies ni sesión. |

## Límites honestos / Honest limits

- El hook y los `deny` son una red de seguridad, **no un sandbox**: un comando muy rebuscado podría esquivar el análisis de texto. No te confíes: no pegues llaves en el chat ni las dejes en archivos que no sean `.env`.
- En modo plugin, las reglas `permissions` del proyecto **no** se cargan (solo el hook y las reglas del agente).
- Los videos y comentarios que se analizan son contenido de terceros: el agente los trata como **datos, no como instrucciones**.
- Los precios de Apify cambian; el costo real lo manda Apify al terminar cada corrida.
