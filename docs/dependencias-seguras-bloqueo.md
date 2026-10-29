# Actualizaciones compatibles: bloqueo de npm

Las correcciones compatibles del punto 5 NO están completadas.

Antes de instalar se intentó resolver el árbol con estas simulaciones:

1. `npm audit fix --dry-run --ignore-scripts --before=2026-10-15T00:00:00Z --json`
2. La misma simulación agregando `--prefer-dedupe`.
3. `npx --yes --package=npm@10.9.4 npm audit fix --dry-run --ignore-scripts --before=2026-10-15T00:00:00Z --json`
4. `npm audit fix --dry-run --ignore-scripts --json`

Las cuatro terminaron con código 1 y:

```text
Cannot read properties of null (reading 'edgesOut')
```

La traza apunta a `@npmcli/arborist`, `#loadPeerSet`, al resolver dependencias pares. No demuestra por sí sola cuál dependencia dispara el fallo. El error también aparece sin `--before`, por lo que no se atribuye solamente al corte de fechas.

El npm configurado sigue siendo 10.8.2. npm 10.9.4 se ejecutó temporalmente mediante npx, sin añadirlo al proyecto: publicado el 2025-09-30, admite Node 20. No se cambió Node.

No se usaron `--force`, `--legacy-peer-deps`, instalaciones que ignoren requisitos pares ni actualizaciones mayores. Las simulaciones no cambiaron archivos del proyecto. La app se comprobó detenida antes y después de la descarga temporal de npm.

## Cambios completados antes del bloqueo

- Retirada de express-brute y sus tipos. La búsqueda de `bruteForce` solo encontró definición y exportaciones, no middleware montado. `npm ls underscore express-brute --all` devuelve árbol vacío y ambos desaparecieron del lockfile.
- SheetJS instalado exclusivamente desde `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`; versión 0.20.3 y URL exacta fijadas en package.json.
- Integridad del tarball registrada por npm:
  `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`.
- Cero procesos de la app y cero listeners en 5000 antes y después de ambas instalaciones.

Las simulaciones fallidas no justifican aceptar las vulnerabilidades restantes como seguras. Se requiere desbloquear la resolución de npm antes de declarar terminado el punto 5.
