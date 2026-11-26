# Verificador HTTPS desplegado — 26/11/2026

Autorizado dentro del presupuesto acumulado de USD 20. Proyecto
`itc-nano-lab-20261121`, región `us-central1`, servicio `itc-photo-verifier`.
Frontend: https://itc-nano-lab-20261121.web.app/

Cloud Run ejecuta el verificador de píxeles existente. No hace inferencias ni
genera CAD. No expone importaciones ni el servidor administrativo. Exige App Check
válido para la aplicación y el origen configurados. Elimina las fotos temporales.
La identificación Cloud se solicita desde el navegador por Firebase AI Logic,
con consentimiento; no usa la cuenta personal del servidor.

## Recursos y reproducción

Una vCPU, 1 GiB, concurrencia 1, mínimo 0, máximo 1, timeout 65 s, facturación por
solicitud, sin startup CPU boost. Cuenta de servicio propia sin roles de proyecto.
Sin VM, GPU, disco persistente ni IP reservada. Endpoint público protegido por App Check.

```sh
node scripts/prepare-verifier-context.mjs /tmp/itc-verifier-build
gcloud builds submit /tmp/itc-verifier-build \
  --config=deployment/verification/cloudbuild.yaml \
  --substitutions=_IMAGE=REGION-docker.pkg.dev/PROJECT/REPOSITORY/photo-verifier:TAG \
  --project=PROJECT
gcloud run deploy itc-photo-verifier --image=IMAGE --region=us-central1 \
  --project=PROJECT --service-account=VERIFIER_SERVICE_ACCOUNT \
  --cpu=1 --memory=1Gi --concurrency=1 --timeout=65 --min=0 --max=1 \
  --no-cpu-boost --cpu-throttling --allow-unauthenticated \
  --set-env-vars=GOOGLE_CLOUD_PROJECT=PROJECT,ITC_FIREBASE_APP_ID=APP_ID,ITC_PUBLIC_ORIGIN=ORIGIN
ITC_VERIFIER_SERVICE=itc-photo-verifier ITC_BUILD_SHA=SOURCE_COMMIT \
  node scripts/build-jury-hosting.mjs NEW_OUTPUT/public PUBLIC_RUNTIME_CONFIG
cd NEW_OUTPUT
firebase deploy --only hosting --project PROJECT
```

Usar gcloud y Firebase CLI autenticados en el proyecto autorizado, sin claves
descargadas. El exportador lee el catálogo y copia solo activos redistribuibles.
No enviar el checkout completo a Cloud Build: el contexto permitido son diez archivos.

Build real `fcd2e48b-7c8a-4a5a-9595-524db80910eb`: SUCCESS, 77,34 s.
Imagen `sha256:b96b92c0d59041da1b985a9d168b607612efff9b02d15765aeb1496b6ad29770`.
Código del contenedor: commit público `d8acd53`. Firebase Admin 14.5.1.

## Gasto y límites

Consola del proyecto: USD 0,52 antes y después del ensayo. Los cargos nuevos aún
no figuraban; no equivale a costo cero. Se conserva el presupuesto acumulado USD 20.
Spend caps de USD 2 para Gemini y USD 2 para Cloud Run devolvieron CONFIGURED.
No son límites duros: pueden demorarse y se reinician mensualmente. No equivalen
a un presupuesto acumulado ni autorizan otro gasto al cambiar de mes. Las alertas
originales de USD 20 tampoco cortan automáticamente el consumo.

Precios consultados: Run USD 0.000024/vCPU-s + 0.0000025/GiB-s activos
(USD 0.0954/h activa); Build e2-medium USD 0.003/min; Artifact Registry primeros
0.5 GiB-mes gratuitos, exceso aproximadamente USD 0.10/GiB-mes. Flash-Lite:
USD 0.30/M tokens de entrada y USD 2.50/M de salida. El informe separa estimación
y facturación. Con mínimo 0 no hay instancia caliente obligatoria; almacenamiento
de imágenes, Hosting y transferencia pueden seguir cobrando. El servidor temporal
de Motor quedó detenido; la demo no depende de él. Revisar el acumulado durante
la entrega y antes del reinicio mensual de caps.

Si un operador necesita suspender los servicios pagos del laboratorio:
`gcloud billing projects unlink PROJECT`. Interrumpe el flujo Cloud y no es el
estado actual. No borrar catálogos originales ni recursos de otros proyectos.

Fuentes: [Run](https://cloud.google.com/run/pricing),
[Build](https://cloud.google.com/build/pricing),
[Artifact Registry](https://cloud.google.com/artifact-registry/pricing),
[Gemini](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite),
[spend caps](https://firebase.google.com/docs/projects/billing/spend-caps).

La reconstrucción permanente de placas nuevas sigue pendiente: la antigua sesión
de depuración caducada no se convirtió en una identidad de producción. Esta demo
reutiliza Pi 5 y Coral guardadas y avisa cuando una placa no está disponible.
