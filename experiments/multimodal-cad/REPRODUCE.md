# Reproduce the isolated experiment

Read [the report](../../docs/MULTIMODAL_CAD_ASSOCIATION.md) before interpreting a count. The saved run produced **zero independently verified photo-to-CAD links**. Opening the review page does not invoke Gemini.

## Offline results and tests

From the repository root, with its lockfile dependencies installed:

```sh
npm ci
node --test experiments/multimodal-cad/tests.mjs
python experiments/multimodal-cad/test_pose.py
npm run test:release
python -m http.server 4215 --bind 127.0.0.1 --directory experiments/multimodal-cad
```

Open `http://127.0.0.1:4215/review.html`. Runtime versions are in `results/environment.json`. Python needs the pre-existing OpenCV/NumPy/Pillow environment; document extraction additionally uses PyMuPDF. These are classical geometry/image tools, not a downloaded AI model. No model training is involved.

## Recreate input data without reading historical associations

Use a new directory, not a saved catalogue. The following Python setup is portable and does not overwrite an existing experiment directory:

```python
from pathlib import Path
import shutil
root=Path('.local/multimodal-cad-repro')
(root/'inputs').mkdir(parents=True, exist_ok=False)
for name in ['candidates.json','render.json','front-labelled.png','back-labelled.png','target-a.jpg','target-b.jpg']:
    shutil.copyfile(Path('experiments/multimodal-cad/fixtures')/name,root/'inputs'/name)
```

The fixtures are the frozen, automatically extracted CAD inputs and licensed public target photographs. They are sufficient to rerun pixel verification. To rerun Gemini, download the official reference PNG and Product Brief using the URLs and SHA256 values in the report. Do not substitute a catalogue render or an annotated target image. Run:

```sh
python experiments/multimodal-cad/documents.py .local/multimodal-cad-repro/product-brief.pdf https://pip-assets.raspberrypi.com/categories/892-raspberry-pi-5/documents/RP-008348-DS-10-raspberry-pi-5-product-brief.pdf .local/multimodal-cad-repro/inputs/documents.json
```

Expected canonical document hash: `e2079cd8459fa6eeb4ae30a7ffb24c19c8b5eba97c1765f83d938c20f54fe2d6`. The exact JSON byte hash can differ with whitespace/escaping; the extracted lines must not differ.

To **regenerate**, rather than replay, the CAD groups, reuse the native GLB (SHA in report) or convert the official STEP with the existing generic converter:

```sh
python experiments/board-library/convert-step.py /path/to/official.step .local/multimodal-cad-repro/native.glb --sha256 78164070c1cc7ab854382950d2e85926c6e35432f1e5a146b733397a7c6afb44
node experiments/multimodal-cad/prepare.mjs .local/multimodal-cad-repro/native.glb .local/multimodal-cad-repro/native.conversion.json .local/multimodal-cad-repro/generated
node experiments/multimodal-cad/server.mjs .local/multimodal-cad-repro/generated 4214
```

Open `http://127.0.0.1:4214` and press the render button. Never use the semantically batched catalogue GLB as a native input. The official ZIP is:

https://pip-assets.raspberrypi.com/categories/892-raspberry-pi-5/documents/RP-010083-CA-1-rpi-5%203D%20STEP%20-%20No%20Graphics%20small%20file.zip

Its CAD license is copied in `fixtures/CAD-LICENSE.txt`. The actual run reused the already converted native GLB; conversion was **not timed again**. `evaluation-only/historical-convert-native.py.txt` preserves the exact historical converter as an audit source, not an inference module. A fresh converter/OCCT build may serialize a different GLB hash; check topology, units and provenance before comparing IDs, not just the filename.

## Actual new inference (optional, billable)

Use the authorized existing Firebase app configuration and App Check Enterprise site key, in a private runtime file with fields `firebase` and `appCheck.siteKey`. Never commit credentials/debug tokens. The Cloud Shell preview used in this run already passed App Check; a different origin may need registration by the project owner.

```sh
node experiments/multimodal-cad/browser-server.mjs .local/multimodal-cad-repro/inputs /private/runtime.json 8080
```

In the browser choose control/A, CAD/A, CAD/B, one call each. The experiment server allows these three case names once each and shuts down after 25 minutes. It is intended for the authenticated Cloud Shell preview, not public hosting. Stop it after collecting results. Inspect the saved `calls/*.json` for `completed`, `appCheck.tokenReceived`, `inferenceSource`, hashes, literal response and token accounting. There is no guarantee of the same model output on a repeat, even with temperature zero.

Do not reuse the expired Node diagnostic configuration. `client.mjs` is the alternate filesystem-isolated client; the real successful execution used `browser-client.mjs`, with no App Check bypass.

## Offline replay of the original responses

```sh
python experiments/multimodal-cad/verify.py .local/multimodal-cad-repro/inputs experiments/multimodal-cad/results/live/cad-target-a.json .local/multimodal-cad-repro/check-a
python experiments/multimodal-cad/verify.py .local/multimodal-cad-repro/inputs experiments/multimodal-cad/results/live/cad-target-b.json .local/multimodal-cad-repro/check-b
```

Both must abstain for insufficient fit objects. Exact CPU timing can vary. The existing verifier has a relative JSON image-path interface; for the control construct a request with the absolute target filename and `baseline.parsed.components`, then run:

```sh
python experiments/board-library/verify-photo-proposals.py /path/to/baseline-request.json
```

## Evaluation only, after freezing responses

The exact evaluation command used in the development checkout was:

```sh
node experiments/multimodal-cad/evaluate.mjs .local/multimodal-cad/inputs .local/multimodal-cad/calls .local/multimodal-cad/evaluation experiments/photo-evidence-v2/results/historical-16.json .local/multimodal-cad/inputs/geometry.glb .local/photo-evidence-v2/catalog/raspberry-pi-5/record.json experiments/board-library/catalog-enrichment.json
python experiments/multimodal-cad/export.py .local/multimodal-cad
```

On the public source checkout, substitute `release/catalog/raspberry-pi-5/record.json` for the local catalogue record and supply the regenerated native GLB. The evaluation code reads existing cards into memory; it does not write the catalogue. The historical table and this stage must not be imported into the inference client.

`export.py` expects `inputs`, `calls`, `check-a`, `check-b`, `evaluation/evaluation.json` and `baseline-verification.json` under its isolated work directory. It reproduces diagrams from the literal boxes without adjustment. The supplied diagrams are sufficient to review the result without native CAD dependencies.

## What the tests do not prove

The two synthetic layouts test extraction without board-name rules; the synthetic PnP test checks held-out rejection and non-use of held-out observations to choose a model. Neither proves visual recognition of another real board. No real case reached pose validation. Source-line existence is checked, but document entailment and projected-mask identity validation are not completed stages in this failed experiment.
