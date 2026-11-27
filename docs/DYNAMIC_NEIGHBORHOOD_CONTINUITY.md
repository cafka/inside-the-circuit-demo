# Placa completa, vecindarios dinámicos y continuidad temporal

23/11/2026 · `experiment/dynamic-neighborhood-continuity`.
Base conservada: `37894fe14681d2699565e5ad96491ea4847f4e77`.

**Se implementó la comparación global con vecindarios variables y se ejecutaron
35 transiciones del video a resolución nativa.** Se mantuvieron siete etiquetas,
con seis vecinos informativos por objeto observado, y O6 quedó sin observación.
La revisión posterior confirmó continuidad visual de seis regiones, pero encontró
**deriva de O8 hacia dedo/fondo sin que el tracker declarase pérdida**. Por tanto,
cero cambios de identidad no significa siete localizaciones correctas.

La superposición 440 sigue siendo una hipótesis. Cero planos físicos certificados,
cero inferencias Gemini nuevas, cero gasto Cloud. Main y motores anteriores intactos.

## Datos completos y transformación inicial

- Referencia oficial completa **1515×1240**, sin reducción ni recorte.
- Video2 original **480×860**; todos los campos de movimiento tienen ese tamaño.
- Cuadros nuevos medidos, fijados antes de verlos: **441,445,449,455,465,475**.
- Se procesaron todos los intermedios 440→475: **1,406 s de video**, 35 transiciones.
- No se repitió una llamada Gemini. Las cajas originales de 440 permanecen intactas.
  Las regiones siguientes se denominan **seguidas temporalmente**, no detecciones nuevas.

El mapa usa los polígonos de `physical-layout/reference-only.json` y el sistema
físico aproximado de `manufacturer-structural/profile.json`. Las distancias para
ordenar vecinos se calculan en ese mapa. Sus anotaciones no son medidas certificadas
por el fabricante; no se inventaron alturas ni calibración.

Se compararon diez hipótesis: siete similitudes guardadas derivadas de Gemini,
dos afinidades estimadas desde sus grupos coherentes y la H rechazada del ensayo
anterior. El optimizador eligió **`similarity-2`**, soporte O1/O2/O3/O7, por costo
global **1,7932**, no por conocimiento del oráculo. La H anterior obtuvo **1,9588**
y no fue seleccionada. No se votó por cantidad de variantes correlacionadas.

Transformación inicial, referencia completa → captura:

```text
[-0.0182208388, -0.5594523760, 625.4665680821]
[ 0.5594523760, -0.0182208388, -38.3355496129]
[ 0,             0,            1]
```

Es una similitud aproximada, **no una homografía física validada**. Las alternativas
cercanas proponen las mismas siete asignaciones. Dos alternativas peor puntuadas
confunden la región destinada a O5 con O6; se conservan sus costos y propuestas.

## Cómo se usan los vecindarios

`engine.py::geometry` ordena todos los demás objetos por proximidad en el mapa.
`terms` recorre la lista completa, sin K máximo, y construye términos de relaciones
antes de optimizar las identidades. Un vecino participa cuando hay observación
fiable para el movimiento y separación geométrica suficiente para aportar evidencia.
Los que no participan quedan en `excludedNeighbors` con su motivo.

Se comparan bajo la transformación candidata:

1. Posición individual y tamaño aparente contextual.
2. Vector entre cada pareja: orientación, separación y orden.
3. Proporción relativa de tamaños entre ambos objetos.
4. Compatibilidad conjunta de todas esas relaciones con una asignación uno a uno.

No se comparan ángulos o distancias sin proyectar como si fueran invariantes a
perspectiva. El costo de pareja combina error vectorial, logaritmo de separación,
dirección y logaritmo de proporción de tamaños. El peso de tamaño es 0,25; el peso
de relaciones se normaliza por cantidad de objetos. La información geométrica se
pondera por separación respecto del tamaño de las regiones. Todos los parámetros
están en `policy.json`, sin condiciones por modelo de placa o componente.

`solve` hace una búsqueda global inyectiva con ramificación y cotas, incluyendo la
opción desconocida. Un límite de nodos puede impedir llamarla exacta; **ningún caso
real agotó ese límite**. Se vuelve a resolver prohibiendo cada asociación elegida
para medir la diferencia frente a su mejor alternativa global. No se permite que
dos identidades ocupen simultáneamente la caja compartida O1/O4.

No se fija la cantidad de vecinos. En el caso real hay siete regiones utilizables,
por lo que cada objeto observado usa **seis** vecinos. O6 no tiene región y usa cero.
Las pruebas verifican vecindarios de tres, seis y **doce** vecinos cuando los datos
lo permiten. Un límite administrativo inicial de doce objetos fue retirado al
revisar el contrato; no afectó la corrida de ocho objetos ni cambió costos o umbrales.
Se añadió una prueba con trece objetos para comprobarlo. No se reejecutó el video.

Ejemplo real, cuadro 475, orden por cercanía:

| Objeto | Vecinos utilizados |
|---|---|
| O1 | O2, O3, O4, O8, O7, O5 |
| O3 | O5, O2, O1, O8, O7, O4 |
| O5 | O3, O7, O2, O8, O1, O4 |
| O6 | Ninguno: no existe observación |
| O7 | O3, O5, O1, O2, O8, O4 |

**Limitación detectada:** la fiabilidad usada representa consistencia del flujo,
no certeza semántica ni visibilidad real. O8 pasó ese criterio pese a su deriva,
y siguió influyendo en sus vecinos. Esto queda registrado como fallo, no como
demostración de que todos los vecinos sean fiables.

## Continuidad sin reducción ni ventanas progresivas

`dense_motion` calcula Farnebäck en todo el fotograma, ida y vuelta, con **levels=1**:
solo la imagen original, sin niveles reducidos. Tiene un soporte local fijo de
15 píxeles para estimar movimiento; no recorta componentes ni usa ventanas de
búsqueda progresiva. [Contrato de OpenCV](https://docs.opencv.org/4.13.0/dc/d6b/group__video__track.html).

El movimiento del mapa se estima sobre puntos de zonas de sustrato proyectadas.
Una parte de los puntos se reserva y no participa en el ajuste temporal. Las
regiones de componentes se siguen por separado, para no obligar a las caras
elevadas a moverse exactamente como el PCB. Una pérdida declarada queda marcada
y no se reactiva sin redetección. Este mecanismo no detectó el fallo real de O8.

La imagen completa de referencia se conserva para las superposiciones. La identidad
se decide con mapa y relaciones; **no se realiza una nueva correlación fotométrica
de toda la referencia contra cada captura**. La transformación de visualización
naturalmente aplica escala/perspectiva; no es una reducción previa de los datos.

## Resultado medido

| Cuadro nuevo | Tiempo completo del paso | Tiempo de asociación | Mediana de reserva temporal | Etiquetas modificadas |
|---|---:|---:|---:|---:|
| 441 | 311,6 ms | 52,6 ms | 0,223 px | 0 |
| 445 | 293,9 ms | 46,9 ms | 0,147 px | 0 |
| 449 | 286,1 ms | 43,4 ms | 0,140 px | 0 |
| 455 | 288,9 ms | 43,6 ms | 0,115 px | 0 |
| 465 | 323,3 ms | 45,1 ms | 0,141 px | 0 |
| 475 | 285,6 ms | 44,1 ms | 0,124 px | 0 |

En las 35 transiciones: mediana **287,7 ms**, máximo **323,3 ms**; asociación mediana
**44,6 ms**, flujo completo ida/vuelta **229,5 ms**. Capacidad aproximada de este
ensayo CPU: **3,5 pasos/s**, inferior a los 25 cuadros/s del video. No se optimizó.
Lectura secuencial y ensayo completo: **12,07 s**. Los tiempos por paso excluyen
decodificación y escritura de figuras. Python 3.14.3/OpenCV 4.13.0, un hilo; hardware
registrado en `manifest.json`. No se mezclan tiempos Cloud históricos.

35/35 controles de movimiento pasaron. La mayor mediana de error reservado de un
paso fue **0,319 px**. Esta cifra mide consistencia temporal del movimiento, **no
precisión del contorno del PCB ni exactitud de las identidades**.

Asignación mantenida:

- O1 toma la única región antes etiquetada O1/O4.
- O2/O3/O7/O8 conservan sus regiones iniciales.
- O4 toma la región originalmente llamada O5; O5 toma la llamada O6.
- O6 queda sin observación; su proyección no se dibuja como detección.

## Revisión posterior y fallo que la continuidad oculta

Las salidas se congelaron antes de observar las imágenes nuevas para evaluación.
La revisión de Codex, no humana certificada, marcó centros aproximados de seis
caras visibles en los cuadros **441,455,475**: 18 pares objeto/fotograma. Incertidumbre
estimada de anotación **±5 px**. No entraron al detector ni modificaron el resultado.

Esas seis regiones se mantienen sobre sus cuerpos correspondientes. Mediana de
error de centro seguido: **4,24 px**; máxima deriva relativa respecto del primer
cuadro revisado: **6,47 px**. La incertidumbre de dos anotaciones impide interpretar
esa deriva como una medición precisa o un límite garantizado. O2 conserva un sesgo
de centro cercano a 12 px: una caja inicial aproximada no se vuelve exacta al seguirla.

**O8 es el contraejemplo real.** La caja alargada inicial tenía cobertura parcial;
durante la oclusión del dedo y su retirada, parte del seguimiento se desplaza hacia
el fondo. En 475 el centro seguido difiere aproximadamente **39 px** de un centro
visible anotado después, con incertidumbre aproximada de 8 px. El tracker informa
fiabilidad de movimiento 1,0 y ninguna pérdida. La etiqueta es estable, pero la
ubicación no queda respaldada. La anotación suplementaria y el fallo se guardan en
`posthoc-occlusion-failure.json` y `results/occlusion-failure.json`.

No se ajustaron coordenadas, pesos o tolerancias usando esas anotaciones. Tampoco
se contó O8 como un acierto de localización por conservar su etiqueta. Las cifras
de 18 revisiones favorables corresponden exclusivamente a los otros seis objetos.
Los cuadros 445,449,465 tienen métricas temporales y visualización, no centros
manuales independientes. Es el mismo video conocido: no demuestra generalización.

## Código, integridad y reproducción

Directorio `experiments/dynamic-neighborhood/`:

- `engine.py`: términos de vecindad, optimización y seguimiento completo.
- `common.py`: referencias e inicializaciones; afinidades desde Gemini.
- `run.py`: video nativo, auditoría de accesos, hashes y mediciones.
- `policy.json` y `PRE_REGISTRATION.md`: contrato previo.
- `test_dynamic.py`: ocho pruebas actuales, incluidas doce vecindades por objeto.
- `evaluate.py`, `render_failure.py`: evaluación posterior y figuras privadas.
- `results/run-v1/`: originales congelados; `results/evaluation.json` y
  `results/occlusion-failure.json`: evaluación y fallo suplementario.

Código ejecutado congelado: `3b4c8067836a07ac052fc43f155ffaddcbfe93ad`.
Resultados congelados: `edd2b41`. El evaluador verifica el código de ese commit,
no atribuye retrospectivamente al ensayo la eliminación posterior del límite de
catálogo. Para ocho objetos esa eliminación no cambia ninguna operación; se
verifica por comparación literal del código y política.

La guarda denegó realmente oráculo y sockets. No es aislamiento completo del SO:
OpenCV abre el video desde código nativo, fuera del audit hook de Python. El video
se identifica por SHA y 440 decodificado coincidió píxel a píxel con el original
enviado a Gemini. No se releyeron anotaciones de captura durante inferencia.

```powershell
python -m unittest discover -s experiments/dynamic-neighborhood -p test_dynamic.py -v
python experiments/dynamic-neighborhood/run.py --out .local/dynamic-reproduction/results --private-out .local/dynamic-reproduction/frames
```

Los destinos deben ser nuevos. Requiere el video privado registrado, los paquetes
locales existentes y la referencia original; no necesita cuentas ni servicios.
Para reproducir exactamente la revisión ejecutada, usar el commit `3b4c806`.
Fotos y figuras están fuera de GitHub, en `../dynamic-neighborhood/` respecto de
la raíz del repositorio. Sus hashes y los de entradas están registrados.

## Alcance logrado

Hay una asociación global con vecindarios verdaderamente variables y continuidad
medida en cuadros nuevos, sin reducción de imagen ni búsqueda progresiva. Se
mantienen seis regiones visualmente coherentes en la revisión; se preservan O6
ausente y el fallo de localización de O8. Sigue pendiente distinguir una región
con movimiento internamente coherente de una región que perdió su componente por
oclusión. La estabilidad temporal y la superposición 440 **no validan el PCB**.
