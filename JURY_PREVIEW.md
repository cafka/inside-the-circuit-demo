# Jury HTTPS demo

Open https://itc-nano-lab-20261121.web.app/ and choose **Explore boards → Upload photo**. Cloud inference requires consent. The deployed frontend uses Firebase AI Logic and App Check, with a protected Cloud Run endpoint that verifies component boundaries in the photograph.

The actual public Raspberry Pi 5 photograph test reached the Ethernet educational card in 17.33 seconds. A table was rejected as no board; a homemade board remained an unknown model without opening a similar catalogue entry. Failed identifications and the corrected RAM/microSD association bug are preserved in the evidence.

[Full execution report, screenshots, measured timings and limitations](docs/JURY_HTTPS_RESULTS.md)

The public catalogue includes Raspberry Pi 5 and Coral. Persistent preparation of new boards and public library packaging remain incomplete. The Motor rear-image experiment made one real Gemini call; its ambiguous alternatives prevented applying the rear texture, even though a separate diagnostic alignment passed. A complete browser test without a Google session remains pending; anonymous HTTP access has passed.

The service does not depend on an open Cloud Shell or a personal credential file. No debug tokens or service-account keys are included. Cloud Run scales to zero; recurring image storage and eventual usage can still incur charges. The cumulative authorization is USD 20, not a monthly budget reset. See [deployment and expense controls](deployment/verification/DEPLOYMENT.md).

Reproduce: npm ci, npm run build, then the tests and export commands in the linked report. Use a new isolated output directory and public Firebase runtime configuration. This export preserves an existing verified catalogue; it is not evidence of automatic onboarding.
