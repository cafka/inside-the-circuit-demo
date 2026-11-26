# Protocolo anterior a las llamadas

Rama aislada: `experiment/multimodal-cad-association`, desde `3fcd94e`. No se cambia el visor integrado, el catálogo original ni el despliegue.

1. Extraer grupos del GLB nativo de OpenCascade, previo a la partición curada. Solo jerarquía y extensión relativa, sin `components.json`, `catalog-enrichment.json` ni las 16 identidades. Conservar todas las piezas en el render. Los detalles demasiado pequeños quedan sin etiqueta según política previa, no se eliminan del modelo.
2. Numerar automáticamente, renderizar frente/reverso con profundidad, medir píxeles visibles y obtener un punto 3D de superficie mediante raycasting. Una fracción de grupos se reserva por hash antes de ver Gemini; esas observaciones no ajustan ni seleccionan la cámara.
3. Tres llamadas como máximo, sin reintentos automáticos: control fotográfico con el prompt actual; comparación CAD/documento/foto en la misma entrada; comparación en otra foto oblicua. Gemini 3.5 Flash Lite por Firebase AI Logic y App Check existente. Sin VM, recursos persistentes ni modelos locales nuevos. Estimación de pocos centavos, dentro del límite acumulado previo, no un presupuesto nuevo.
4. La comparación recibe fotos oficiales, renders neutros y documento original del fabricante. La tabla histórica queda fuera del permiso de lectura del proceso. Se registra respuesta literal antes de evaluar.
5. Verificador de píxeles existente, sin tolerancias nuevas. PnP con alturas del CAD, selección de focal usando solo ajuste y comprobación de objetos reservados. Los centros/rasgos propuestos siguen siendo aproximados; no se presentan intrínsecos estimados como cámara calibrada ni plano métrico validado.
6. Proyectar geometría auténtica y comprobar máscaras, competidores, relaciones y fuentes. Citar líneas existentes no demuestra por sí solo que una identidad sea cierta. Piezas repetidas o fuentes insuficientes quedan ambiguas. Las lecciones generadas son propuestas, nunca se sobrescriben las revisadas.
7. Abrir la tabla histórica únicamente en evaluación posterior: medir correspondencia de sólidos y exactitud semántica, separadas de región fotográfica/registro. Una ficha recuperada del catálogo no es una nueva ficha inferida.

La política numérica está en `policy.json`. Si fallan los controles, conservar candidatos y explicar el bloqueo. No ajustar parámetros a estas fotos ni iniciar una batería en placas nuevas.
