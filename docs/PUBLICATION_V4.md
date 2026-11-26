# Publicación v4 — comprobación de entrega

Fecha de revisión: 25/11/2026, Uruguay. Documentación recibida: `Inside_the_Circuit_README_v4.zip`, SHA-256 `60b6f349021053c37d6d49e179a62fa8cd7e7e0607e3ac88705e32317dd38b88`.

## Distribución y documentación

Repositorio de presentación: https://github.com/cafka/inside-the-circuit-demo . Se exporta una distribución con historia nueva; el repositorio de investigación permanece privado y su `main` no se modifica. Incluye código frontend y backend, generación CAD/ECAD y sin CAD, adaptador Firebase AI Logic, políticas, dependencias, pruebas, licencia MIT y avisos de terceros. Los caminos `experiments/board-library` conservan su nombre para evitar una refactorización durante la entrega: contienen el motor integrado, no una dependencia privada.

Se preservan los diez diagramas bilingües, la estructura narrativa y las tablas de v4. `generate_diagrams.py` los regenera con Python estándar. Solo se actualizan hechos de integración: catálogo unificado, relieve ilustrativo, biblioteca fijada, comandos y verificación. Las métricas históricas de Coral y Motor siguen identificadas como tales. `review-only/` nunca entra en la distribución.

## Biblioteca independiente

Publicación fijada: `cafka/interactive-electronics-books@3b77d06dcb899d922be0afa0cfad8d95557bd87a`. `npm run library:sync` verifica 36 archivos por hash Git y tamaño, descargados fuera de Git; no hay una copia manual ni cambios al repositorio Kiro. Actualizar con `node scripts/sync-library.mjs --revision <SHA-completo-revisado>` y revisar el lock. Primera descarga: 3.033,70 ms. Registro: cuatro capítulos Pi y uno ESP32-DevKitC; no Coral ni Nano compatible. La carga y navegación se observaron; la transición animada a lectura no se completó a tiempo en esta sesión. No se declara resuelta esa limitación ni sincronización de idioma/tema.

## Firebase y acceso HTTPS

Proyecto comprobado: `itc-nano-lab-20261121`, número `970731928304`. Consulta real: **billingEnabled:false**, sin VM, discos ni direcciones IP de Compute Engine. App Check de Firebase AI Logic: **ENFORCED**. La primera consulta omitía el proyecto de cuota y devolvió 403; repetir con `x-goog-user-project` confirmó el estado.

Se registró una aplicación web para la vista previa y reCAPTCHA Enterprise con dominios explícitos y puntuación mínima 0,5. Configuración privada fuera de Git; sin token debug. La facturación sigue desactivada. La obtención de un token válido y una inferencia real desde HTTPS requieren su prueba final; la configuración por sí sola no cuenta como una inferencia exitosa.

El backend conserva escucha en loopback y permite un origen HTTPS exacto detrás de un proxy autenticado. `node scripts/start-cloudshell-preview.mjs` lo ejecuta en Cloud Shell con límite de dos horas. El enlace es temporal y exige la misma cuenta Google: no equivale a un despliegue público persistente. Las mediciones de Cloud Shell se identificarán como tales, nunca como las de la VM e2-standard-8 eliminada. No se ha creado una nueva VM ni activado facturación.

## Pruebas y mediciones

Compilación local correcta; **33/33 pruebas focalizadas**, 1.097,99 ms. Los dobles de inferencia se etiquetan explícitamente. El nuevo control de origen rechaza hosts/orígenes ajenos y la configuración pública omite secretos. Se registra tiempo de trabajo de selección y tiempo hasta cuadro presentado por separado de carga de modelo. Estos campos no son una medida de precisión.

La captura actual de Raspberry Pi conserva el modelo y la selección BCM2712. Nano abrió desde el catálogo con sus cuatro asociaciones; la captura automática sufrió timeout del navegador y no se inventó una imagen de sustitución. La prueba completa en teléfono físico debe realizarla la usuaria con el enlace HTTPS.

## Auditoría y licencias

La exportación por lista explícita excluye historia privada, fotos/videos de investigación, archivos personales, configuración activa y campañas de pruebas descartadas. Se escanean patrones de claves y rutas personales antes de copiar. El escáner no constituye garantía absoluta de ausencia de secretos.

- Código propio MIT; se conservan las atribuciones del código recuperado de Kiro.
- Pi CAD y gráficos: aviso MIT del fabricante; captura actual autorizada por esa licencia.
- Coral CAD/ECAD: Apache-2.0; modelo enriquecido y capas identificados como derivados. Capturas Coral/autoría del libro proporcionadas expresamente para publicación por la autora.
- Nano: arte eléctrico CC BY-SA 4.0, atribuido. El STEP separado no contiene un aviso explícito: su GLB y su captura no se redistribuyen hasta aclararlo; se conserva adquisición local desde la fuente oficial.
- Motor: fotos, texturas y capturas excluidas por falta de permiso afirmativo de redistribución; permanece esquema conceptual y restauración local fijada por hashes.
- Biblioteca Kiro: sin licencia abierta elegida en el README revisado; se consume su publicación por versión, sin añadir su código al repositorio MIT.
- Dependencias nativas conservan sus licencias; PyMuPDF es AGPL/comercial, opcional para extracción documental. Un servicio público que lo utilice requiere revisar sus obligaciones; no se lo presenta como MIT.

## Pendientes explícitos

Confirmar derechos de redistribución del STEP Nano y fotos Motor; verificar lectura completa de biblioteca y uso táctil físico. El laboratorio no tiene VM que reutilizar: medir en Compute Engine requeriría una autorización concreta de recurso pago. Hosting permanente, costes y almacenamiento multiusuario no se resuelven con un enlace temporal. La autora presenta Devpost personalmente.
