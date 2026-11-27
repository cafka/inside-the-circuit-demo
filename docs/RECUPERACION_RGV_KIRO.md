# Recuperación ejecutable de R+GV de Kiro

22 de noviembre de 2026, America/Montevideo. Rama `experiment/recover-kiro-rgv`, derivada de `067fdd95d21d06fe4e6b2591c96ff059d553d6b7`. No se modifica `main`, P1+M+ ni `cafka/rpi5-explorer`.

## Resultado

Se recuperó **R+GV real**, no una reimplementación aproximada de NCC. La adaptación conserva exactamente las matrices, los polígonos, las decisiones y los diagnósticos históricos comunes en dos entradas existentes, cuando utiliza el perfil y comportamiento originales. La comparación excluye únicamente nuevos campos de instrumentación y renombra el contador de referencias anónimas.

En el modo nuevo, **los agujeros no se utilizan**. Se añadió una salida alternativa acotada: si la homografía reajustada incumple el control físico original de la placa, se intenta el modelo afín. Conserva todos los umbrales RMS/LOO, NCC, desplazamiento, rivales, forma y ambigüedad. Esto permite obtener un registro afín consistente de `video3_t019045ms`, con respaldo de textura local para SoC y RP1. No certifica la pose completa del PCB.

El error mediano frente a 29 puntos de borde anotados anteriormente es **7,13 px**, frente a **2,65 px** del R+GV original con agujeros. La incertidumbre de anotación es 3 px. Se recuperó funcionalidad sin esa dependencia, **no se demostró una mejora de precisión**. Los puntos no intervinieron en el ajuste, la selección ni la aceptación interna; la evaluación es retrospectiva, no ciega, y no cubre el contorno oculto completo.

## 1. Qué versión de Kiro corresponde

Fuente fijada: `cafka/rpi5-explorer@c0bd3991e998654c7b03f324fe0c2410a92fc953`, respaldo del 17/11. `tools/geom_eval/texture_align_var.mjs` conserva el hash `eb881c4f3134274276274b4fa295b8279222c2477a3c590980eb78c4b531284b` y no tiene modificaciones posteriores en el historial inspeccionado.

Se revisaron el informe del método E fechado el **16/11**, la revisión R+GV/W del **17/11**, la incorporación W-AS al teléfono, y los informes del **18/11** de rechazos RAM/RP1 y selección por contraste. Los archivos y hashes están en `experiments/rgv/history-evidence.json`.

- `experimental/e_textura/README.md`, `app.js` y `experimental/e_telefono/README.md` documentan R+GV predeterminado: `prune:true`, `lazyRivals:true`, `search:"c2f"`, `verify:true`.
- La búsqueda gruesa selecciona una hipótesis; la verificación recalcula con búsqueda completa y puede repetir el proceso completo. Esa selección inicial sigue siendo aproximada.
- W y W-AS fueron comparadores experimentales. Los consensos B, B+ y C y la verificación progresiva se midieron aparte. No se incorporan aquí.
- El informe del 17/11 no encontró errores de decisión en la equivalencia R+GV examinada. El del 18/11 conserva NCC y sus umbrales; la selección por contraste no aportó una mejora general integrable.
- El P1+M+ recuperado antes es otra línea, posterior, con pose de anillos. No reemplaza ni representa toda la implementación del método E.

R+GV recibe **observaciones previas de piezas**: identidad propuesta, caja/esquinas, visibilidad y confianza. La geometría propone una pose; la textura verifica y desplaza algunas anclas; después reajusta y aplica RMS/LOO. No es un detector autónomo de objetos a partir de una foto sin observaciones.

## 2. AKAZE: origen y evidencia, sin asumir un descarte

**El flujo principal actual no usa AKAZE.** `scripts/build-diagnostic.mjs` empaqueta `src/local/worker.mjs`, que usa el P1+M+ congelado. AKAZE está en `src/visual-correspondence/engine.py::detector/extract`, dentro de otro experimento.

En Codex se introdujo en `11640a34bb70d2751e717d38511485ed39d48aaf` el 21/11. `ec4ab08` separó la reserva geométrica; `624d5ef` documentó los resultados. Su justificación fue probar propuestas locales automáticas MLDB/Hamming, rivales NCC y reserva después del resultado negativo de SIFT. El informe `INFORME_CORRESPONDENCIAS_VISUALES.md` registra **0/11 poses reales**, sin H reales aceptables, y no recomienda integración. No reemplazó a R+GV: R+GV todavía no estaba importado en ese flujo.

En Kiro, `1e43fc1` introdujo AKAZE como variante diagnóstica el 12/11; `b272b68` agregó la variante a 360 px. `app/localizer.js` conserva ORB por defecto y `app/app.js` habilita AKAZE en diagnóstico. La comparación archivada `diagnosticos/analisis_akaze360/resumen_640_360.json` tiene 18 casos: `found` en 18 a 640 px y en 17 a 360 px, con diferencias de proyección de placa de hasta 210,8 px entre resoluciones. **La salida de 640 px no es verdad independiente** y `found` no implica precisión física. El informe E también menciona homografías AKAZE como verdad aproximada de datos anteriores.

No se encontró en los informes y el historial examinados una decisión explícita que descarte AKAZE universalmente. Sí hay evidencia para no presentar el experimento nuevo de Codex como solución validada. No se reejecutó AKAZE ni una batería histórica.

## 3. Código implementado y contrato

| Archivo | Responsabilidad |
|---|---|
| `src/registration/rgv/upstream/` | Siete módulos originales, bytes fijados y recuperables por commit; solo comparación y dependencias matemáticas/fotométricas |
| `src/registration/rgv/engine.mjs` | R+GV adaptado: perfil explícito, sin nombres, colores ni coordenadas de Pi 5 en la lógica |
| `src/registration/rgv/policy.mjs` | Parámetros históricos y opción separada de intentar afín ante homografía físicamente inválida |
| `src/registration/rgv/index.mjs` | API `createRegistrar().register()`, validación de contrato y estados de evidencia |
| `scripts/recognize-rgv.mjs` | Entrada local ejecutable con manifiesto de archivos y hashes; no usa red |
| `experiments/rgv/profile.json` | Perfil versionado de esta placa, fuentes, capacidades y referencias; agujeros desactivados |
| `experiments/rgv/recover.mjs`, `derive.mjs` | Recuperación reproducible y 22 sustituciones verificadas sobre la fuente original |
| `experiments/rgv/run.mjs`, `check-results.mjs` | Regresión acotada, comparación antes/después y medición externa posterior |
| `tests/rgv.test.mjs` | Otra distribución, giro, cambio de nombres/origen, caché y contratos negativos |
| `experiments/rgv/export.mjs`, `check-demo.mjs` | Demo local en español y comprobación en Chrome |
| `package.json` | Comandos optativos `rgv:recognize`, `rgv:regression`, `rgv:demo` |

Los cambios no activan R+GV silenciosamente en el botón de P1+M+: ese botón no dispone de las observaciones de piezas que R+GV necesita. La API y el comando nuevo son ejecutables dentro de Inside the Circuit; su activación es explícita y reversible.

### Capacidades y límites del motor

Esta estrategia admite **perfiles rectangulares con coordenadas métricas en milímetros**, mapa, referencia fotográfica y correspondencias previas. Rechaza otras unidades o contratos incompletos; no inventa dimensiones. Los mínimos de referencias/texturas, distribución y tolerancias siguen siendo requisitos declarados de R+GV, no promesas universales para todas las placas.

Nombres, alias, dimensiones, regiones y plantillas se reciben por perfil. El código no decide por nombre de pieza ni exige cuatro referencias, color dorado o posición fija. Las referencias anónimas son opcionales y están vacías en el perfil activo. El perfil de compatibilidad con agujeros existe únicamente en la regresión del original.

La generalidad se comprobó con otra disposición sintética de **120 × 90 mm**, tres estructuras, giro de 180°, identificadores arbitrarios y un origen desplazado. Conservó las proyecciones con diferencia menor a 1e-6 px. No es una prueba de reconocimiento real de ESP32 o Arduino. La procedencia oficial de dimensiones no elimina la incertidumbre: el mapa de Kiro mezcla plano aproximado, identidades asignadas visualmente y mapa fotográfico manual. Los chips y conectores tienen alturas sin calibrar.

### Cambios mínimos respecto del original

1. Parámetros específicos fuera de la lógica; ninguna detección se genera proyectando las posiciones del perfil.
2. Caché NCC aislada por motor de referencia, además de imagen: la clave histórica no distinguía dos referencias con el mismo id y matriz. La prueba con referencia invertida confirma que no se reutiliza una correlación de otra referencia.
3. Intento afín cuando `boardOK` rechaza la homografía. Está separado en `RGV_REGISTRATION_POLICY`; `RGV_POLICY` conserva el comportamiento original para equivalencia. No se rebajó ningún umbral. Una homografía admisible sigue teniendo la prioridad histórica: no se implementó una selección general de complejidad de modelos.
4. Observaciones ligadas al hash de imagen y distinción explícita de simulación/anotación. `map_projection` no se admite como origen visual. Los metadatos de procedencia no equivalen a una autenticación criptográfica del proveedor.
5. Los estados públicos no heredan ciegamente `reconocido`: sin textura propia confirmada y detección próxima se muestra `geometrically_estimated`. El valor original queda en `legacyStatus` para revisión.

## 4. Resultados comparados

Corrida final: `experiments/rgv/results/2026-11-22T12-01-11-692Z.json`. Antes del intento afín: `2026-11-22T12-00-14-614Z.json`. Fotografías 480 × 854, mismos hashes y respuestas. No se repitieron las once fotos ni las baterías de cientos de casos.

| Caso | Procedencia de las observaciones | R+GV original | Sin agujeros, antes | Sin agujeros, después |
|---|---|---|---|---|
| `video3_t019045ms` | Respuesta real de Gemini guardada el 15/11 | Homografía aceptada internamente | Rechazo del reajuste | Afín consistente; SoC y RP1 con respaldo local |
| `video3_t006825ms` | **Ensayo SIMULADO desde anotaciones anteriores** | Rechazo LOO 6,24 mm | Afín consistente | Mismo resultado asistido |

El segundo archivo contiene `responseId:"ensayo-simulado"` y latencia de 1 ms. `tools/geom_eval/videos_eval.mjs` construye sus cajas desde anotaciones manuales refinadas. No se cuenta como inferencia real ni éxito autónomo. La primera corrida de recuperación lo había etiquetado demasiado ampliamente como respuesta guardada de Gemini: se conserva y se invalida esa atribución en `PROVENANCE_CORRECTION.md`. El adaptador ahora exige habilitar explícitamente la reproducción de anotaciones y la demo la rotula.

### Foto real con respuesta real

La homografía sin agujeros del reajuste original tiene denominador `1 - 0,0248103122 x + 0,0011704913 y`: cambia de signo dentro del rectángulo del perfil. `boardOK` la rechaza. No era un simple problema de tiempo o de NCC no ejecutada. La semilla tenía SoC y RP1 confirmados por textura; RAM no superaba el margen frente a RP1.

El intento afín da RMS **0,57 mm**, máximo LOO **3,02 mm**, dentro de los límites originales 2,5/5 mm. Ajusta cuatro referencias: SoC y RP1 corregidas por textura, RAM y GPIO procedentes de Gemini. **Estas últimas no se convierten en confirmaciones visuales independientes**. El método recuperado todavía admite anclas no confirmadas por NCC en el ajuste: limitación que permanece explícita.

| Región | NCC propia final | Desplazamiento | Margen rival | Estado público |
|---|---:|---:|---:|---|
| SoC | 0,707 | 0,50 mm | 0,366 | Respaldo visual local |
| RAM | 0,565 | 0,50 mm | 0,080 | Solo estimada; margen insuficiente |
| RP1 | 0,701 | 1,00 mm | 0,206 | Respaldo visual local |
| PMIC | 0,623 | 1,58 mm | No evaluado en ese rechazo | Solo estimada |
| GPIO, Ethernet, USB-C | Sin plantilla NCC propia | — | — | Solo estimadas |

Son decisiones del algoritmo, no exactitud electrónica verificada. LOO vuelve a ajustar sin una referencia, pero reutiliza la selección de hipótesis y centros corregidos por textura; **no es una prueba externa independiente**. `poseIndependentlyValidated` permanece `false`.

El borde externo anotado da mediana/P95/máximo **7,13 / 15,88 / 18,84 px** con el afín, frente a **2,65 / 6,12 / 8,00 px** con la homografía original apoyada en agujeros. No se adoptaron estas anotaciones como criterio nuevo de aceptación. No hay anotación independiente de borde disponible en esta evaluación para el ensayo asistido.

### Tiempos y cantidad de trabajo

| Caso, modo nuevo | Gris | Algoritmo | NCC incluida en algoritmo | Total local | Correlaciones / posiciones |
|---|---:|---:|---:|---:|---:|
| Real, 19,045 s | 1,67 ms | 111,19 ms | 101,2 ms | **112,86 ms** | 71 / 11.480 |
| Asistido, 6,825 s | 1,60 ms | 101,53 ms | 89,1 ms | **103,12 ms** | 56 / 10.148 |

Una ejecución por variante en el mismo proceso, original primero. El original consumió 389,89 y 183,53 ms; cambia la cantidad de hipótesis y el calentamiento, por lo que no se infiere una aceleración general. La ejecución aislada del comando sobre el ensayo asistido tardó 213,91 ms en algoritmo. Preparación de referencia, carga y decodificación se registran aparte en el comando.

**Estos tiempos no incluyen obtener las observaciones.** La respuesta real archivada registraba 9.509 ms de Gemini, dato histórico no repetido aquí. Tampoco son comparables con los 20 segundos de búsqueda abierta de plantillas del experimento anterior: aquel no recibía etiquetas/cajas previas.

## 5. Pruebas y fallos conservados

- Equivalencia del modo original: 2/2 entradas, matrices, polígonos, estados y campos comunes iguales.
- Regresión específica del intento afín: misma foto/hash/respuesta antes y después; el rechazo proyectivo pasa a registro afín consistente. La entrada asistida conserva su resultado.
- Giro de 180° sobre la foto real: mismo registro, error máximo entre esquinas transformadas 2,5e-12 px. Las observaciones también se giraron; **no se ejecutó nuevamente un detector**.
- Imagen uniforme con cajas heredadas y ausencia de observaciones: se abstienen. Es un control pequeño, no una tasa medida de falsos positivos en otras escenas.
- 26 pruebas focalizadas de contratos, geometría, textura y R+GV pasan. No se ejecutó una batería extensa.
- Fuentes estables P1+M+: 12/12 hashes coinciden. Kiro conserva `ae56be650cab47fb5ee2c78659df86d2e1571a9b` y árbol limpio.
- Demo comprobada en Chrome: dos imágenes, rotulación de origen real/simulado y ningún error de página.

## 6. Ejecutar y revisar

Desde la raíz del repositorio, con acceso autorizado al checkout original y las fotografías privadas:

```powershell
node experiments/rgv/recover.mjs C:\Users\clalf\Documents\CentralResurrection
node experiments/rgv/derive.mjs
npm run rgv:regression
npm run rgv:demo
npm run rgv:recognize -- .local/rgv/input-example.json .local/rgv/resultado-nuevo.json
node --test tests/rgv.test.mjs tests/geometry.test.mjs tests/texture.test.mjs tests/contracts.test.mjs
```

El ejemplo del comando está marcado `allowAnnotationReplay:true`: es la entrada asistida. El manifiesto liga cada archivo a su SHA-256; otro caso exige su propia fotografía, observaciones y hashes, no reutilizar cajas de una imagen diferente. El comando escribe un archivo nuevo y no sobrescribe resultados. La API admite observaciones de otros proveedores; la utilidad de conversión implementada aquí corresponde al contrato histórico guardado de Gemini.

La demo `Demo_RGV_recuperado.html` se guarda en el directorio de entregables, fuera de Git, con las fotos privadas incrustadas para uso local. Resultados y código sí se versionan; las fotos y respuestas completas permanecen en `.local/rgv`. Los JSON incluyen versiones/hash de código ejecutado; el SHA del commit de entrega se registra después de publicar.

Después de medir se eliminaron espacios finales del motor generado, sin otra diferencia. `experiments/rgv/executed-engine.mjs.gz` conserva exactamente los bytes medidos y `source-formatting.json` registra ambos hashes y la equivalencia de formato. No se reescribieron los hashes de las mediciones.

## 7. Impedimentos concretos pendientes

Hay un motor recuperado y probado, pero no un reconocedor genérico completo validado. Falta un proveedor de anclas automático integrado para imágenes nuevas: Firebase actual identifica la placa, no entrega ese contrato de piezas. También faltan puntos métricos con altura/paralaje controlados, validación externa suficiente del PCB y evidencia real de otra placa. El perfil fotográfico es aproximado; no basta con que sus dimensiones nominales sean oficiales.

El siguiente resultado que debe preservarse es la separación entre textura comprobada y proyección estimada, junto con los rechazos. La prioridad es aportar observaciones fiables y comprobar su precisión métrica; no bajar márgenes de NCC ni declarar verdadera una pose porque tiene RMS bajo. No se activa W, W-AS, consensos, servicios facturables ni se sustituye la aplicación estable.
