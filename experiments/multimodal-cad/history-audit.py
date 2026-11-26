"""Export only observable tool events and model metadata; never reasoning messages.
The original session logs remain private and are not copied into the repository.
"""
import json,hashlib,sys,re
from pathlib import Path
source=Path(sys.argv[1]);out=Path(sys.argv[2]);rows=[];model=None
windows=[('2026-11-23T22:55','2026-11-23T23:37'),('2026-11-26T09:58','2026-11-26T10:12')]
for number,line in enumerate(source.open(encoding='utf8'),1):
    data=json.loads(line);p=data.get('payload',{});t=data.get('timestamp','')
    if data.get('type')=='turn_context':model=p.get('model',model)
    if not any(a<=t<=b for a,b in windows):continue
    if data.get('type')!='response_item' or p.get('type') not in ['function_call','custom_tool_call']:continue
    args=p.get('arguments',p.get('input',''))
    if not isinstance(args,str):continue
    facts=[]
    for token,label in [('official-reference.png','official_reference_image_access'),('view_image','image_view_tool'),('step-audit.json','STEP_numeric_inventory'),('provenance.json','CAD_mesh_provenance'),('build-reviewed-data.py','writes_explicit_catalogue_decisions'),('getScreenshot','browser_screenshot'),('screenshot(','browser_screenshot'),('raspberrypi.com/products/raspberry-pi-5','manufacturer_product_page'),('source-binding.json','historical_reference_binding'),('components.json','component_registry'),('pi-ethernet-selected','Ethernet_selection_check'),('pi-ram-selected','RAM_selection_check'),('pi-usb-selected','USB_selection_check')]:
        if token in args:facts.append(label)
    if not facts:continue
    rows.append({'utc':t,'sourceLine':number,'tool':p.get('name'),'callId':p.get('call_id'),'modelFromTurnContext':model,'argumentSHA256':hashlib.sha256(args.encode()).hexdigest(),'observableEvents':facts})
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'schema':'tool-history-audit/1','scopeUTC':windows,'privateLogNotRedistributed':True,'reasoningMessagesReadOrExported':False,'events':rows,'limits':['Tool receipt proves an image was supplied, not which pixel justified each identity.','No independent human review or Gemini semantic association request found in the inspected decision windows.','No reconstruction of unrecorded reasoning.']},indent=2)+'\n',encoding='utf8')
print(json.dumps({'events':len(rows),'models':sorted(set(r['modelFromTurnContext'] for r in rows))}))
