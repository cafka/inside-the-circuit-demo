"""Read every object reachable from every local Git ref. Never print candidate secrets."""
import subprocess,json,re,hashlib,sys,time
from pathlib import Path
start=time.perf_counter();out=Path(sys.argv[1]);out.parent.mkdir(parents=True,exist_ok=True)
run=lambda args:subprocess.check_output(['git',*args])
lines=run(['rev-list','--objects','--all']).decode().splitlines();paths={x.split(' ',1)[0]:x.split(' ',1)[1] for x in lines if ' ' in x}
objects=[x.split(' ',1)[0] for x in lines]
patterns={
 'private_key':rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
 'google_api_key':rb'AIza[0-9A-Za-z_-]{35}',
 'google_oauth':rb'ya29\.[A-Za-z0-9_-]{40,}',
 'github_token':rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,})',
 'service_account':rb'"type"\s*:\s*"service_account"',
 'aws_access_id':rb'AKIA[A-Z0-9]{16}',
 'jwt':rb'eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}'
}
proc=subprocess.Popen(['git','cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE);findings=[];media=[];private_paths=[];counts={};total=0
for sha in objects:
 proc.stdin.write((sha+'\n').encode());proc.stdin.flush();header=proc.stdout.readline().decode().split()
 if len(header)!=3:raise RuntimeError('unreadable_git_object:'+sha)
 oid,kind,size=header;size=int(size);data=proc.stdout.read(size);proc.stdout.read(1);counts[kind]=counts.get(kind,0)+1;total+=size
 if len(data)!=size:raise RuntimeError('short_git_object')
 if kind not in ['blob','commit']:continue
 name=paths.get(sha,'<commit>')
 for label,pattern in patterns.items():
  matches=list(re.finditer(pattern,data))
  if matches:findings.append({'kind':label,'object':sha,'path':name,'count':len(matches),'fingerprints':[hashlib.sha256(m.group()).hexdigest()[:16] for m in matches]})
 if kind=='blob' and re.search(rb'(?:C:\\\\?Users\\\\?|/Users/|/home/)[A-Za-z][A-Za-z0-9_.-]+',data):private_paths.append({'object':sha,'path':name})
 if kind=='blob' and re.search(r'\.(png|jpe?g|webp|mp4|pdf|glb|stl|step|zip|woff2?)$',name,re.I):media.append({'object':sha,'path':name,'bytes':size})
proc.stdin.close();proc.wait()
authors=run(['log','--all','--format=%ae%n%ce']).decode().splitlines();personal=[a for a in set(authors) if a and not a.endswith('@users.noreply.github.com')]
result={'scope':'all objects reachable from all refs, including old blobs and commit metadata','refs':len(run(['for-each-ref','--format=%(refname)']).splitlines()),'objectCounts':counts,'bytesScanned':total,'candidateSecrets':findings,'machinePaths':private_paths,'mediaRequiringLicenseReview':media,'nonNoreplyEmailFingerprints':[hashlib.sha256(a.encode()).hexdigest()[:16] for a in personal],'durationSeconds':time.perf_counter()-start,'limitations':['Pattern scan is not proof of absence of every secret. Candidate hits require classification.','Unreachable/reflog-only objects and remote hidden refs are outside this Git export scope.','Rights require source/license review, not a file extension heuristic.']}
out.write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps({'objects':counts,'bytes':total,'candidates':len(findings),'machinePathObjects':len(private_paths),'mediaObjects':len(media),'nonNoreplyEmails':len(personal),'seconds':result['durationSeconds']}))
