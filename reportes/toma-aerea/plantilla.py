from PIL import Image, ImageDraw, ImageFont, ImageFilter
W,H = 1400, 900
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
BANDA = 190
if caja.size[1] > BANDA: caja = caja.crop((0, (caja.size[1]-BANDA)//2, W, (caja.size[1]-BANDA)//2 + BANDA))
base.paste(caja, (0,0))
# oscurecer para que el texto se lea
d.rectangle([0,0,W,BANDA], fill=(6,10,13,120))
d.rectangle([0,BANDA-96,W,BANDA], fill=(6,10,13,190))

esc = Image.open('icons/eea-512.png').convert('RGBA').resize((104,104), Image.LANCZOS)
base.paste(esc, (26, 16), esc)

d.text((150, 26), 'ARMY DE WASCO · ESCUADRÓN TORMENTA', font=f(19), fill=ORO)
d.text((150, 54), 'REPORTE DE ENTREGA AÉREA', font=f(50), fill=TXT)
d.text((152, 112), 'DISCIPLINA  ★  PRECISIÓN  ★  ENTREGA', font=f(17), fill=MUT)
d.line([(0,BANDA),(W,BANDA)], fill=ORO, width=4)

def panel(x,y,w,h,titulo,icono=''):
    d.rounded_rectangle([x,y,x+w,y+h], 12, fill=PANEL, outline=LINEA, width=2)
    d.rounded_rectangle([x,y,x+w,y+38], 12, fill=(11,18,22))
    d.rectangle([x,y+26,x+w,y+38], fill=(11,18,22))
    d.line([(x+14,y+38),(x+w-14,y+38)], fill=(60,80,90), width=1)
    d.rectangle([x+16, y+12, x+20, y+30], fill=ORO)
    d.text((x+30, y+10), titulo, font=f(20), fill=ORO)

def etiqueta(x,y,t,ancho=None,alto=34):
    d.text((x, y+7), t, font=f(18), fill=MUT)
    if ancho:
        bx = x + ancho
        d.rounded_rectangle([bx, y, bx+0, y+alto], 6)

M=26; COLW=(W-M*3)//2; Y0=BANDA+22
# ----- Columna izquierda -----
panel(M, Y0, COLW, 196, 'DATOS DE LA ENTREGA', '📦')
d.text((M+18, Y0+56),  'Fecha:',            font=f(19), fill=MUT)
d.text((M+18, Y0+92),  'Reporta:',          font=f(19), fill=MUT)
d.text((M+18, Y0+128), 'Actividad:',        font=f(19), fill=MUT)
d.text((M+18, Y0+164), 'Hora del servidor:',font=f(19), fill=MUT)

Y1 = Y0+214
panel(M, Y1, COLW, 150, 'RESULTADO DE LA FACCIÓN', '🏆')
d.text((M+18, Y1+58),  'Puesto obtenido:',     font=f(19), fill=MUT)
d.text((M+18, Y1+96),  'Total de facciones:',  font=f(19), fill=MUT)
d.text((M+340, Y1+96), 'Puntaje:',             font=f(19), fill=MUT)

Y2 = Y1+168
panel(M, Y2, COLW, H-Y2-70, 'ASISTENTES', '🪖')

# ----- Columna derecha: evidencias -----
X2 = M*2+COLW
panel(X2, Y0, COLW, 344, 'EVIDENCIA 1 · PANTALLAZO DE ASISTENTES', '📸')
d.rounded_rectangle([X2+16, Y0+50, X2+COLW//2-6, Y0+306], 10, outline=(70,92,102), width=2)
d.rounded_rectangle([X2+COLW//2+6, Y0+50, X2+COLW-16, Y0+306], 10, outline=(70,92,102), width=2)
d.text((X2+18, Y0+318), 'Mínimo 1, máximo 2 imágenes', font=f(15,False), fill=MUT)

Y3 = Y0+366
panel(X2, Y3, COLW, H-Y3-70, 'EVIDENCIA 2 · PUESTO EN EL CHAT DEL HUD', '🖥️')
d.rounded_rectangle([X2+16, Y3+50, X2+COLW-16, H-92], 10, outline=(70,92,102), width=2)

# ----- Pie -----
d.rectangle([0,H-56,W,H], fill=(7,11,14))
d.line([(0,H-56),(W,H-56)], fill=ORO2, width=2)
d.text((M, H-40), 'Sellado por el servidor · Escuadrón Tormenta · Entrega Aérea', font=f(17,False), fill=MUT)
t='UN EQUIPO · UNA MISIÓN · UN SOLO ARMY'
d.text((W-M-d.textlength(t, font=f(17)), H-40), t, font=f(17), fill=ORO2)

base.save('reportes/toma-aerea/plantilla.png')
print('ok', base.size)
