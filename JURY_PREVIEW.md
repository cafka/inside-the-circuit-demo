# Jury HTTPS preview

This release prepares the permanent Firebase Hosting frontend and read-only Pi 5 / Coral catalogue. It is not a completed camera-to-component demonstration yet. The Python pixel verification backend is not deployed; no unverified component boxes are shown. New board preparation remains unavailable in this Hosting-only configuration.

Source for the new Explore boards entry and explicit absent / unknown board outcomes is included. Photographs have not yet been evaluated in the public browser. App Check remains required. Firebase web configuration contains public application identifiers, never service-account keys, debug tokens or personal user credentials.

Build: npm ci && npm run build. Export with ITC_BOARD_STORE pointing to an isolated saved catalogue: node scripts/build-jury-hosting.mjs NEW_OUTPUT PUBLIC_RUNTIME_CONFIG. This is a verified catalogue export, not an onboarding test.
