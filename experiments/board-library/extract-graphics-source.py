"""Extract one STEP from an observed source; never use archive names as paths."""
import sys,json,hashlib,zipfile
from pathlib import Path
source,out,limit=sys.argv[1:];source=Path(source);out=Path(out);limit=int(limit)
raw=source.read_bytes();member=None;licenses=[]
if zipfile.is_zipfile(source):
 with zipfile.ZipFile(source) as z:
  candidates=[i for i in z.infolist() if i.filename.lower().endswith(('.step','.stp')) and not i.is_dir()]
  if len(candidates)!=1:raise ValueError('graphics_step_member_missing_or_ambiguous')
  item=candidates[0]
  if item.file_size>limit:raise ValueError('expanded_step_size_limit')
  raw=z.read(item);member=item.filename
  for i in z.infolist():
   if Path(i.filename).name.lower().startswith(('license','copying','notice')) and i.file_size<100000:licenses.append({'member':i.filename,'text':z.read(i).decode('utf-8',errors='replace')})
if len(raw)>limit or b'ISO-10303-21' not in raw[:200]:raise ValueError('not_supported_step')
out.write_bytes(raw)
report={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'member':member,'licenses':licenses}
out.with_suffix('.source.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k!='licenses'}))
