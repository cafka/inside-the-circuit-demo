# Entrada explícita a la portada cerrada

Parche separado para `cafka/interactive-electronics-books`, base exacta
`2486fb2301e4648849b7f6da568a468cde681def` (motor `748ad8b7cdd156f857ec23a9e69440ed192a8749`).
No se modificó ni publicó el repositorio de Kiro.

## Contrato

- `?book=raspberry-pi&entry=cover`: portada cerrada de Pi 5, sin catálogo.
- `?book=coral&entry=cover`: portada cerrada de Coral.
- `?book=esp32&lesson=3&entry=cover`: conserva el capítulo 3; un toque abre ese capítulo.
- `entry=cover` prevalece incluso sobre `open=1`.
- Sin `entry=cover`, se conservan los enlaces históricos: `?book=…` abre el libro; `?book=…&lesson=2&open=1` abre directamente el capítulo; sin libro se muestra el catálogo.

## Aplicación independiente en el motor

Sobre un checkout limpio del commit indicado, comprobar y luego aplicar:

```sh
git apply --check /ruta/inside-the-circuit/patches/library-entry-cover/entry-cover.patch
git apply /ruta/inside-the-circuit/patches/library-entry-cover/entry-cover.patch
```

`git apply --check` fue ejecutado contra la descarga original. El parche modifica
únicamente tres condiciones de arranque de `src/main.js`; no cambia capítulos ni contenido.

## Integración local de Inside the Circuit

`npm run library:sync` restaura los 61 archivos originales usando el lock y sus hashes Git.
El servidor aplica el manifiesto en memoria, después de comprobar el commit y los hashes
del archivo original y del resultado. Los originales en `.local/library/` quedan intactos.
La ruta con sufijo `-cover-entry-v1` distingue la variante de la descarga original y evita
confundir sus cachés. Un cambio futuro de revisión exige actualizar o quitar expresamente
este parche; no se sigue automáticamente una rama.

Pruebas: `node --test tests/navigation.test.mjs tests/library-cover-entry.test.mjs`.
Las dos pruebas del arranque real requieren haber ejecutado `npm run library:sync`;
si falta la descarga, se indican como omitidas, no como aprobadas.
