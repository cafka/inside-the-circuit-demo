# Verificador permanente preparado, todavía no desplegado

El proyecto actual está en Spark, billingEnabled=false; Cloud Run no está habilitado.
Este servicio ejecuta el verificador de píxeles existente. No hace inferencias ni
genera CAD. No expone importaciones, archivos personales, revisiones o altas.
Recibe fotos consentidas, exige App Check válido para la app configurada, limita
el tamaño, ejecuta una sola verificación a la vez y elimina el archivo temporal.

Configuración propuesta: us-central1, una vCPU, 1 GiB, concurrencia 1, mínimo 0,
máximo 1 instancia, facturación por solicitud, tiempo de solicitud 65 s.
Dockerfile usa únicamente el cierre de dependencias del verificador.
La cuenta de servicio no necesita acceso al catálogo ni claves descargadas.

Antes de ejecutar se requiere autorización para habilitar facturación y estos
servicios nuevos: Cloud Run, Artifact Registry y Cloud Build. El despliegue público
de Hosting sí está autorizado y ya usa el plan gratuito.

Precios consultados 26/11/2026:
- Cloud Run: USD 0.000024/vCPU-s + 0.0000025/GiB-s activos. Con esta configuración,
  USD 0.0954 por hora activa antes de franquicias. Cien verificaciones de 5 s:
  aproximadamente USD 0.01325 de cómputo; cien de 60 s: USD 0.159.
- Cloud Build e2-medium: USD 0.003/min; 10 min = USD 0.03.
- Artifact Registry: primeros 0.5 GiB/mes sin costo; exceso ~USD 0.10/GiB-mes.
- Red saliente y Hosting pueden facturar si se exceden sus franquicias. No hay
  disco persistente, GPU ni dirección IPv4 reservada.
- Al vincular facturación, Gemini puede pasar a tarifa de pago: Flash-Lite
  USD 0.30/M tokens de entrada y USD 2.50/M de salida. No se agregan llamadas
  automáticas ni se cambia el modelo.

Una sesión técnica breve de hasta 100 verificaciones debería quedar por debajo
de USD 1, con reserva para red/almacenamiento. Esto no es un tope garantizado ni
una estimación de visitas ilimitadas. El presupuesto histórico total no se reinicia.
Alertas, max-instances y límites por navegador NO son límites duros de gasto.
Antes de exposición pagada se deben verificar gasto acumulado, cuota de AI Logic
y un spend cap con margen; los spend caps también tienen demora.

Fuentes:
https://cloud.google.com/run/pricing
https://cloud.google.com/build/pricing
https://cloud.google.com/artifact-registry/pricing
https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite
https://firebase.google.com/docs/projects/billing/spend-caps

La reconstrucción automática de nuevas placas sigue siendo otro servicio
pendiente: la sesión de depuración caducada no es una identidad de producción.
No se expone el servidor administrativo local para fingir que ese punto está resuelto.
