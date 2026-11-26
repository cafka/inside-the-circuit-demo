"""Create a NEW history-free review candidate; never publish or alter the research repo."""
from pathlib import Path
import subprocess,sys,json,re,hashlib
root=Path(__file__).resolve().parents[1];dest=Path(sys.argv[1]).resolve()
if dest.exists():raise SystemExit('Destination must not exist; preserve previous candidates.')
if not dest.is_relative_to(root/'.local/release'):raise SystemExit('Candidate must stay inside .local/release.')
fixed=['LICENSE','THIRD_PARTY_NOTICES.md','README.md','README.es.md','.gitignore','.gitattributes','package.json','package-lock.json','requirements-release.txt','experiments/fixtures-manifest.json','experiments/cad-viewer/public/raspberry-pi-5.glb','experiments/cad-viewer/CAD_LICENSE.txt']
fixed += ['experiments/cad-viewer/metal-materials.mjs','experiments/cad-viewer/metal-profile.json','experiments/cad-viewer/metal-polished-profile.json']
trees=['src/identity','src/local','src/experimental/kiro','release/catalog','config','provenance','docs/readme-assets']
files=[root/p for p in fixed]
for p in trees:
 files += [f for f in (root/p).rglob('*') if f.is_file() and f.suffix not in ['.pyc'] and '.local.' not in f.name]
required_tests={'photo-onboarding-test.mjs','name-onboarding-test.mjs','selection-whole-policy-test.mjs'}
# Keep runtime generators and their policies; exclude superseded capture/benchmark campaigns.
excluded={'prepare-camera-fixture.py','prepare-finish-baseline.mjs','prepare-reconstruction-back.py','reconstruction-lab.py','reproduce-photo-reconstruction.mjs','compare-traces.mjs','trace-pixel-control.mjs','photo-onboarding-review.mjs','photo-onboarding-final-smoke.mjs','nano-education-mobile-timing.mjs','selection-fixed-gestures.mjs'}
files += [f for f in (root/'experiments/board-library').iterdir() if f.is_file() and f.suffix in ['.mjs','.py','.json','.html','.css','.txt'] and (f.name in required_tests or (not re.search(r'(?:test|baseline|regression|^export-|^render-)',f.name) and f.name not in excluded))]
files += [f for d in ['assets','locales'] for f in (root/'experiments/board-library'/d).rglob('*') if f.is_file()]
files += [root/p for p in ['release/catalog-manifest.json','scripts/restore-release-catalog.mjs','scripts/setup-release.mjs','scripts/audit-release-history.py','scripts/prepare-public-candidate.py','tests/release.test.mjs','tests/reconstruction.test.mjs','tests/helpers/identity.mjs','docs/ARCHITECTURE.md','docs/INSTALLATION.md','docs/RELEASE_RC1.md','docs/RELEASE_SECURITY_LICENSES.md','docs/LIBRARY_INTEGRATION.md','docs/HISTORY_INDEX.md']]
files += [f for f in (root/'release/evidence').rglob('*') if f.is_file()]
files += list((root/'tests').glob('release*.test.mjs'))
files += [root/'scripts/sync-library.mjs']
files += [f for f in [root/'docs/PUBLICATION_V4.md',root/'scripts/start-cloudshell-preview.mjs'] if f.exists()]
# No research screenshots, arbitrary .local data, notebooks or old Git objects.
rows=[];issues=[]
for f in sorted(set(files)):
 rel=f.relative_to(root);data=f.read_bytes()
 if f.suffix in ['.json','.md','.mjs','.py','.html','.css','.txt']:
  if re.search(rb'(?:C:\\\\?Users\\\\?|/Users/)[A-Za-z][A-Za-z0-9_.-]+',data):issues.append(str(rel)+':machine_path')
  if re.search(rb'AIza[0-9A-Za-z_-]{35}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}',data):issues.append(str(rel)+':credential_pattern')
 rows.append((rel,data))
if issues:raise SystemExit(json.dumps({'blocked':issues}))
dest.mkdir(parents=True)
for rel,data in rows:(dest/rel).parent.mkdir(parents=True,exist_ok=True);(dest/rel).write_bytes(data)
# The public package exposes only commands included in this reviewed distribution.
p=dest/'package.json';package=json.loads(p.read_text());package['scripts']={k:v for k,v in package['scripts'].items() if k in ['start','build','catalog:restore','library:sync','test:release']};package['scripts']['test']=package['scripts']['test:release'];p.write_text(json.dumps(package,indent=2),encoding='utf8')
dirty=bool(subprocess.check_output(['git','status','--porcelain'],cwd=root).strip())
receipt={'schema':'public-candidate/1','sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root).decode().strip(),'includesWorkingChanges':dirty,'historyIncluded':False,'published':False,'files':[{'path':str(p).replace('\\','/'),'sha256':hashlib.sha256((dest/p).read_bytes()).hexdigest(),'bytes':(dest/p).stat().st_size} for p,_ in rows]}
(dest/'PUBLIC_CANDIDATE.json').write_text(json.dumps(receipt,indent=2),encoding='utf8')
print(json.dumps({'files':len(rows),'bytes':sum(r['bytes'] for r in receipt['files']),'published':False}))
