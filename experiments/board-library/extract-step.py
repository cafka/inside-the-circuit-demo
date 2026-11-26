import zipfile,sys,hashlib,json
from pathlib import Path
archive,member,output,expected=sys.argv[1:]
with zipfile.ZipFile(archive) as z:
    matches=[i for i in z.infolist() if i.filename==member]
    assert len(matches)==1,'step_member_missing_or_ambiguous'
    assert matches[0].file_size<=256*1024*1024,'expanded_size_limit'
    data=z.read(matches[0]);actual=hashlib.sha256(data).hexdigest()
    assert actual==expected,'step_hash_mismatch'
    Path(output).write_bytes(data)
print(json.dumps({'sourceSHA256':actual,'bytes':len(data)}))
