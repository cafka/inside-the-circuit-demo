"""Generate source-backed surface layers after independently checked ECAD registration.
Original GLB and component transforms stay untouched; verified source data may supply a separate substrate supplement.
"""
import importlib.util,json,sys,math,hashlib,time,collections,io
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageOps
spec=importlib.util.spec_from_file_location('reg',Path(__file__).with_name('register-ecad.py'));reg=importlib.util.module_from_spec(spec);spec.loader.exec_module(reg)
spec=importlib.util.spec_from_file_location('named_reg',Path(__file__).with_name('register-named-ecad.py'));named=importlib.util.module_from_spec(spec);spec.loader.exec_module(named)
sha=lambda data:hashlib.sha256(data).hexdigest()
enrichment_policy=json.loads(Path(__file__).with_name('enrichment-policy.json').read_text())
def observed_colour(images,aspect):
 """Conservative chromatic-region proposal, not material composition or a calibrated colour."""
 candidates=[]
 for item in images:
  if any(k in item['url'].lower() for k in ['callout','pinout','diagram','preview','icon','ide-','serial-pins']):continue
  try:
   im=Image.open(item['path']).convert('RGB');im.thumbnail((320,320));a=np.array(im);hsv=np.array(im.convert('HSV'));h=hsv[:,:,0];s=hsv[:,:,1];v=hsv[:,:,2]
   allY,allX=np.where((s>65)&(v>35)&(v<240))
   if not len(allX):continue
   referenceExtent=np.maximum([np.ptp(allX),np.ptp(allY)],1)
   for bin in range(24):
    delta=np.minimum(abs(h.astype(int)-bin*11),256-abs(h.astype(int)-bin*11))
    mask=(delta<17)&(s>65)&(v>35)&(v<240);ys,xs=np.where(mask)
    if len(xs)<max(100,a.shape[0]*a.shape[1]*.008):continue
    # Robust bounds discount isolated similarly coloured pixels.
    x0,x1=np.percentile(xs,[2,98]);y0,y1=np.percentile(ys,[2,98]);size=sorted([x1-x0+1,y1-y0+1]);ratio=size[1]/size[0];error=abs(math.log(ratio/aspect))
    extent=np.array([x1-x0,y1-y0])/referenceExtent
    if min(extent)<enrichment_policy['colourMinimumExtentFraction']:continue
    fill=len(xs)/((x1-x0+1)*(y1-y0+1));score=fill*math.exp(-4*error)
    if fill>.20 and error<.25:candidates.append(dict(rgb=(np.median(a[mask],axis=0)/255).tolist(),score=score,pixels=int(mask.sum()),url=item['url'],sha256=item['sha256'],sourceKind=item.get('sourceKind','raster_reference'),boundsThumbnail=[float(x0),float(y0),float(x1),float(y1)],hueBin=bin))
  except (OSError,ValueError):continue
 candidates.sort(key=lambda p:p['score'],reverse=True)
 return dict(status='observed_visual_approximation' if candidates else 'undetermined',selected=candidates[0] if candidates else None,candidates=candidates[:6],composition='not_inferred',method='chromatic_region_extent_and_board_aspect; not colour-calibrated or a photograph-to-CAD registration')

def prepare(archive,model,out,images):
 start=time.perf_counter();out.mkdir(parents=True,exist_ok=True);data=reg.ec.read_ecad(archive);nodes=reg.ec.read_glb(model);registration=named.register(data,nodes)
 result=dict(schema='automatic-board-surfaces/1',ecadSHA256=data['sha256'],registration=registration,files=[],limitations=[])
 (out/'ecad-geometry.json').write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
 if registration['status']!='verified':result['status']='blocked';return result
 board=next(n for n in nodes if n['index']==registration['boardNode']);normal=registration['normal'];transform=np.array(registration['transform']);top=registration['topSign'];thickness=registration['thickness'];outline=np.array(data['outline']);lo=outline.min(0);hi=outline.max(0);size=hi-lo;scale=reg.policy['textureLongSide']/max(size);dims=tuple(np.ceil(size*scale).astype(int));xy=lambda p:((p[0]-lo[0])*scale,(hi[1]-p[1])*scale)
 result['appearance']=observed_colour(images,max(size)/min(size));result['boardNode']=board['index'];result['baseGLBSHA256']=sha(Path(model).read_bytes())
 # Generate physical detail only from verified dimensional source records.
 # Failure leaves the authentic CAD available and is retained in the audit.
 try:
  spec=importlib.util.spec_from_file_location('physical',Path(__file__).with_name('prepare-physical-details.py'));physical=importlib.util.module_from_spec(spec);spec.loader.exec_module(physical)
  result['presentationGeometry']=physical.build(data,registration,model,out,result['appearance'])
 except Exception as error:result['presentationGeometry']=dict(status='blocked',reason=type(error).__name__+': '+str(error))
 detailed=result['presentationGeometry'].get('status')=='source_ecad_supplement'
 # Rasterize the actual CAD board triangles on the two physical faces. This
 # preserves rounded outlines, mounting holes and cut-outs without reconstructing them.
 inverse=np.linalg.pinv(transform[:,:2]);world=board['points'];ecpoints=(world-transform[:,2])@inverse.T
 masks={}
 for side,layer,z in [('top',33,0),('bottom',34,-thickness)]:
  height=transform[normal,2]+top*z;mask=Image.new('L',dims);draw=ImageDraw.Draw(mask)
  for tri in board['triangles']:
   if np.max(abs(world[tri,normal]-height))<.002:draw.polygon([xy(ecpoints[i]) for i in tri],fill=255)
  if detailed:
   for pad in data['pads']:
    if pad['hole']>0 and pad['layer']==74:
     x,y=xy(pad['center']);r=pad['hole']*scale/2;draw.ellipse([x-r,y-r,x+r,y+r],fill=0)
  masks[side]=mask
 ink_count=0;contact_count=0;texts=[];fonts=reg.ec.embedded_fonts(archive)
 for side,layer,z in [('top',33,0),('bottom',34,-thickness)]:
  ink=Image.new('RGBA',dims);draw=ImageDraw.Draw(ink)
  for item in data['regions']:
   if item['layer']!=layer:continue
   overlay=Image.new('RGBA',dims);d=ImageDraw.Draw(overlay);d.polygon([xy(p) for p in item['contours'][0]],fill='white')
   for hole in item['contours'][1:]:d.polygon([xy(p) for p in hole],fill=(0,0,0,0))
   ink.alpha_composite(overlay);ink_count+=1
  for item in data['tracks']:
   if item['layer']==layer:draw.line([xy(item['start']),xy(item['end'])],fill='white',width=max(1,round(item['width']*scale)));ink_count+=1
  for item in data['arcs']:
   if item['layer']!=layer:continue
   end=item['end'];end=end+360 if end<=item['start'] else end
   points=[[item['center'][0]+item['radius']*math.cos(math.radians(t)),item['center'][1]+item['radius']*math.sin(math.radians(t))] for t in np.linspace(item['start'],end,max(10,round((end-item['start'])/3)))]
   draw.line([xy(p) for p in points],fill='white',width=max(1,round(item['width']*scale)));ink_count+=1
  for item in data['texts']:
   text=item['text'].strip()
   if item['layer']!=layer or not text or any(ord(c)<32 or ord(c)>126 for c in text):continue
   height=max(2,round(item['height']*scale));fontSource=fonts.get(item['font'])
   try:font=ImageFont.truetype(io.BytesIO(fontSource) if fontSource else 'arial.ttf',max(4,height))
   except OSError:font=ImageFont.load_default(size=max(4,height))
   bounds=font.getbbox(text);tile=Image.new('RGBA',(max(1,bounds[2]-bounds[0]),max(1,bounds[3]-bounds[1])));ImageDraw.Draw(tile).text((-bounds[0],-bounds[1]),text,font=font,fill='white')
   if item['fontType']==0:tile=tile.resize((max(1,round(tile.width*height/tile.height)),height),Image.Resampling.LANCZOS)
   elif item.get('textBoundsMm') and min(item['textBoundsMm'])>0:
    # Altium records the rendered text extent separately from nominal font height.
    # Preserve those extents instead of assuming that em size equals glyph size.
    tile=tile.resize(tuple(max(1,round(n*scale)) for n in item['textBoundsMm']),Image.Resampling.LANCZOS)
   # Coordinates specify bottom-left baseline extent; rotate around that origin.
   if item['mirrored']:tile=ImageOps.mirror(tile)
   angle=item['rotation']%360;offset=np.array([(-1 if item['mirrored'] else 1)*tile.width/2,tile.height/2]);tile=tile.rotate(angle,expand=True,resample=Image.Resampling.BICUBIC);anchor=np.array(xy(item['center']));rad=math.radians(angle);offset=np.array([math.cos(rad)*offset[0]-math.sin(rad)*offset[1],-(math.sin(rad)*offset[0]+math.cos(rad)*offset[1])]);center=anchor+offset
   ink.alpha_composite(tile,(round(center[0]-tile.width/2),round(center[1]-tile.height/2)));texts.append(dict(text=text,side=side,centerMm=item['center'],heightMm=item['height'],rotation=angle,mirrored=item['mirrored'],font=item['font'],fontSubstitution=item['fontType']!=1 or not bool(fontSource),fontSHA256=sha(fontSource) if fontSource else None))
  contacts=Image.new('RGBA',dims);cd=ImageDraw.Draw(contacts)
  for p in data['pads']:
   if p['layer'] not in ([1,74] if side=='top' else [32,74]):continue
   if detailed and p['hole']>0 and p['layer']==74:continue # Source 3D terminals already supply these surfaces.
   if p['shape'] not in [1,2]:continue
   w,h=p['size'];cx,cy=p['center'];n=40 if p['shape']==1 else 4
   if p['shape']==1:
    radius=min(w,h)/2;offset=abs(w-h)/2
    points=[(radius*math.cos(t)+(offset if math.cos(t)>=0 else -offset),radius*math.sin(t)) for t in np.linspace(0,2*math.pi,n)]
    if h>w:points=[(-y,x) for x,y in points]
   else:points=[(-w/2,-h/2),(w/2,-h/2),(w/2,h/2),(-w/2,h/2)]
   a=math.radians(p['rotation']);points=[(cx+x*math.cos(a)-y*math.sin(a),cy+x*math.sin(a)+y*math.cos(a)) for x,y in points]
   cd.polygon([xy(p) for p in points],fill=(200,190,145,255) if p['hole'] else (190,193,195,255))
   if p['hole']>0:
    rr=p['hole']/2;x,y=xy([cx,cy]);cd.ellipse([x-rr*scale,y-rr*scale,x+rr*scale,y+rr*scale],fill=(0,0,0,0))
   contact_count+=1
  # Occlude SMT copper under actual mechanical parts, not a guessed footprint.
  for n in nodes:
   if n['index']==board['index']:continue
   heights=(np.array([n['min'][normal],n['max'][normal]])-transform[normal,2])*top
   if (side=='top' and max(heights)<=.002) or (side=='bottom' and min(heights)>=-thickness-.002):continue
   pts=(n['points']-transform[:,2])@inverse.T
   for tri in n['triangles']:cd.polygon([xy(pts[i]) for i in tri],fill=(0,0,0,0))
  for kind,im in [('silk',ink),('contacts',contacts)]:
   alpha=np.array(im.getchannel('A'));alpha=np.minimum(alpha,np.array(masks[side]));im.putalpha(Image.fromarray(alpha));file=out/(side+'-'+kind+'.png');im.save(file,optimize=True)
   corners=np.c_[[[lo[0],lo[1]],[hi[0],lo[1]],[hi[0],hi[1]],[lo[0],hi[1]]],np.ones(4)]@transform.T;corners[:,normal]+=top*(z+(reg.policy['renderOffset'] if side=='top' else -reg.policy['renderOffset']))
   norm=[0,0,0];norm[normal]=top*(1 if side=='top' else -1)
   result['files'].append(dict(file=file.name,sha256=sha(file.read_bytes()),bytes=file.stat().st_size,corners=(corners/1000).tolist(),normal=norm,side=side,kind=kind,material=dict(metalness=1 if kind=='contacts' else 0,roughness=.32 if kind=='contacts' else .78)))
 result.update(status='partial',details=dict(inkPrimitives=ink_count,sourceTextLabels=len(texts),contactSurfaces=contact_count,drillPads=sum(p['hole']>0 for p in data['pads']),fontsRecovered=[dict(family=k,sha256=sha(v)) for k,v in fonts.items()],substitutedLabels=sum(t['fontSubstitution'] for t in texts),texts=texts),limitations=['Embedded TrueType fonts recovered locally; stroke-font records use an explicit system-font substitution. No fonts are served or published.','Surface layers retain the original CAD mask; a separate substrate supplement is used only when source drills, outline and rigid alignment are supported. Component geometry is unchanged.','Contact colours and roughness are presentation approximations, not alloy measurements.','Official reference colour is an automatic region proposal, not a calibrated material measurement.'],totalMs=(time.perf_counter()-start)*1000)
 return result
if __name__=='__main__':
 archive,model,out,images=sys.argv[1:5];out=Path(out);result=prepare(archive,model,out,json.loads(Path(images).read_text(encoding='utf-8')));(out/'surfaces.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in result.items() if k not in ['registration','details','files','appearance']}))
