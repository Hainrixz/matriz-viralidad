# Demo sintético

`fuentes/instagram-reels-cuenta_demo-posts-demo.json` tiene **datos inventados** (marcados con `_sintetico`): 13 reels con views y 2 carruseles sin views, de una cuenta que no existe. Sirve para ver cómo calcula el sistema **sin llaves y sin gastar**:

```bash
node scripts/mediana.mjs examples/demo/fuentes/instagram-reels-cuenta_demo-posts-demo.json
```

Qué mirar en la salida:

- La **mediana** es 7,300 views y sale de 13 piezas; los dos carruseles quedan **fuera** (`s/d`: el concepto de views no aplica) y no valen cero.
- Tres reels superan `1.5x` ("FUNCIONA"), uno queda debajo de `0.7x` y el resto está en la zona normal.
- `--json` da la misma información para otras herramientas.

No saques conclusiones de estos números: no pertenecen a ninguna cuenta real.
