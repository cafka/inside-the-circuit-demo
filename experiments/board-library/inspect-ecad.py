"""Reuse the existing read-only CFB reader, without any board recipe or coordinates."""
import importlib.util, json, sys, zipfile, hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('pcb_reader',Path(__file__).with_name('extract-pcb-presentation.py'))
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
archive,output=map(Path,sys.argv[1:3])
with zipfile.ZipFile(archive) as z:
    files=[i for i in z.infolist() if i.filename.lower().endswith('.pcbdoc')]
    assert len(files)==1, 'pcb_document_missing_or_ambiguous'
    assert files[0].file_size<=64*1024*1024, 'pcb_document_size_limit'
    data=z.read(files[0]); streams=reader.streams(data)
    components=reader.properties(streams['/Components6/Data'])
    # Do not publish author workstation paths or internal database credentials.
    allowed=['SOURCEDESIGNATOR','SOURCEDESCRIPTION','PATTERN','LAYER','HEIGHT','X','Y','ROTATION','SOURCELIBREFERENCE']
    result={'adapter':'existing-altium-cfb-properties/1','member':files[0].filename,'sha256':hashlib.sha256(data).hexdigest(),
            'components':[{k:c.get(k) for k in allowed} for c in components],
            'availableStreams':sorted(k for k in streams if k.endswith('/Data')),
            'geometryFrameStatus':'not_correlated_with_step',
            'appearanceStatus':'not_reconstructed_without_verified_frame_and_layer_contract'}
output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
