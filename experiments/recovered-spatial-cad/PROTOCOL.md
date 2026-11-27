# Recuperación geométrica, protocolo previo

Se reutilizan `dynamic-neighborhood/engine.py::associate` y `visual-anchors/engine.py::estimate_model`, sin cambios. Los pesos de prioridad proceden de `pcb-perimeter/policy.json`; las políticas geométricas y de vecindarios conservan sus valores. Se sustituye únicamente la entrada de búsqueda NCC y la comparación cromática del perímetro: las observaciones serán las respuestas Gemini ya congeladas y los contornos proyectados se contrastarán con bordes monocromos. No hay nueva inferencia ni costo Cloud.

Casos fijados: A nítida, B oblicua, A girada 180 grados (imagen y observaciones transformadas, prueba de equivariancia, no detección nueva), control sin bordes con las mismas propuestas. Las 16 asociaciones no están disponibles para el motor; se usan después para evaluación. La foto oficial fue parte de las llamadas congeladas y no se usa como mapa de posiciones anotadas.

Los grupos anónimos y dimensiones físicas provienen del CAD. Se priorizan área, singularidad de proporción, evidencia de borde, procedencia y separación espacial. La singularidad geométrica sustituye al descriptor NCC del priorizador histórico; no identifica por sí sola un componente. Se elige similitud, afín u homografía usando ajuste y requisitos históricos de referencias reservadas. La reserva no selecciona la transformación. Las propuestas ambiguas no generan anclas, pero siguen siendo alternativas en la asociación global.

La transformación plana sobre caras elevadas es solo estructural. Se conserva la altura CAD en la traza; no se fabrica una calibración de cámara. No se produce una pose métrica ni una ficha verificada a partir de vecindad solamente. No se modifican controles de la aplicación estable. La ejecución guarda rechazo, matriz diagnóstica, proyección y alternativas.

Para contornos se reutilizan Canny 50/140, soporte 0,65, soporte distribuido 0,4 y tolerancia equivalente a 2 píxeles/640 del verificador previo. Se comprueba además margen 0,1 frente a desplazamientos competidores (criterio del perímetro anterior). Estos controles son experimentales, no una calibración de precisión. No se ajustarán después de ver los resultados.

Otra placa: intentar extracción con el CAD disponible de Nano ESP32, sin cambiar código. Si faltan propuestas foto→CAD independientes, reportar ese límite y probar matemáticas con otra distribución; no convertir un render sintético en reconocimiento de una segunda placa física.
