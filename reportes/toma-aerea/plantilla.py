from PIL import Image, ImageDraw, ImageFont, ImageFilter
W,H = 1024, 658
ORO=(240,194,77); ORO2=(201,164,58); TXT=(236,240,242); MUT=(150,165,172); FONDO=(9,14,17); PANEL=(16,25,30); LINEA=(45,62,70)
FB='/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'
FR='/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf'
def f(n, b=True): return ImageFont.truetype(FB if b else FR, n)

base = Image.new('RGB', (W,H), FONDO)
d = ImageDraw.Draw(base, 'RGBA')

# ---- Banda superior con el póster ----
post = Image.open('/mnt/user-data/attachments/37c699a5-857c-5662-b45a-557bb65d33c2/de4708a1-image.png').convert('RGB')
# recorte: la franja del helicóptero y los paracaídas (sin los textos del póster)
pw, ph = post.size
caja = post.crop((0, int(ph*0.21), pw, int(ph*0.47)))
caja = caja.resize((W, int(W*caja.size[1]/caja.size[0])), Image.LANCZOS)
BANDA = 139
if caja.size[1] > BANDA: caja = caja.crop((0, (caja.size[1]-BANDA)//2, W, (caja.size[1]-BANDA)//2 + BANDA))
base.paste(caja, (0,0))
# oscurecer para que el texto se lea
d.rectangle([0,0,W,BANDA], fill=(6,10,13,120))
d.rectangle([0,BANDA-70,W,BANDA], fill=(6,10,13,190))

esc = Image.open('icons/eea-512.png').convert('RGBA').resize((76,76), Image.LANCZOS)
base.paste(esc, (20, 12), esc)

d.text((110, 19), 'ARMY DE WASCO · ESCUADRÓN TORMENTA', font=f(14), fill=ORO)
d.text((110, 39), 'REPORTE DE TOMA AÉREA', font=f(37), fill=TXT)
d.text((111, 82), 'DISCIPLINA  ★  PRECISIÓN  ★  ENTREGA', font=f(13), fill=MUT)
d.line([(0,BANDA),(W,BANDA)], fill=ORO, width=3)

def panel(x,y,w,h,titulo,icono=''):
    d.rounded_rectangle([x,y,x+w,y+h], 12, fill=PANEL, outline=LINEA, width=2)
    d.rounded_rectangle([x,y,x+w,y+28], 10, fill=(11,18,22))
    d.rectangle([x,y+19,x+w,y+28], fill=(11,18,22))
    d.line([(x+10,y+28),(x+w-10,y+28)], fill=(60,80,90), width=1)
    d.rectangle([x+12, y+9, x+15, y+22], fill=ORO)
    d.text((x+22, y+7), titulo, font=f(15), fill=ORO)

def etiqueta(x,y,t,ancho=None,alto=34):
    d.text((x, y+7), t, font=f(18), fill=MUT)
    if ancho:
        bx = x + ancho
        d.rounded_rectangle([bx, y, bx+0, y+alto], 6)

M=19; COLW=(W-M*3)//2; Y0=BANDA+16
# ----- Columna izquierda -----
panel(M, Y0, COLW, 143, 'DATOS DE LA OPERACIÓN')
d.text((M+13, Y0+41),  'Fecha:',            font=f(14), fill=MUT)
d.text((M+13, Y0+67),  'Reporta:',          font=f(14), fill=MUT)
d.text((M+13, Y0+94),  'Actividad:',        font=f(14), fill=MUT)
d.text((M+13, Y0+120), 'Hora del servidor:',font=f(14), fill=MUT)

Y1 = Y0+156
panel(M, Y1, COLW, 110, 'RESULTADO DE LA FACCIÓN')
d.text((M+13, Y1+42),  'Puesto obtenido:',     font=f(14), fill=MUT)
d.text((M+13, Y1+70),  'Total de facciones:',  font=f(14), fill=MUT)
d.text((M+249, Y1+70), 'Puntaje:',             font=f(14), fill=MUT)

Y2 = Y1+123
panel(M, Y2, COLW, H-Y2-51, 'ASISTENTES')

# ----- Columna derecha: evidencias -----
X2 = M*2+COLW
panel(X2, Y0, COLW, 251, 'EVIDENCIA 1 · PANTALLAZO DE ASISTENTES')
d.rounded_rectangle([X2+12, Y0+37, X2+COLW//2-5, Y0+224], 8, outline=(70,92,102), width=2)
d.rounded_rectangle([X2+COLW//2+5, Y0+37, X2+COLW-12, Y0+224], 8, outline=(70,92,102), width=2)
d.text((X2+13, Y0+232), 'Mínimo 1, máximo 2 imágenes', font=f(11,False), fill=MUT)

Y3 = Y0+268
panel(X2, Y3, COLW, H-Y3-51, 'EVIDENCIA 2 · PUESTO EN EL CHAT DEL HUD')
d.rounded_rectangle([X2+12, Y3+37, X2+COLW-12, H-67], 8, outline=(70,92,102), width=2)

# ----- Pie -----
d.rectangle([0,H-41,W,H], fill=(7,11,14))
d.line([(0,H-41),(W,H-41)], fill=ORO2, width=2)
d.text((M, H-29), 'Sellado por el servidor · Escuadrón Tormenta · Entrega Aérea', font=f(12,False), fill=MUT)
t='UN EQUIPO · UNA MISIÓN · UN SOLO ARMY'
d.text((W-M-d.textlength(t, font=f(12)), H-29), t, font=f(12), fill=ORO2)

base.save('reportes/toma-aerea/plantilla.png')
print('ok', base.size)
