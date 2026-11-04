from PIL import Image, ImageDraw, ImageFont
W,H = 1024, 700
ORO=(240,194,77); ORO2=(201,164,58); TXT=(236,240,242); MUT=(150,165,172)
FONDO=(9,14,17); PANEL=(16,25,30); CAJA=(11,18,22); LINEA=(45,62,70)
FB='/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'
FR='/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf'
f=lambda n,b=True: ImageFont.truetype(FB if b else FR, n)

base=Image.new('RGB',(W,H),FONDO); d=ImageDraw.Draw(base,'RGBA')

# --- escudo real de la PM, recortado del formato de bajas ---
src=Image.open('/home/claude/army-wasco/reportes/bajas/plantilla.png').convert('RGB')
badge=src.crop((8,4,146,118)).resize((112,92), Image.LANCZOS)

BANDA=118
d.rectangle([0,0,W,BANDA], fill=(13,21,26))
for i in range(BANDA):                       # degradado sutil hacia la derecha
    pass
d.rectangle([0,0,6,BANDA], fill=ORO)
base.paste(badge,(16,13))
d.text((146,20),'ARMY DE WASCO  ·  POLICÍA MILITAR', font=f(15), fill=ORO)
d.text((146,40),'REPORTE DE ACTIVIDAD', font=f(40), fill=TXT)
d.text((148,88),'DISCIPLINA  ★  LEALTAD  ★  PRESENCIA EN LA UNIDAD', font=f(13), fill=MUT)
d.rounded_rectangle([812,28,1000,92],9,fill=(10,17,21),outline=ORO2,width=2)
d.text((828,38),'INTEGRANTES EVALUADOS', font=f(11), fill=MUT)
d.line([(0,BANDA),(W,BANDA)], fill=ORO, width=3)

def panel(x,y,w,h,titulo):
    d.rounded_rectangle([x,y,x+w,y+h],12,fill=PANEL,outline=LINEA,width=2)
    d.rounded_rectangle([x,y,x+w,y+30],10,fill=CAJA); d.rectangle([x,y+20,x+w,y+30],fill=CAJA)
    d.line([(x+10,y+30),(x+w-10,y+30)],fill=(60,80,90),width=1)
    d.rectangle([x+12,y+10,x+15,y+23],fill=ORO)
    d.text((x+23,y+8),titulo,font=f(15),fill=ORO)

def etiqueta(x,y,t,w,h=34):
    d.text((x,y-16),t,font=f(12),fill=MUT)
    d.rounded_rectangle([x,y,x+w,y+h],7,fill=(10,17,21),outline=(52,70,79),width=1)

# ---- Datos del reporte ----
panel(16,132,992,96,'DATOS DEL REPORTE')
etiqueta(32,186,'FECHA (HORA DEL SERVIDOR)',200)
etiqueta(248,186,'PERIODO EVALUADO',250)
etiqueta(514,186,'QUIEN REPORTA',300)
etiqueta(830,186,'RANGO PM',162)

# ---- Actividad por integrante ----
panel(16,242,992,338,'ACTIVIDAD POR INTEGRANTE')
FEMO=ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',109)
def medallas(n, alto=15):
    if n<=0: return None
    tmp=Image.new('RGBA',(150*n+80,150),(0,0,0,0)); ImageDraw.Draw(tmp).text((10,0),'🎖️'*n,font=FEMO,embedded_color=True)
    bb=tmp.getbbox(); rec=tmp.crop(bb)
    return rec.resize((max(1,round(rec.width*alto/rec.height)), alto), Image.LANCZOS)

LEY=[('ALTA',(127,211,138),3),('MEDIA',(240,194,77),2),('BAJA',(232,146,61),1),('NULA',(255,107,107),0)]
piezas=[]
for nom,col,n in LEY:
    med=medallas(n)
    piezas.append((nom,col,med, 10+6+int(d.textlength(nom,font=f(12)))+(6+med.width if med else 0)))
lx=998-sum(w for _,_,_,w in piezas)-22*(len(piezas)-1)
for nom,col,med,w in piezas:
    d.rectangle([lx,284,lx+10,294],fill=col)
    d.text((lx+16,281),nom,font=f(12),fill=MUT)
    x2=lx+16+int(d.textlength(nom,font=f(12)))+6
    if med: base.paste(med,(x2,282),med)
    lx+=w+22
d.text((34,281),'Todos los integrantes activos y visibles de la unidad',font=f(12,False),fill=MUT)
d.rounded_rectangle([26,302,998,570],9,fill=(10,17,21),outline=(52,70,79),width=1)

# ---- Observaciones ----
panel(16,594,992,78,'OBSERVACIONES')
d.rounded_rectangle([26,630,998,662],7,fill=(10,17,21),outline=(52,70,79),width=1)

# ---- Pie ----
d.rectangle([0,H-22,W,H],fill=(13,21,26)); d.line([(0,H-22),(W,H-22)],fill=ORO2,width=2)
t='¡HONOR  ★  LEALTAD  ★  DISCIPLINA!'
d.text(((W-d.textlength(t,font=f(13)))/2,H-18),t,font=f(13),fill=ORO)

base.save('/home/claude/army-wasco/reportes/actividad/plantilla.png')
print('ok',base.size)
