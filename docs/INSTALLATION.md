# Local installation and reproducible catalogue

## Requirements

- Node 24.12 or later and npm. Versions/integrity: `package-lock.json`.
- Python 3.14 for local CAD/photo generation. The viewer/server does not itself require Python when all models exist.
- Modern WebGL browser. Camera requires localhost or HTTPS and user permission. Nano requires actual installed multimodal capability; no browser version promises its availability.
- Internet for external resources, the independent books and authorized Cloud inference. No GPU/VM is provisioned by setup.

```sh
npm ci
python -m venv .local/venv
# Windows PowerShell:
.local/venv/Scripts/Activate.ps1
# macOS/Linux instead: source .local/venv/bin/activate
python -m pip install -r requirements-release.txt
npm run build
npm run library:sync
npm run catalog:restore
npm start
```

Optional wrapper: `node scripts/setup-release.mjs --python`; it does not activate the environment in its parent shell. The Python PDF dependency is AGPL/commercial and its transitive packages must retain their notices. For a minimal saved-catalogue restoration, only numpy/OpenCV/Pillow/cadquery-ocp are needed; PDF extraction is for new acquisition.

Open **http://127.0.0.1:4188/**. Keep one server. `PORT` changes the port; `ITC_BOARD_STORE` changes the catalogue directory. Both are optional. The default is `.local/release/catalog`. Root opens home; `/library/` opens the independent book container.

## What restoration actually does

`release/catalog-manifest.json` restores approved results, not a new discovery experiment:

- Pi: copy the MIT-licensed converted model already included in the source tree.
- Coral: copy the Apache-2.0 model, surface derivatives and full degenerate-face diagnosis.
- Nano: download the pinned Arduino STEP archive, check archive/member hashes, then run the unchanged converter. The generated model must match the expected hash before the saved bindings are installed.
- Motor: download two pinned official photographs, decode with the pinned sharp version, and generate the model from saved observations/presentation metadata. No photo pixels or textured Motor GLB are shipped. Download permission is not redistribution clearance.

The existing catalogue is never overwritten. A changed upstream resource or generated hash stops with an explicit error. No Gemini call occurs. `restoration-receipt.json` records per-board time and downloads/cache reads. `ITC_RESOURCE_CACHE` optionally points to a directory whose filenames are SHA-256 values; each cached input is still verified. The empty-directory test used this mode, not a fresh network acquisition.

Public sources can disappear or change; do not bypass hash failures. Inspect and version new source evidence first. The Node service resolves model names from the shared record format; it does not infer board identity from a file's name.

## Firebase and consent

Copy `config/runtime.example.json` outside Git, populate `firebase` with the authorized project's Firebase web configuration and `appCheck.siteKey` with its registered reCAPTCHA site key. Set `ITC_RUNTIME_CONFIG` to that private file before starting the server. Example shape:

```json
{
  "firebase": {"projectId": "itc-nano-lab-20261121", "apiKey": "REPLACE_LOCALLY", "appId": "REPLACE_LOCALLY"},
  "appCheck": {"provider": "recaptcha-enterprise", "siteKey": "REPLACE_LOCALLY"},
  "cloudEnabled": false,
  "maxCloudCallsPerSession": 1,
  "cloudConsentVersion": "photo-upload-v1"
}
```

Do not put service-account keys or debug tokens in this file for public deployment. The endpoint exposes only the public Firebase web fields and site key; these are client configuration, not server secrets. Configure authorized domains/API restrictions and enforce Firebase AI Logic App Check in the project. A client obtaining a token alone does not prove server enforcement. Verify one accepted request and one invalid/missing-token rejection in an explicitly authorized session before presenting a public AI demo.

The current adapter restricts project/app identity to the existing lab as an expenditure guard. A different deployment project requires an intentional reviewed configuration/guard change; it is not silently supported. The supplied default disables Cloud. The ordinary user sees a consent checkbox only when the operator enables it and never chooses the model engine or enters keys. Administration retains advanced configuration/diagnostics.

`ITC_RECONSTRUCTION_SESSION` is a separate private, expiring, budgeted session used by new no-CAD reconstruction. Historical configuration was revoked. Do not copy tokens from old logs. The API cannot enable billing. Session quotas and budget alerts are not hard account-wide caps. The previous US$20 allowance does not reset with RC1.

## Tests and limits of portability

```sh
npm run test:release
```

These tests require no cloud and label inference doubles explicitly. Recorded real calls remain historical. Current photo-component localization requires three private inherited reference assets; the clean public distribution does not ship them. Without authorized local fixtures it reports localization unavailable. Name-based 3D exploration, CAD enrichment and the saved catalogue remain usable.

For future deployment, add authenticated administration, shared storage, HTTPS/secure camera context, durable jobs, runtime permissions, rate limits and per-user consent. Do not expose the current loopback-only administrative server by simply changing its bind address. No deployment or new infrastructure was performed in RC1.

## Temporary authenticated HTTPS preview

Google Cloud Shell can run this backend behind its HTTPS proxy without creating a paid Compute Engine VM. After installation and catalog restoration in Cloud Shell:

```sh
export ITC_PYTHON="$PWD/.local/venv/bin/python"
export ITC_RUNTIME_CONFIG="$HOME/itc-preview-runtime.json"
node scripts/start-cloudshell-preview.mjs
```

The script prints the origin, allows only that exact origin/host, keeps the Node listener on 127.0.0.1, and stops after two hours. Cloud Shell requires the same signed-in Google account and an active session; this is not anonymous, durable hosting. Do not enable billing automatically. A permanent multi-user backend still needs separately reviewed hosting, authentication and cost controls.
