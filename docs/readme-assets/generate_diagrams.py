"""Regenerate bilingual README diagrams. Python 3, standard library only."""
from pathlib import Path
from html import escape
OUT=Path(__file__).resolve().parent
BG='#142132'; PANEL='#1e3045'; BLUE='#284a70'; GREEN='#23564f'; GOLD='#eac46e'; TEXT='#f3f7ff'; MUTED='#c0d0e3'; LINE='#8aa9c8'
class Diagram:
 def __init__(self,w,h,title,sub):
  self.w=w;self.h=h;self.title=title;self.a=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-labelledby="title desc"><title id="title">{escape(title)}</title><desc id="desc">{escape(sub)}</desc><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#101c2d"/><stop offset="1" stop-color="#203247"/></linearGradient><marker id="arr" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="{LINE}"/></marker></defs><rect width="{w}" height="{h}" rx="26" fill="url(#bg)"/>']
  self.text(36,42,'INSIDE THE CIRCUIT',14,GOLD,'start',700,2.1);self.text(36,82,title,31,TEXT,'start',700);self.text(36,111,sub,17,MUTED,'start')
 def text(self,x,y,t,size=19,color=TEXT,anchor='middle',weight=400,spacing=0):
  self.a.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="Arial, Helvetica, sans-serif" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" letter-spacing="{spacing}">{escape(t)}</text>')
 def box(self,x,y,w,h,title,lines=(),fill=PANEL,stroke='#47617e',tag=None):
  self.a.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')
  if tag:self.text(x+17,y+23,tag,13,GOLD,'start',700,1)
  n=len(lines); total=24+n*23; start=y+(h-total)/2+20+(8 if tag else 0)
  self.text(x+w/2,start,title,21,TEXT,'middle',700)
  for i,l in enumerate(lines):self.text(x+w/2,start+27+i*23,l,17,MUTED)
 def arrow(self,d,label=None,x=None,y=None,dash=False):
  self.a.append(f'<path d="{d}" fill="none" stroke="{LINE}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" {"stroke-dasharray=\"7 6\"" if dash else ""} marker-end="url(#arr)"/>')
  if label:self.text(x,y,label,15,GOLD,'middle',700)
 def foot(self,t):self.text(36,self.h-23,t,14,MUTED,'start')
 def save(self,name): (OUT/name).write_text('\n'.join(self.a+['</svg>']),encoding='utf-8')

def user(lang):
 es=lang=='es'; T=lambda a,b:a if es else b
 d=Diagram(1000,735,T('De la curiosidad a la práctica','From curiosity to hands-on learning'),T('Dos entradas, una experiencia educativa conectada.','Two entry points, one connected learning experience.'))
 d.box(320,142,360,72,'Inside the Circuit',fill=BLUE)
 d.arrow('M500 214 V235 H260 V253');d.arrow('M500 235 H740 V253')
 d.box(40,255,440,100,T('Descubrir una placa','Discover a board'),[T('Cámara, fotografía o nombre','Camera, photo or board name')],BLUE,tag='01')
 d.box(520,255,440,100,T('Abrir la biblioteca','Open the library'),[T('Elegir un libro interactivo','Choose an interactive book')],GREEN,tag='01')
 d.arrow('M260 355 V380');d.arrow('M740 355 V380')
 d.box(40,382,440,105,T('Explorar y comprender','Explore and understand'),[T('Coral: modelo, componentes y fichas','Coral: model, components and cards'),T('Rotar, seleccionar y consultar fuentes','Rotate, select and consult sources')],BLUE,tag='02')
 d.box(520,382,440,105,T('Experimentar con Coral','Experiment with Coral'),[T('Libro 3D: cámara, modelo y LED','3D book: camera, model and LED'),T('Simulación didáctica de presencia','Educational presence simulation')],GREEN,tag='02')
 d.arrow('M480 434 H518',dash=True)
 d.arrow('M260 487 V525 H500 V550');d.arrow('M740 487 V525 H500 V550')
 d.box(200,552,600,115,T('Crear proyectos propios','Create your own projects'),[T('Comprender la electrónica y aplicar lo aprendido','Understand electronics and apply what you learn')],PANEL,tag='03')
 d.foot(T('El acceso directo al libro compatible forma parte de la integración prevista.','Direct access to the matching book is part of the planned integration.'))
 d.save(f'user-journey-{lang}.svg')

def arch(lang):
 es=lang=='es';T=lambda a,b:a if es else b
 d=Diagram(1160,1370,T('Arquitectura y funcionamiento','Architecture and data flow'),T('Identificación híbrida, incorporación automática y exploración educativa.','Hybrid identification, automated onboarding and educational exploration.'))
 d.box(40,140,520,75,T('Cámara o fotografía','Camera or photograph'),fill=BLUE)
 d.box(600,140,520,75,T('Nombre de la placa','Board name'),fill=GREEN)
 d.arrow('M300 215 V241');d.arrow('M860 215 V241')
 d.box(40,243,520,150,T('Identificación visual','Visual identification'),[T('Firebase AI Logic + App Check','Firebase AI Logic + App Check'),T('Nano si es compatible; Cloud como alternativa','Nano if supported; Cloud as fallback'),T('Procesamiento remoto autorizado','Authorized remote processing')],BLUE)
 d.box(600,243,520,150,T('Identificación documental','Document-based identification'),[T('Normalizar nombre y consultar catálogo','Normalize name and check catalog'),T('Buscar fuentes oficiales si es necesario','Search official sources if needed'),T('Sin inferencia inicial obligatoria','No mandatory initial AI inference')],GREEN)
 d.arrow('M300 393 V415 H580 V436');d.arrow('M860 393 V415 H580 V436')
 d.box(350,438,460,80,T('Identidad de la placa','Board identity'),[T('Fabricante · modelo · revisión si se conoce','Manufacturer · model · revision if known')])
 d.arrow('M580 518 V542');d.box(350,544,460,74,T('¿Existe en el catálogo?','Already in the catalog?'))
 d.arrow('M350 581 H175 V650',T('Sí','Yes'),235,570);d.arrow('M765 618 V650',T('No','No'),799,638)
 d.box(40,652,270,105,T('Recuperar','Retrieve'),[T('Modelo y fichas','Model and cards'),T('Sin regenerar','No regeneration')],PANEL)
 d.box(350,652,770,105,T('Incorporación automática','Automated onboarding'),[T('Fuentes oficiales: CAD, imágenes, esquemas y dimensiones','Official sources: CAD, images, schematics and dimensions')],PANEL)
 d.arrow('M735 757 V781 H535 V804');d.arrow('M735 781 H935 V804')
 d.box(350,806,370,133,T('Con CAD','With CAD'),[T('Conversión STEP → GLB','STEP → GLB conversion'),T('Registro ECAD / MCAD','ECAD / MCAD registration'),T('Materiales y asociaciones','Materials and associations')],BLUE)
 d.box(750,806,370,133,T('Sin CAD','Without CAD'),[T('Gemini multimodal','Multimodal Gemini'),T('Escalado y geometría propia','Scaling and custom geometry'),T('Volúmenes o superficies','Volumes or surfaces')],GREEN)
 d.arrow('M535 939 V958 H735 V979');d.arrow('M935 939 V958 H735 V979')
 d.box(350,981,770,94,T('Motor educativo y persistencia','Educational engine and persistence'),[T('Fichas ES/EN · modelos · fuentes · incertidumbre','ES/EN cards · models · sources · uncertainty')])
 d.arrow('M735 1075 V1100');d.arrow('M175 757 V1148 H348')
 d.box(350,1102,770,92,T('Explorador interactivo · Three.js','Interactive explorer · Three.js'),[T('Rotación, selección, resaltado y fichas','Rotation, selection, highlighting and cards')],BLUE)
 d.arrow('M40 177 H20 V1248 H38',dash=True)
 d.arrow('M350 1148 H327 V1248 H318',dash=True)
 d.box(40,1204,280,116,T('Imagen física','Physical image'),[T('Localización y contornos','Localization and outlines'),T('Flujo visual experimental','Experimental visual flow')])
 d.arrow('M735 1194 V1221',dash=True)
 d.box(350,1223,770,97,T('Biblioteca educativa independiente','Independent educational library'),[T('Libros y simulaciones · acceso directo previsto','Books and simulations · planned direct access')],GREEN)
 d.foot(T('Líneas discontinuas: flujos experimentales o integración pendiente de validación.','Dashed lines: experimental flows or integration awaiting validation.'))
 d.save(f'architecture-{lang}.svg')

def recon(lang):
 es=lang=='es';T=lambda a,b:a if es else b
 d=Diagram(1000,1100,T('Reconstrucción educativa sin CAD','Educational reconstruction without CAD'),T('De las fuentes oficiales a un modelo según la evidencia disponible.','From official sources to a model based on available evidence.'))
 d.box(40,140,920,86,T('Fuentes oficiales','Official sources'),[T('Fotografías · esquema eléctrico · dibujo dimensional','Photographs · schematic · dimensional drawing')])
 d.arrow('M500 226 V249')
 d.box(40,251,920,90,T('Gemini: interpretación multimodal','Gemini: multimodal interpretation'),[T('Regiones, formas, identidad propuesta y fichas bilingües','Regions, shapes, proposed identity and bilingual cards')],BLUE)
 d.arrow('M500 341 V364')
 d.box(40,366,920,90,T('Algoritmos propios: geometría','Custom algorithms: geometry'),[T('Validar polígonos · rectificar · escalar a medidas físicas','Validate polygons · rectify · scale to physical dimensions')],GREEN)
 d.arrow('M500 456 V479')
 d.box(170,481,660,78,T('¿Altura respaldada para esta pieza?','Supported height for this part?'),[T('Comprobar evidencia independiente','Check independent evidence')])
 d.arrow('M500 559 V583 H260 V610',T('Sí','Yes'),260,576);d.arrow('M500 583 H740 V610',T('No','No'),740,576)
 d.box(40,612,440,145,T('Generar volumen','Generate volume'),[T('Extrusión de envolvente','Envelope extrusion'),T('Cotas documentadas o medidas','Documented or measured dimensions'),T('Validación integral pendiente','End-to-end validation pending')],GREEN)
 d.box(520,612,440,145,T('Conservar superficie','Retain surface'),[T('Textura y región seleccionable','Texture and selectable region'),T('Relieve ilustrativo, no medido','Illustrative relief, not measured'),T('Motor 2040: 13 regiones','Motor 2040: 13 regions')],PANEL,stroke='#aa8953')
 d.arrow('M260 757 V782 H500 V808');d.arrow('M740 757 V782 H500 V808')
 d.box(40,810,920,91,T('Generación y persistencia','Generation and persistence'),[T('Mallas individuales · texturas · materiales · GLB','Individual meshes · textures · materials · GLB')],GREEN)
 d.arrow('M500 901 V925')
 d.box(40,927,920,105,T('Representación educativa interactiva','Interactive educational representation'),[T('Rotación · zoom manual · selección · fichas ES/EN','Rotation · manual zoom · selection · ES/EN cards'),T('Volúmenes y superficies pueden coexistir','Volumes and surfaces can coexist')],BLUE)
 d.foot(T('La reconstrucción educativa no equivale a CAD de fabricación.','Educational reconstruction is not manufacturing CAD.'))
 d.save(f'reconstruction-{lang}.svg')

def scenarios(lang):
 es=lang=='es';T=lambda a,b:a if es else b
 d=Diagram(1200,610,T('Tres escenarios, un mismo explorador','Three scenarios, one explorer'),T('La geometría se adapta a la evidencia disponible, sin inventar dimensiones.','Geometry adapts to the available evidence without inventing dimensions.'))
 for i,(title,lines,fill,tag) in enumerate([
  (T('CAD disponible','CAD available'),[T('Google Coral Dev Board Micro','Google Coral Dev Board Micro'),T('STEP + diseño eléctrico','STEP + electrical design')],BLUE,T('A · DEMOSTRADO','A · DEMONSTRATED')),
  (T('Sin CAD, con cotas','No CAD, with dimensions'),[T('Ejemplo geométrico ilustrativo','Illustrative geometry example'),T('Regiones + alturas respaldadas','Regions + supported heights')],GREEN,T('B · POR VALIDAR','B · TO BE VALIDATED')),
  (T('Sin CAD, sin alturas','No CAD, no heights'),[T('Pimoroni Motor 2040','Pimoroni Motor 2040'),T('Fotografías + dimensiones XY','Photographs + XY dimensions')],PANEL,T('C · DEMOSTRADO PARCIAL','C · PARTIALLY DEMONSTRATED'))]):
  x=30+i*390
  d.box(x,145,360,120,title,lines,fill,tag=tag)
  d.arrow(f'M{x+180} 265 V291')
  # Schematic, not a render or an actual board measurement.
  cx=x+180; y=306
  d.a.append(f'<g transform="translate({cx-112} {y})"><path d="M0 48 L152 14 L224 62 L72 96 Z" fill="#397b66" stroke="#a1c5b6" stroke-width="1.5"/>')
  if i<2:
   d.a.append('<path d="M0 48 V55 L72 103 L224 69 V62 L72 96 Z" fill="#214b41" stroke="#81a89d"/>')
  for px,py,w,h in [(45,44,40,24),(112,30,34,22),(120,59,40,22)]:
   z=0 if i==2 else (18 if i==0 else 13)
   d.a.append(f'<path d="M{px} {py-z} l{w} -9 l{h} 15 l{-w} 9 Z" fill="{["#b8c9d9","#78a9d4","#c3ad70"][i]}" stroke="#e6e9ed"/>')
   if z:d.a.append(f'<path d="M{px} {py-z} v{z} l{h} 15 v{-z} Z M{px+h} {py-z+15} v{z} l{w} -9 v{-z} Z" fill="#344c61" stroke="#a8bfd2"/>')
  d.a.append('</g>')
  d.arrow(f'M{x+180} 420 V441')
  labels=[(T('Convertir y enriquecer','Convert and enrich'),[T('Geometría CAD + fichas','CAD geometry + cards')]),(T('Construir volúmenes','Construct volumes'),[T('Envolventes con cotas','Dimensioned envelopes')]),(T('Superficies interactivas','Interactive surfaces'),[T('Texturas y 13 regiones','Textures and 13 regions')])]
  d.box(x,443,360,92,labels[i][0],labels[i][1],fill)
 d.foot(T('Esquemas ilustrativos, no capturas. El escenario B aún no tiene una placa real validada.','Illustrative schematics, not screenshots. Scenario B has no validated real-board example yet.'))
 d.save(f'three-scenarios-{lang}.svg')

def deployment(lang):
 es=lang=='es';T=lambda a,b:a if es else b
 d=Diagram(1000,650,T('Despliegue e integración','Deployment and integration'),T('Arquitectura prevista para pruebas desde el teléfono.','Target architecture for mobile testing.'))
 d.box(40,140,440,95,T('Desarrollo privado · Codex','Private development · Codex'),['inside-the-circuit'],BLUE)
 d.box(520,140,440,95,T('Desarrollo privado · Kiro','Private development · Kiro'),['raspberry-pi-interactive-book'],GREEN)
 d.arrow('M260 235 V261');d.arrow('M740 235 V261')
 d.box(40,263,440,95,T('Distribución de la aplicación','Application distribution'),[T('Código autorizado y recursos de ejecución','Authorized code and runtime assets')],BLUE)
 d.box(520,263,440,95,T('Biblioteca publicada','Published library'),['interactive-electronics-books'],GREEN)
 d.arrow('M260 358 V385 H500 V407');d.arrow('M740 358 V385 H500 V407')
 d.box(160,409,680,105,T('Frontend HTTPS + backend Cloud','HTTPS frontend + Cloud backend'),[T('Node.js / Python · catálogo · Firebase AI Logic','Node.js / Python · catalog · Firebase AI Logic'),T('Gemini Cloud cuando Nano no está disponible','Gemini Cloud when Nano is unavailable')])
 d.arrow('M500 514 V541');d.box(250,543,500,64,T('Teléfono · cámara · explorador · biblioteca','Phone · camera · explorer · library'),fill=BLUE)
 d.foot(T('VM temporal para medir rendimiento; infraestructura persistente por definir.','Temporary benchmark VM; persistent infrastructure to be determined.'))
 d.save(f'deployment-{lang}.svg')

if __name__=='__main__':
 for lang in ('en','es'):
  user(lang);arch(lang);recon(lang);scenarios(lang);deployment(lang)
