# Refinamiento global y seguimiento rígido — 23/11/2026

Implementado y ejecutado en `experiment/rigid-global-refinement`, desde `de1b0774a870a63d4dd19ada80430f0ca80e65e6`. **El mapa permanece rígido y deja de seguir individualmente el dedo/fondo, pero no se consiguió mejorar la alineación inicial ni conservar continuidad validada durante los 35 pasos.** No hay nueva validación física del PCB ni nuevas identidades visualmente confirmadas.

## Estado, código y procedencia

- Código y política congelados antes de la ejecución: `c26d63c66205c40235ae317c0771277151fcf59c`.
- Resultados congelados antes de abrir anotaciones de evaluación: `43f9318cfa2bcdbba2118ff3a76cef5f4f155f1e`.
- `main` conservado en `2633677fda6c538f695760238ce47a23f048cf67`; no cambios en los motores anteriores, Firebase, web o Kiro.
- `experiments/rigid-global/engine.py`: `refine_initial`, `fit_global`, `plane_candidates`, `step`, `verification_probes`.
- `run.py`: ejecución offline con entradas explícitas y trazas de cada cuadro.
- `test_engine.py`: nueve pruebas sintéticas; `verify_results.py`: integridad de los resultados reales.
- `evaluate.py` y `posthoc-axis.json`: evaluación posterior, fuera del proceso de inferencia.
- `policy.json` y `PROTOCOL.md`: parámetros y decisiones anteriores a la ejecución. Sin cambios posteriores para favorecer O8.
- `results/run-v1/`: 36 estados, transformación inicial y candidata, medidas, manifiesto, evaluación e invariantes. No contiene imágenes.

Referencia completa 1515×1240; captura nativa 480×860. Cero reducciones, recortes de inferencia, ventanas progresivas o llamadas Cloud. Se reutilizan las siete observaciones únicas de Gemini y sus asociaciones globales, no se altera ninguna caja. Se proyectan los ocho polígonos del catálogo, incluido O6 sin observación asociada. El perfil y los polígonos son anotaciones aproximadas de la referencia; no se convierten en medidas certificadas del fabricante.

Hashes SHA-256 verificados:

| Entrada | Hash |
|---|---|
| official-reference.png | `328bf630ffd2f8c10308aa8895cedf6b23fcd8ff45eff651f21175cde50a7ba5` |
| video2 | `875265c265f89002898a1d9a639bdec3592a2fe02bb11e0c7029c5be473f4fac` |
| Catálogo de referencia | `08830d62832ec73c17ce490d23d4ca0489dcf449b3f3cea552980a02ca827614` |

El cuadro 440 decodificado secuencialmente coincide píxel a píxel con el anterior. El manifiesto guarda hashes de cada fotograma, código, políticas y entradas. El audit hook rechaza efectivamente lecturas de `oracle.json`, evaluación posterior y sockets. OpenCV lee el video con su backend C fuera del hook Python, usando la ruta declarada y el hash verificado. Esto no se presenta como un sandbox de sistema operativo.

## Revisión del seguimiento existente

`experiments/dynamic-neighborhood/engine.py::advance` ya estimaba el movimiento del sustrato por Farnebäck de ida/vuelta y similitud robusta. Sus máscaras excluyen regiones elevadas según la referencia. Después también movía cada caja por separado y volvía a resolver identidades. `minimumMotionHullFraction` estaba declarado pero no aplicado por `motion_fit`. El flujo consistente de O8 acabó acompañando el dedo/fondo, conservando fiabilidad 1,0.

Se reutilizan **sin modificar** `dense_motion` y `sample_flow`, con los parámetros anteriores y `levels=1`. No se recuperan SIFT, AKAZE, NCC ni un detector de perímetro. El cambio es una nueva gestión del estado: `H_siguiente = incremento × H_actual`; cada polígono se calcula con `H_siguiente × polígono_original`. La verificación individual nunca escribe H ni mueve su polígono.

## A. Refinamiento inicial

Se reutilizaron correspondencias de píxeles archivadas en `gemini-pixel-registration/results/run-v1/frame-440.json`; **no son detecciones nuevas**. Se escogió `seed-2` por cercanía geométrica a `similarity-2`, sin usar su precisión para elegirlo. Tenía 13 correspondencias que habían superado los filtros del ensayo anterior. La zona 4, dos puntos, se reservó por separación espacial antes del ajuste.

| Modelo candidato | Consenso de 11 puntos de ajuste | Cobertura del mapa | Resultado |
|---|---:|---:|---|
| Similitud | 7 | 1,99% | Dos zonas, poca cobertura y residuo excesivo |
| Afín | 7 | 9,01% | Cobertura insuficiente |
| Homografía | 8 | 11,65% | Pasa ajuste; falla evaluación reservada |

La homografía usa finalmente cinco anclas en tres zonas. RMS de ajuste: **0,663 px**. Error mediano sobre los dos puntos reservados: **3,054 px antes → 5,482 px candidata**. Además, dos puntos reservados no cumplen el mínimo de cuatro exigido para validar independientemente ese modelo. Por ambas razones se rechaza. Se conserva exactamente `similarity-2`; no existe una transformación refinada aceptada. La figura inicial muestra también la candidata rechazada, sin confundir ajuste con validación.

La zona reservada es ajena al ajuste, pero dos mediciones próximas no constituyen validación física extensa. Tampoco se vuelve a verificar aquí que los matches archivados correspondan realmente al sustrato. Este ensayo demuestra que la información existente no justifica adoptar esa corrección; no demuestra que otra observación mejor sea imposible.

## B. Seguimiento global 440→475

Las máscaras de referencia se proyectan a la captura. En ellas se muestrea una grilla de 6 px y se descartan puntos con poca textura local o mala consistencia ida/vuelta. Se reservan celdas espaciales de 24 px antes de observar el movimiento. Sobre el resto se buscan modelos por complejidad: similitud, afinidad, homografía. Se comprueban residuos, fracción de consenso, tres zonas como mínimo y cobertura espacial. Los mínimos prácticos 3/4/5 exceden los matemáticos 2/3/4.

Del consenso se escoge un subconjunto por calidad y separación hasta explicar el movimiento con cobertura suficiente. **Se examinan muchas muestras para terminar ajustando con pocas**: 94–156 puntos en consenso frente a **3–6 anclas finales**, en 3–6 zonas, cubriendo 19,57–28,13% del área proyectada. No se afirma que todo Farnebäck haya procesado solo seis puntos. Se reservan 24–78 muestras por paso; pueden seguir teniendo correlación espacial y no son anotaciones externas.

Se propuso similitud en los 35 incrementos y se aceptaron **33/35**. Los cuadros 443 y 444 se rechazaron porque el p90 reservado alcanzó **4,679 y 4,017 px**, respectivamente, frente al límite congelado 3,5 px. En 443 seis puntos reservados próximos al dedo discrepan entre 5,74 y 6,53 px. La figura `rejected-motion-443.png` muestra exactamente esas observaciones. Las máscaras aproximadas de la referencia no garantizan que cada muestra siga viendo sustrato cuando hay oclusión.

En esos dos pasos se conserva H anterior y se marca `continuityIntact=false`. Se siguen calculando incrementos posteriores, pero **la continuidad acumulada permanece perdida**, sin fingir recuperación de los desplazamientos omitidos. El verificador global es conservador ante la oclusión, aunque ello perjudica la trayectoria. No se ajustaron tolerancias para ocultarlo.

| Cuadro | Anclas | Cobertura | Consenso | Reservados | Error reservado mediano px | Tiempo ms |
|---|---:|---:|---:|---:|---:|---:|
| 441 | 4 | 22,23% | 143 | 24 | 0,217 | 399,0 |
| 445 | 4 | 21,64% | 124 | 52 | 0,149 | 434,7 |
| 449 | 4 | 21,00% | 106 | 45 | 0,159 | 460,6 |
| 455 | 5 | 24,35% | 102 | 63 | 0,099 | 382,5 |
| 465 | 4 | 24,99% | 156 | 44 | 0,156 | 424,2 |
| 475 | 4 | 23,81% | 108 | 37 | 0,117 | 404,0 |

Los 35 pasos suman 10.924 descartes por flujo/textura y 21 outliers de ajuste; son muestras repetidas en el tiempo, no objetos únicos. La traza conserva coordenadas, zonas, roles, residuos y razones. Mediana de los errores medianos reservados: **0,118 px**, que mide consistencia incremental del flujo, **no precisión absoluta del PCB**.

Los ocho polígonos coinciden exactamente con la aplicación de H a sus coordenadas originales en los 36 estados: error de invariancia máximo **0 px**. Cero actualizaciones independientes de polígonos y cero nuevas resoluciones de identidad por cuadro.

## Precisión y deriva, separadas de consistencia del flujo

Evaluación posterior con 18 centros de caras visibles de O1/O2/O3/O4/O5/O7, cuadros 441/455/475, anotados en el experimento anterior con incertidumbre aproximada ±5 px. Autor Codex, no certificación humana. Son distintos de los puntos usados para ajustar; no son verdad métrica del plano. Catálogo aproximado, alturas y definición de centro también influyen.

| Resultado evaluado | Mediana de error de centro | Máximo |
|---|---:|---:|
| Cajas individuales anteriores | 4,24 px | 11,97 px |
| Mapa global anterior | 5,39 px | 14,13 px |
| Nuevo mapa global | 5,90 px | 15,75 px |

**No hay mejora demostrada de precisión global.** Diferencias subpíxel de estas medianas están por debajo de la incertidumbre de anotación. El mapa nuevo se separa del anterior unos 4,12 px medianos en 445 y 2,61 px en 475. Esta es divergencia entre estimadores, no error contra verdad externa.

Error de desplazamiento 441→475 frente a los centros visibles externos: O1 2,91; O2 4,43; O3 0,94; O4 1,78; O5 5,88; O7 9,26 px. El máximo anterior del mapa global era 6,88 px. Se omiten las incertidumbres correlacionadas al dar esas cifras brutas; no deben interpretarse como precisión de centésimas. **La deriva absoluta del PCB no es evaluable** sin referencias planarias externas calibradas. Los errores de caras elevadas no se corrigen deformando el mapa.

## C. O8 y oclusión

O8 recibe exactamente el tratamiento genérico del resto. Se proyecta desde el catálogo y no usa su observación local para mover H. Cinco sondas sobre el eje principal (extremos y puntos intermedios proyectados) comprueban textura y coherencia temporal; no son extremos detectados. En 475 solo tres tienen evidencia utilizable. Estado: `projected_only`, verificación `motion_inconsistent_or_unobservable`, `visualIdentityConfirmed=false`. No hay reacquisición ni contorno individual confirmado. Aunque las cinco sondas fueran coherentes, el código solo diría movimiento compatible, no identidad confirmada.

| Medida en 475 | Tracker individual anterior | Mapa global anterior | Nuevo mapa global |
|---|---:|---:|---:|
| Error contra centro histórico [352,385], ±8 px | 39,07 px | 24,15 px | 25,19 px |
| Error contra centro de eje visible revisado después, ±8 px | 25,15 px | 3,25 px | 5,75 px |
| Error de orientación del eje revisado | 5,21° | 2,11° | 2,01° |

El nuevo eje se anotó **después** del commit de resultados, extremos aproximados [359,244] y [344,483]. No se pasa al motor. Su centro no coincide con el histórico; la extensión considerada y/o el error de anotación impiden intercambiar esas dos métricas. Se conservan ambas, sin usar la más favorable como única prueba. Con ±8 px en los extremos, la incertidumbre angular es del orden de varios grados: **2,01° no acredita una mejora angular precisa** frente a 2,11°.

El beneficio verificable es eliminar la deformación individual y conservar explícitamente la incertidumbre. El mapa global anterior ya evitaba buena parte de la deriva: no se atribuye esa capacidad de origen a un detector nuevo. La nueva selección de anclas no supera aquí al mapa global anterior. Los ocho componentes permanecen como proyecciones; cero contornos individuales se colorean como observaciones confirmadas.

## D. Generalidad y pruebas

Nueve pruebas ejecutadas: similitud con movimiento incompatible; afinidad/perspectiva; perturbación exclusiva del conjunto reservado; degeneración colineal; tres catálogos de 3/7/13 polígonos variados; ausencia de datos iniciales; oclusión que deja soporte insuficiente; tres distribuciones espaciales sintéticas; Farnebäck real sobre textura sintética trasladada con una región tapada. En la última prueba, cambiar el catálogo conserva exactamente el mismo H y ningún componente puede actualizarlo. Se validan reglas del seguimiento, no reconocimiento visual de otra placa.

El motor no contiene O8, GPIO, nombres de placas, coordenadas particulares ni número fijo de componentes. Sí requiere un perfil con regiones de sustrato y exclusiones; esa capacidad debe prepararse para otra placa. Cinco sondas por eje son un muestreo de verificación declarado, no una cantidad fija de anclas globales ni una detección física. No se probó otra placa real.

## Rendimiento

Mismo video, dimensiones y CPU declarada por ambos manifiestos: AMD64 Family 23 Model 24, Python 3.14.3, OpenCV 4.13.0, un hilo OpenCV. No son corridas simultáneas ni se controló la carga externa.

| Etapa | Mediana ms |
|---|---:|
| Farnebäck ida/vuelta | 337,01 |
| Selección/estimación y traza del ajuste | 33,05 |
| Procesamiento completo por paso | **407,64** |
| Decodificación del cuadro, aparte | 2,35 |
| Motor anterior, procesamiento completo archivado | **287,71** |

Nuevo p95 495,84 ms; máximo 508,13 ms. Refinamiento inicial 7,04 ms, reutilizando el cache, sin incluir el costo histórico de producir correspondencias. Decodificación del video hasta 475 y ensayo: 17,26 s. Las medianas de etapas no se suman como si pertenecieran al mismo cuadro. Escritura de archivos y renderizado comparativo no están incluidos en el procesamiento por paso.

La nueva corrida fue **41,7% más lenta**. Incluso el Farnebäck idéntico tardó más que en la ejecución anterior (~229,49 ms), por lo que no se puede atribuir toda la diferencia al nuevo código. Se elimina el solver de identidades, pero la selección, trazas y flujo denso siguen teniendo costo. No se presenta una optimización lograda ni latencia interactiva de video.

## Evidencia visual privada y reproducción

Los PNG están fuera del repositorio, en `outputs/rigid-global-refinement/`: `six-frames-global.png`, `occlusion-comparison-475.png`, `initial-refinement-rejected.png`, `rejected-motion-443.png`. El manifiesto numérico público `private-figure-manifest-v2.json` identifica los archivos finales. La revisión de renderizado conserva alfa de la referencia; su decoración visible pertenece al archivo oficial completo. No cambia inferencia ni métricas.

Magenta punteado: mapa sin verificar. Verde: observaciones usadas como anclas del movimiento. Rojo: movimientos incompatibles. Naranja: cajas del tracker anterior, explícitamente sin confirmación visual. Cian reservado para contornos realmente verificados: **cero**, por lo que no se dibujan como tales. Se muestran los seis cuadros completos, sin reducir su resolución de entrada.

Desde la raíz del repositorio, con los activos privados existentes:

```powershell
python experiments/rigid-global/test_engine.py
python experiments/rigid-global/verify_results.py
python experiments/rigid-global/run.py --out .local/rigid-global/reproduction-results --private-out .local/rigid-global/reproduction-frames
python experiments/rigid-global/evaluate.py --figures ../rigid-global-refinement
```

El runner exige directorios nuevos y conserva la salida original. Los tiempos pueden variar. `evaluate.py` reproduce la evaluación de `results/run-v1`, no evalúa automáticamente la nueva corrida. Ninguna imagen privada ni ruta del video se publica en los resultados.

## Decisión

La separación entre mapa rígido y comprobaciones individuales está implementada y probada. **El criterio completo aún no se cumple**: refinamiento inicial rechazado, pérdida de continuidad por oclusión en dos incrementos, ausencia de reacquisición visual, ninguna validación física nueva y ninguna mejora de latencia o precisión global.

El obstáculo demostrado es doble: las correspondencias iniciales existentes no sostienen la corrección fuera de sus zonas de ajuste; durante el movimiento, las máscaras aproximadas no separan siempre oclusión de sustrato y el control reservado puede rechazar todo el incremento. Cualquier siguiente cambio tendría que preservar la transformación común, los rechazos y la separación de evaluación, y demostrar recuperación en una secuencia distinta antes de integrarse. No se cambia aquí el criterio ni se inicia otro método.
