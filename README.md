# Policía Militar · Reportes — Army de Wasco

Sitio en GitHub Pages con acceso por usuario y contraseña, roles con permisos, panel de administración e historial de reportes. Backend: Supabase (Auth + Postgres + Storage).

Publicado en: https://pmwasco.zylarion.io (dominio propio; alias: https://jflorezwearkzo.github.io/army-wasco/)

## Estructura

```
index.html            Inicio: lista los formularios que el rol del usuario puede usar
login.html            Ingreso con usuario y contraseña
cuenta.html           Mi cuenta: mis reportes (propios, con descarga), cambiar contraseña
privacidad.html       Aviso de privacidad y uso (enlazado desde el login y la barra)
reglamento.html       Reglamento (reglas, sanciones, rangos, ascensos, permisos, macros) + manual en docs/
calendario.html       Eventos diarios del servidor (hora UTC y hora local, cuenta atrás)
acceso.html           PÚBLICA, sin sesión: solicitar acceso (?u=pm | ?u=eea)
recuperar.html        PÚBLICA, sin sesión: olvidé mi contraseña (?u=pm | ?u=eea)
manuales.html         Manuales de uso dentro de la app (secciones filtradas por permiso)
anuncios/             Imágenes de los comunicados publicados en el tablón
manifest.webmanifest  PWA (nombre, iconos en icons/, atajos); sw.js service worker (versión inyectada por build.mjs); sin-conexion.html
admin/index.html      Panel de administración (pestañas según permisos)
src/                  Código JavaScript legible (auth.js, config.js y el script de cada página)
js/                   Código publicado: ofuscado a partir de src/ (no editar a mano)
build.mjs             Construcción: npm install && npm run build  (regenera js/ desde src/)
estilos.css           Estilos compartidos
reportes/<id>/        Cada formulario (index.html + plantilla.png)
supabase/schema.sql   Esquema de la base de datos (idempotente)
supabase/functions/   Edge Functions (crear-usuario, reset-password, reset-mfa,
                      notificar-discord, notificar-general, auditar-reporte, solicitud-acceso)
```

## Roles y permisos

Un rol es un conjunto de permisos más la lista de formularios a los que da acceso:

| Permiso | Qué permite |
|---|---|
| Gestión de usuarios | Crear usuarios, activarlos/desactivarlos, editar su nombre y asignar su rango militar |
| Asignación de roles | Cambiar el rol de un usuario (solo roles que quepan en los permisos de quien asigna) |
| Restablecer contraseñas | Poner una contraseña nueva a usuarios de igual o menor nivel de permisos (nunca a Administradores, salvo que uno lo sea). Lo ejecuta la Edge Function `reset-password`, que verifica el permiso en la base de datos antes de usar la clave de servicio |
| Creación de roles | Crear/editar/eliminar roles (incluido su Rango PM) y administrar el catálogo de Rangos PM |
| Creación de reportes | Registrar formularios nuevos en el catálogo |
| Gestión de reportes | Editar, ocultar/mostrar y eliminar formularios del catálogo |
| Ver historial | Ver y descargar cualquier reporte guardado |
| Eliminar historial | Eliminar reportes del historial (incluida su imagen) |
| Ver auditoría | Consultar el registro de auditoría |
| Acceso a formularios | "Todos" o una selección; sin acceso, el formulario no aparece ni se puede abrir |
| Ver todo (solo lectura) | Abre todas las secciones sin poder cambiar nada. `permisos_efectivos` le retira en el servidor cualquier permiso de escritura, así que no basta con quitarle botones: aunque el rol tenga más marcados, el servidor devuelve solo `{ver_todo, historial, auditoria, ver_turnos, ver_anuncios}`. Los webhooks le llegan censurados y `sb.functions.invoke` está bloqueado en el cliente |
| Control de TODAS las organizaciones | Ver y administrar cualquier unidad, no solo la propia (`soy_global()`). Exclusivo del Administrador |

Roles iniciales: **Administrador** (todo) y **Usuario** (solo llena reportes). Se pueden crear los que hagan falta desde el panel.

**Los roles son por organización.** Cada fila de `roles` lleva su `org_id`; un rol de la PM no existe ni se puede asignar en EEA. El **rango** en cambio es general: vive en `perfiles.rango` y se refleja en todas las membresías.

Las reglas se aplican en la base de datos (RLS), no solo en la interfaz.

**Super administrador:** el rol Administrador está protegido. Solo un Administrador puede editar, desactivar o degradar a otro Administrador, nombrar nuevos Administradores o modificar el rol Administrador. Un rol con "Gestión de usuarios" puede crear y gestionar a todos los demás usuarios, pero no a los Administradores.

**Delegación acotada:** quien no es Administrador solo puede crear o editar roles con permisos y formularios que él mismo tiene, y solo puede asignar roles que quepan dentro de sus permisos. Los usuarios nuevos nacen sin rol; el gestor les asigna uno.

## Auditoría

Cada alta, cambio o baja en usuarios, roles, Rangos PM, formularios y reportes, y cada restablecimiento de contraseña (concedido o denegado), queda en la tabla `auditoria` con quién, cuándo, qué registro y qué cambió (antes → después). La escriben únicamente triggers de la base de datos; ningún usuario, ni el Administrador, puede borrar ni modificar filas por la API. Se consulta en Panel → Auditoría (permiso "Ver auditoría"). Una tarea de pg_cron borra lo anterior a 30 días cada noche.

## Cloudflare Turnstile (captcha en el login)

1. Cloudflare → Turnstile → Add widget: dominios `pmwasco.zylarion.io` y `jflorezwearkzo.github.io`, modo Managed. Copia **Site Key** y **Secret Key**.
2. Supabase → Authentication → Attack Protection → Enable Captcha protection → provider **Turnstile** → pega la Secret Key.
3. En `src/config.js` pon la Site Key en `TURNSTILE_SITE_KEY` y ejecuta `npm run build`.
El alta de usuarios desde el panel usa la Edge Function `crear-usuario` (clave de servicio), por lo que no requiere captcha.

**Los formularios públicos usan un widget aparte.** Site Key en `src/publico.js`, Secret Key en el secreto de Edge Functions `TURNSTILE_SECRET_ACCESO`. Van separados del login para poder rotar una llave sin tumbar la otra, subirle la dificultad solo a la parte pública y mirar sus estadísticas por aparte. Con un solo widget también funcionaría, porque cada formulario valida su propia `action`.

## Protección del lado del cliente

- **CSP** (Content-Security-Policy en cada página): solo se ejecutan scripts del propio sitio y de cdn.jsdelivr.net, y solo se conecta a Supabase; bloquea scripts inyectados (XSS) y scripts incrustados.
- **Ofuscación**: `js/` se genera con javascript-obfuscator a partir de `src/`. Dificulta leer el código; no impide modificarlo. La seguridad real está en el servidor (RLS, triggers, sello de reportes).
- Flujo de cambio: editar en `src/` → `npm run build` → commit de `src/` y `js/`.

## Flujo

1. El admin crea usuarios desde el panel (usuario, nombre, contraseña inicial, rol). No hay registro libre.
2. Cada usuario entra en `login.html`, ve solo sus formularios y cambia su contraseña en "Mi cuenta".
3. En los formularios, la fecha arranca en hoy (editable con calendario); nombre, rango y Rango PM se toman del perfil y del rol y no son editables.
4. Al exportar, primero se registra el reporte en el servidor, que **sella** usuario, nombre, rango y Rango PM desde el perfil (ignora lo que envíe el navegador) y asigna un **folio** con el prefijo de su organización (`PM-000012`, `EEA-000013`; la numeración es única y compartida, solo cambia el prefijo); luego la imagen se genera con el folio estampado y se adjunta al registro, una sola vez. Un reporte sellado no se puede modificar. Para verificar una imagen, se compara su folio con el historial.

5. El revisor tiene tres salidas: **aprobar**, **devolver para corregir** (`devuelto`) o **rechazar**. Un reporte devuelto se reabre para su autor con `reenviar_a_revision()`: conserva su id, su folio y su fila; se actualiza en vez de insertarse y vuelve a `pendiente`. Toda la maquinaria vive en `auth.js` (`modoCorreccion`, `precargarCampos`, `crearReporte`), así que ningún formulario tuvo que cambiar.

## Organizaciones (multi-unidad)

La página aloja varias unidades sin que se mezclen. La pieza central es la **organización activa**, que vive en el servidor (`perfiles.org_activa`) y se lee con `mi_org()`: todas las políticas RLS filtran por ella, así que las consultas que ya existían quedaron aisladas sin tocar una sola llamada.

```
organizaciones   id, nombre, nombre_corto, prefijo, escudo, color, activa, orden
membresias       usuario_id, org_id, rol_id, activo, visible,
                 permisos_extra, permisos_negados, formularios_extra, notas_admin
perfiles         id, usuario, nombre, rango (GENERAL), org_principal, org_activa
```

Funciones clave: `mi_org()`, `mis_orgs()`, `cambiar_org()`, `es_global()`, `soy_global()`, `soy_superadmin()`, `permisos_efectivos(usuario[, org])`, `tengo_permiso(permiso[, org])`, `comparto_org()`, `puedo_sobre()`, `mi_sesion()`.

**Qué va dónde.** El rango, el nombre y la cuenta son generales (`perfiles`). El rol, si está activo, si es visible en formularios y los permisos granulares son de cada unidad (`membresias`). El panel guarda todo con `guardar_miembro(usuario, org, nombre, rango, rol_id, activo, visible, crear)`, que valida que el rol sea de esa organización y mantiene los candados de siempre (rol protegido, no asignar permisos que uno no tiene). **No escribas rol ni estado directo en `perfiles`**: ahí el servidor ya no los lee.

Cada organización tiene además sus propios formularios, canales de Discord, roles, ranking, turnos, anuncios y prefijo de folio.

## Agregar un formulario nuevo

1. Crea `reportes/<id>/index.html` (copiando uno existente) con su plantilla.
2. En el panel → Formularios → Nuevo: id, título, ruta `reportes/<id>/`, icono y orden.
3. Da acceso al formulario en los roles que corresponda.

## Configuración de Supabase (ya hecha)

- Proyecto `army-wasco`; esquema aplicado desde `supabase/schema.sql`.
- `config.js` contiene la URL del proyecto y la clave pública (publishable), que es segura de exponer.
- Authentication → Providers → Email: **"Confirm email" desactivado** (los usuarios no tienen correo real; se usan `usuario@armywasco.local`).
- Contraseñas: requisitos de complejidad (mayúscula, minúscula, número y símbolo; la página exige además mínimo 8) y **"Require current password when updating"** activado: "Mi cuenta" pide la contraseña actual.
- Restablecer una contraseña olvidada: desde el panel (botón "Contraseña", permiso Restablecer contraseñas) o en Supabase → Authentication → Users.


## Diseñador de formularios (plantillas personalizables)

Panel › Formularios › **Abrir el diseñador**. Flujo:

1. **Nuevo formulario**: identificador, título, icono, orden, descripción.
2. **Subir fondo**: la imagen del formato (se normaliza a PNG de 2048 px y se guarda en el bucket público `plantillas`). La base de dibujo es 1024 px de ancho; la exportación es a 2×.
3. **Agregar campos** y acomodarlos arrastrando las cajas (esquina verde = tamaño; flechas = ajuste fino; Shift+flecha = 10 px). Tipos: texto, texto largo, fecha, hora militar, número, desplegable, sí/no, rango, persona (buscador), lista de personas 1–N (buscador, sin repetidos), lista de textos 1–N, **casillas** (lista fija con ✔/✘ y texto por casilla, p. ej. territorios con resultado), **campo calculado** (contar, marcadas/total, copiar otro campo, unir varios campos, código a partir de una fecha), foto en recuadro.
   Listas y casillas: columnas = 0 reparte en columnas automáticamente según el alto de la caja (hasta 6, reduciendo la letra si hace falta).
   **Reglas** por campo: *habilitar solo si* otro campo vale X (p. ej. Cantidad solo si Novedades = SÍ; los campos inhabilitados no se dibujan ni se validan), *obligatorio solo si* otro campo vale X, *debe ser posterior a* otra hora/fecha. Las listas de personas ya traen: el primero puede ser quien reporta (valor por defecto + bloqueado) y no se admiten repetidos.
   Por campo: obligatorio, bloqueado, valor por defecto (hoy, mi nombre, mi rango, mi Rango PM, mi usuario, mi rango y nombre, o texto fijo), "en resumen" (aparece en el historial), estilo (tamaño, color, fondo de caja, alineación, columnas, prefijo dentro de la imagen, formato de fecha).
4. **Anexo fotográfico**: mínimo y máximo de fotos (0 = sin anexo) y título.
   **Varias páginas**: marca "Reporte en varias páginas", nombra la página (p. ej. Patrullaje) y en cada campo que cambie entre páginas marca "Se repite por página". El formulario pide cuántas páginas hay y exporta una imagen (y un folio) por cada una; los campos calculados *Número de página* y *Página / total* dan el 01, 02… Los reportes guardan `datos.pagina` y `datos.paginas`.
   **Duplicar**: botón en la cabecera del diseñador; crea una copia (oculta) con otro identificador y la misma plantilla.
5. **Vista previa** con datos de ejemplo y **Guardar**. Requiere el permiso **Creación de formularios (diseñador)** (`disenar_formularios`), independiente de creación/gestión de reportes. Cada guardado sube `version`; los reportes guardan `datos.plantilla_version`.

El formulario queda en `reportes/plantilla/?id=<id>` y se comporta como los demás (permisos por rol, folio y sello del servidor, historial, auditoría). Los cuatro formularios originales siguen en código; pueden recrearse en el diseñador si se quiere editarlos sin programar.

## Discord

Panel › Formularios › Editar › **Webhook de Discord** (requiere gestión de reportes). Al sellar un reporte de ese formulario, el navegador llama a la Edge Function `notificar-discord`, que verifica que quien llama puede ver el reporte, lee el webhook con la clave de servicio (nunca viaja al navegador), descarga la imagen del bucket y la publica en el canal con folio, fecha, quién reporta y resumen. Marca `reportes.discord_enviado_en` para no repetir y deja rastro en auditoría (`discord_publicado`). "Enviar prueba" manda un mensaje de verificación al canal. Si Discord falla, el reporte igual queda sellado y en el historial; el mensaje de éxito indica el motivo.

**Enviar de nuevo.** En Revisión cada reporte tiene `📨 Enviar de nuevo` → `notificar-discord` con `{reporte_id, reenviar:true}`. Exige permiso de revisión o de gestión, se salta el candado de `discord_enviado_en` y **relee el webhook en ese momento**: si cambiaste el canal del formulario, el reenvío va al nuevo, nunca al viejo.

## Exportar el Resumen (PDF o PNG)

En Admin → Resumen, el selector **PDF / Imagen PNG** y el botón **⬇ Exportar resumen** generan un reporte con el estilo de la página (`src/resumen-export.js`): cabecera, KPIs, barras por día y las tablas (por formulario, por usuario, patrullajes por integrante, bajas y reclutamientos por persona), con el periodo filtrado y quién lo generó. Se dibuja en canvas (A4, varias páginas si hace falta); el PDF se construye a mano (una imagen JPEG por página) sin librerías externas, y el PNG apila las páginas en una sola imagen.

## Panel → Usuarios (buscador, menú ⋯ y acciones en bloque)

- Columnas ordenables (clic en la cabecera: Usuario, Rango y nombre, Rol, Estado, En formularios, Último reporte; segundo clic invierte el orden). **Buscador** en vivo (usuario, nombre, rango, rol) con filtros *Todos / Activos / Inactivos / Ocultos / Sin rol* y por rol; contador "Mostrando X de Y".
- Columna **Último reporte** (fecha y cantidad) vía RPC `actividad_usuarios()` (requiere `usuarios`, `asignar_roles` o `historial`).
- Cada fila tiene un botón **⋯** con solo las acciones que tu permiso permite: Editar · Ver la página como este usuario · Ver sus reportes (abre Historial filtrado) · Restablecer contraseña · Mostrar/Ocultar en formularios · Activar/Desactivar. Clic en la fila = Editar.
- **Casillas** por fila y "seleccionar todos los visibles": al marcar aparece una barra flotante con Activar · Desactivar · Mostrar · Ocultar · Asignar rol, con confirmación que lista los nombres. Nunca toca roles fuera de tus permisos ni desactiva tu propia cuenta.
- En móvil la tabla se convierte en tarjetas. Roles y Formularios usan el mismo menú ⋯ en lugar de la fila de botones.
- **Crear y editar en sub-ventana**: las tres pestañas (Usuarios, Roles, Formularios) van a ancho completo con un botón **＋ Nuevo …** en la cabecera; el formulario de crear/editar se abre en un diálogo modal dentro del panel (Esc o ✕ cierra; en móvil ocupa la pantalla con "← Volver"). La URL refleja el estado (`#usuarios/nuevo`, `#usuarios/editar/<id>`, `#roles/…`, `#formularios/…`) y se puede recargar o compartir. Al guardar, el diálogo se cierra, aparece un aviso flotante y la fila guardada queda resaltada unos segundos. El diálogo de usuario muestra su rol, último reporte y accesos rápidos a Ver como, Restablecer contraseña y Sus reportes.

## Búsqueda de texto completo y galería

Historial → "Buscar en el contenido": busca en resumen y en todos los datos del reporte (integrantes, nombres, observaciones) con `tsvector` en español (columna generada `reportes.busqueda` + índice GIN; sintaxis websearch: `"zona norte" -bajas`). Un folio (`PM-000012`) se busca por folio. Botón **🖼 Galería**: mosaico con las imágenes de los reportes filtrados (hasta 120), clic para ampliar o descargar.

## Verificación en dos pasos (2FA, opcional)

Mi cuenta → "Verificación en dos pasos": activa un factor TOTP (Google Authenticator, Authy, Microsoft Authenticator…): QR + clave manual, confirmación con código. Con el factor activo, el login pide el código tras la contraseña y `requerir()` exige la sesión verificada (aal2) en todas las páginas. Se puede desactivar desde Mi cuenta (pide el código). No es obligatoria. Requiere que en Supabase esté habilitado **Authentication → Multi-Factor → TOTP**. Si alguien pierde la app, el **Administrador** le quita la verificación desde Usuarios → ⋯ → "Quitar verificación en dos pasos" (o 🔓 en el expediente): Edge Function `reset-mfa` (exige `soy_superadmin()` con la sesión del llamante, borra los factores con la clave de servicio y audita `mfa_reset`).

## Copia de seguridad (solo Administrador)

Admin → Automatización → "Copia de seguridad": genera en el navegador un ZIP con cada tabla en JSON y CSV (`datos/`) y las imágenes del historial (`imagenes/<folio>-<formulario>.<ext>`), sin contraseñas, webhooks ni claves (`src/respaldo.js`, ZIP sin compresión escrito a mano). Queda en Auditoría como `respaldo`.

## Turnos y agenda de patrullaje

Permisos **Turnos: asignar y editar** (`turnos`) y **Turnos: solo ver la agenda** (`ver_turnos`, abre la pestaña sin botones de edición). Admin → **Turnos**: agenda con vistas **Día / Semana / Mes** (‹ › Hoy; en Mes, clic en el número del día abre ese día), "＋ Asignar turno" (integrante con **buscador** por nombre/usuario/rango, fecha con calendario, hora inicio/fin, notas, repetir N semanas), clic en un turno para editar o eliminar. Los turnos pasados muestran ✅ si ese día existe Reporte de reporte de patrullaje del integrante o ⏳ si no. Cada integrante ve "Mis próximos turnos" (14 días) en el inicio. Tabla `turnos`, RPC `turnos_lista`.

## Tablón de anuncios

Permisos **Anuncios: publicar y editar** (`anuncios`) y **Anuncios: solo ver** (`ver_anuncios`, ve la lista y el contador de leídos sin editar). Admin → **Anuncios**: crear/editar (título, contenido, **una imagen** opcional —bucket público `anuncios`, se muestra en el tablón y en el embed de Discord—, caducidad, fijar arriba, visible, publicar en Discord), contador de "leído por". En el inicio aparecen para todos; los no leídos salen como NUEVO con "Marcar como leído" (`anuncios_vistos`).

## Ranking mensual e insignias

`ranking.html` (enlace "Ranking" en la barra): podio por categoría (reportes, bajas, patrullajes, reclutamientos, AKs, participaciones), tabla completa ordenable, selector de mes y Salón de insignias. Solo cuentan reportes aprobados (RPC `ranking_mes`). La tarea `ranking_mensual` publica el top 3 del mes anterior en Discord el día 1 y otorga la insignia 🥇 de cada categoría (`insignias`).

## Mensajes a una persona

`perfiles.discord_id` (17–20 dígitos, único, validado por CHECK y por la RPC `guardar_discord_id(p_usuario, p_discord)`, que solo deja tocar el propio salvo con permiso de `usuarios`). Lo pone cada quien en Mi cuenta o un gestor desde la ficha.

Edge Function **`mensaje-persona`** con dos modos: `mencion` publica en un canal de `discord_canales` con `<@id>` y `allowed_mentions.users` acotado a esa persona (no hace falta bot), y `privado` abre un DM con el bot (`POST /users/@me/channels` → `POST /channels/<id>/messages`) usando el secreto `DISCORD_BOT_TOKEN`. Sin ese secreto devuelve `sin_bot` en vez de fallar, y traduce los rechazos de Discord a motivos entendibles (`privados_cerrados`, `demasiado_rapido`). Exige permiso de `usuarios` o `anuncios`, comprueba que la persona pertenece a la organización de quien llama, firma el mensaje con el rango y el nombre del remitente y audita `mensaje_mencion` / `mensaje_privado`.

**Comandos del bot.** Edge Function **`discord-bot`** (`verify_jwt:false`) como *Interactions Endpoint*: verifica la firma Ed25519 con `crypto.subtle` sobre `timestamp + body` y responde 401 si no cuadra (es lo que Discord comprueba al guardar la URL), contesta al PING con PONG y atiende `/eventos`, `/agenda`, `/misreportes`, `/ruta`, `/turnos`, `/ranking`, `/pendientes`, `/quien` y `/mensaje`. Cada comando se enciende o apaga y se le exige un permiso desde el panel: `configuracion.bot` por organización, leída por `bot_config(p_org)` y escrita por `guardar_bot_config(p_valor)` (permiso `gestion_reportes`); el bot consulta esa regla antes de atender nada. Los datos salen de `discord_consulta(p_discord, p_que)`, que resuelve la identidad y los permisos por su cuenta en vez de confiar en el bot. Quien usa un comando se identifica por su `discord_id` mediante `discord_quien(p_discord)`, que devuelve su perfil, su organización y sus permisos efectivos; `discord_eventos_hoy(p_org)` y `discord_agenda(p_org, p_rango_pm)` alimentan las consultas. Todas las respuestas son efímeras (`flags: 64`). El App ID y la Public Key son públicos y van como constantes con sobreescritura por entorno; el token sigue siendo el único secreto.

**`/pregunta` (IA sobre el reglamento).** Responde con Gemini, pero **sin confiar en lo que el modelo "sepa"**: `conocimiento(admin, "reglamento")` descarga `reglamento.html` de la página publicada, lo convierte a texto plano y lo cachea 6 h en `bot_conocimiento`; ese texto va en el prompt y la instrucción de sistema prohíbe inventar reglas o cifras y obliga a citar el artículo. Si el reglamento cambia, la respuesta cambia sola al siguiente refresco: no hay segunda copia. Como Discord corta a los 3 s, se contesta con interacción diferida (`type: 5`) y el resto se completa con `EdgeRuntime.waitUntil` + `PATCH /webhooks/<app>/<token>/messages/@original`. La clave va en la cabecera `x-goog-api-key`, nunca en la URL. Tope por persona y día en `bot_preguntas` vía `bot_pregunta_registrar`, configurable en `configuracion.bot->pregunta->limite_dia`. **Nace apagado.**

**Permiso `bot` ("Configurar el bot de Discord").** Todo lo que configura el bot lo exige: `guardar_bot_config`, `guardar_bot_roles`, `bot_sincronizar`, el registro de comandos y los campos `canal_id`/`via_bot` de un canal (trigger `canal_campos_bot`, segunda línea de defensa tras la RLS). Las políticas de `bot_cola` y `bot_roles` también lo piden. Lo heredaron los roles que ya tenían `gestion_reportes`. **Al añadir un permiso nuevo hay que meterlo también en la lista fija de `permisos_efectivos` para el administrador global**, o quien manda en todas las organizaciones se queda sin él (pasó con este).

**Publicar con el bot.** `discord_canales.canal_id` + `via_bot`: cuando están puestos, `discord_enviar` deja de llamar al webhook y encola en `bot_cola` un trabajo `publicar`, que es lo que permite mandar `components` (un webhook corriente no puede llevar botones). `agenda_publicar` añade los botones con `agenda_botones(id)` solo en los canales que van por el bot; las pulsaciones llegan como interacción de tipo 3 y las resuelve `agenda_responder_discord(p_discord, p_evento, p_respuesta)`, que vuelve a comprobar unidad y rangos convocados.

**Cola y avisos automáticos.** `bot_cola` (tipos `privado`, `publicar`, `sync_rol`) la vacía la Edge Function **`bot-tareas`** (`verify_jwt:false`, autenticada con `secretos.AUDITORIA_INTERNO`), llamada cada minuto por el cron `pm_bot_cola` → `bot_vaciar_cola()`. Así el token del bot nunca sale del servidor de funciones. Tres intentos y la fila queda `fallido` con su motivo, visible en el panel. Los avisos los encolan triggers (`tg_bot_reporte_revisado`, `tg_bot_sancion`, `tg_bot_turno`, `tg_bot_bienvenida`) a través de `bot_avisar`, que no hace nada si el aviso está apagado en `configuracion.bot->avisos` o si esa persona no tiene `discord_id`. **Nacen todos apagados.**

**Roles y apodos.** `bot_roles(org_id, rango_pm, rol_id)` mapea Rango PM a rol de Discord; `guardar_bot_roles(p_guild, p_mapa)` y `bot_sincronizar(p_activo)` lo gobiernan desde el panel. El trigger `tg_bot_sync_rol` sobre `membresias` encola un `sync_rol` al cambiar de rol o de estado. `bot-tareas` quita solo los roles que están en `bot_roles` y pone el que toca, así que los roles repartidos a mano no se tocan; si el rol del bot está por debajo, Discord responde 403 y queda como `rol_del_bot_demasiado_bajo`.

Los comandos se registran con `mensaje-persona` y `accion: "registrar_comandos"` (permiso `gestion_reportes`), que hace `PUT /applications/<app>/commands`, o el equivalente por servidor cuando se pasa `guild_id` — esto último aparece al instante, lo global tarda hasta una hora. El botón está en Automatización → Bot de Discord.

Para que los privados funcionen hace falta una aplicación de Discord con bot invitado al servidor (ámbito `bot`, permiso *Send Messages*) y su token en los secretos de Supabase como `DISCORD_BOT_TOKEN`.

## Páginas legales

`privacidad.html` y `terminos.html` (enlazadas desde la barra, el login y los dos formularios públicos). Hay que mantenerlas al día cuando cambie qué datos se guardan o a dónde se envían: Discord las exige para publicar una aplicación.

## Agenda de eventos

Admin → **Agenda** (permiso `anuncios`): eventos puntuales con título, descripción, lugar, fecha y hora, duración, canal de Discord propio y recordatorio configurable. Nada que ver con `actividades`/`actividades_horarios`, que son los horarios fijos del servidor y no se editan desde la interfaz.

Tablas `agenda_eventos` (con `canales text[]` e `imagen_path`), `agenda_asistencia(evento_id, usuario_id, respuesta)` y `agenda_canales`, que son los destinos que el administrador crea a demanda: cada uno estrena su fila en `discord_canales` (clave `agenda-<id>`, nombre "Agenda · …") para que el webhook se pegue donde todos los demás. RPCs `agenda_canal_guardar` y `agenda_canal_borrar`, que se niega a borrar un destino si algún evento futuro sigue publicando ahí. `agenda_eventos.rangos text[]` son los **Rangos PM** convocados (vacío = toda la unidad); el rango sale del rol de cada quien en su organización (`roles.rango_pm` vía `membresias`, helper `mi_rango_pm()`), no de `perfiles.rango`, que es el rango militar. La política `agenda_ver` filtra con `agenda_invitado(rangos)`, que deja pasar además a quien tenga `anuncios` o `ver_todo` porque administra la agenda; `agenda_responder` aplica el mismo corte. Un evento publica en **todos** los canales marcados; la portada se sube al mismo bucket público `anuncios`, bajo `agenda/`. RLS: los ve cualquier miembro de la organización (`mis_orgs()`), y crear/editar/borrar pasa por RPCs que exigen `tengo_permiso('anuncios')`: `agenda_guardar`, `agenda_cancelar(p_id, p_borrar)`, `agenda_publicar(p_id, p_mencion, p_titulo)` y `agenda_responder(p_id, 'si'|'no')`, que cada quien ejecuta para sí mismo.

`agenda_embed()` arma el mensaje: hora del servidor en UTC, marcas dinámicas de Discord para la hora de cada lector, lugar y **dos enlaces** `calendario.html?evento=<id>&r=si|no`. Los webhooks no admiten componentes interactivos (solo un bot), así que la confirmación va por enlace; si no hay sesión, `requerir()` manda al login con `?next=` y vuelve al evento. `agenda_recordatorios()` corre en el cron `pm_agenda` cada minuto y envía una sola vez, cuando faltan `minutos_antes`; cambiar la fecha pone `recordado_en` a null y vuelve a quedar pendiente. En Auditoría: `agenda_creado`, `agenda_editado`, `agenda_publicado`, `agenda_cancelado`, `agenda_borrado`.

La sección "Próximos eventos" sale en `calendario.html` encima de los horarios fijos, con los botones de confirmación y el recuento.

## Ver como

`ver_como(p_usuario, p_evento)` devuelve el perfil con el **rol, el estado y el rango de su membresía en la organización activa** (no la columna heredada `perfiles.rol_id`) más el estado de su ruta de aprendizaje. En el cliente, `aplicarVerComo` arma el `yo` suplantado y le pasa la organización del administrador y la ruta de esa persona; sin eso la página se queda sin cabeceras ni menú.

Los dos modos de solo lectura (rol "Read Only" y "Ver como") comparten la lista blanca `RPC_LECTURA` de `src/auth.js`: lo que no esté ahí queda bloqueado. **Al añadir una función de consulta nueva hay que añadirla a esa lista**, o en esos modos fallará en silencio. Las escrituras, las funciones Edge y el almacenamiento están cortados en ambos casos.

La franja de aviso (`.pm-vc`) va fija abajo: arriba competía con la barra superior pegada y acababa tapándola.

## Tareas programadas (Automatización)

Admin → Automatización → Tareas programadas: **Recordatorio de turnos de hoy** (quién tiene turno y quién no ha reportado), **Cierre del día**, **Resumen semanal** (día y hora) y **Ranking mensual** (día 1). Cada una se activa/desactiva, se le fija la hora (Colombia) y tiene "▶ Ejecutar ahora". Corren dentro de Postgres con pg_cron y publican por pg_net en el canal de Discord correspondiente (`discord_canales`): no hay Edge Function ni secretos de por medio. RPCs `programar`, `ejecutar_programada`; configuración en `configuracion.programadas`; quedan en Auditoría como `programada_*`.

**Avisos de eventos del día.** Admin → Automatización → "Avisos de eventos del día": una tarjeta por aviso (nombre, minutos de antelación, actividades, mención `ninguna`/`everyone`/`here` y activo), con ＋ Nuevo aviso, 🗑 Borrar y 👁 Vista previa. Tabla `eventos_avisos(id, org_id, nombre, canal, minutos, actividades, activo)`; cada aviso tiene **su propio canal** en `discord_canales` (clave `eventos-<id>`, creada y borrada junto con el aviso; el primero conserva la clave `eventos`), así el webhook se pega donde todos los demás y nunca sale al navegador. Actividades `null` o vacías = todas, incluidas las que se agreguen después. RPCs `guardar_aviso_evento(p_id, p_nombre, p_minutos, p_actividades, p_activo)`, `borrar_aviso_evento(p_id)`, `programar_eventos_cron()` (enciende o apaga el cron según haya avisos activos) y `avisar_eventos(p_enviar)` (con `false` devuelve la vista previa sin publicar, cada entrada con el nombre de su aviso). El mensaje lleva la hora del servidor en UTC y marcas dinámicas de Discord (`<t:epoch:t>` y `<t:epoch:R>`), que cada lector ve en su propia zona horaria; no se escribe ninguna hora local fija. El cron `pm_eventos` corre **cada minuto** y compara contra `date_trunc('minute', now()) + minutos` con una ventana de un minuto; `eventos_avisados(aviso_id, actividad_id, hora_utc, dia)` evita repetir, por aviso. Queda en Auditoría como `aviso_evento_guardado` / `aviso_evento_borrado`.

## Manuales de uso

`manuales.html` (enlace "Manuales" en la barra y "📖 Manuales de uso" en el panel): guías paso a paso por módulo, con la misma navegación del Reglamento. Cada sección declara `data-permisos` (`*` = todos; o lista de permisos) y `src/app-manuales.js` elimina las que el rol no puede usar; los bloques con `data-solo="<permiso>"` (o `superadmin`) se ocultan igual. Manuales: Inicio y tablón, Enviar un reporte, Mi cuenta y seguridad, Mi expediente y ranking (todos) · Usuarios, Roles y permisos, Formularios y diseñador, Revisión, Disciplina, Ascensos, Turnos, Anuncios, Historial y Resumen, Automatización, Auditoría (según permiso). Para añadir o cambiar un manual se edita el HTML de esa sección.

## Expediente por integrante

`expediente.html?id=<uuid>` (sin id: el propio; enlace "Mi expediente" en la barra y en Mi cuenta; en Admin desde el menú ⋯ de cada usuario). Muestra perfil y rol, rango y desde cuándo, KPIs (reportes aprobados, últimos 30 días, bajas, reclutamientos, patrullajes, AKs, participaciones como integrante, advertencias activas, pendientes/rechazados), sanciones, ascensos y reportes recientes. Los demás expedientes requieren `historial`, `usuarios` o `sanciones` (RPC `expediente`). Incluye la **foto del personaje** (clic en el círculo): imagen del personaje dentro del RP, **nunca una foto real**; el aviso aparece al subirla. Se recorta a 512×512 WebP y va al bucket público `avatares` (`perfiles.avatar_path`, RPC `fijar_avatar`); el propio usuario o quien tenga `usuarios` puede cambiarla o quitarla.

## Sanciones y advertencias

Permiso **Sanciones y advertencias** (`sanciones`). Se registran desde el expediente o desde Admin → **Disciplina** (buscador de integrante) (tipos: advertencia, sanción, suspensión, expulsión; motivo obligatorio; fecha). Nunca se borran: se **anulan** con motivo. Con **3 advertencias activas** el expediente y la pestaña muestran la alerta de expulsión. Cada registro publica un embed en el canal de Discord *avisos* (si está configurado) y queda en Auditoría (`sancion_<tipo>`, `sancion_anulada`). Tablas `sanciones`; RPCs `registrar_sancion`, `anular_sancion`.

## Ascensos

Todo cambio de rango queda en `ascensos` (trigger sobre `perfiles.rango`), con motivo y quién lo otorgó cuando se hace desde el expediente ("⬆ Cambiar rango", permiso `usuarios`; publica en Discord *avisos*). Admin → **Ascensos**: lista de elegibles al siguiente rango según **requisitos por rango** editables (días mínimos en el rango anterior y reportes aprobados desde el último ascenso; quien tiene advertencias activas no cumple). RPC `datos_ascensos`, tabla `requisitos_ascenso`.

## Imagen al enviar (por formulario)

Cada formulario tiene la casilla **Descargar la imagen al enviar** (`formularios.descarga_imagen`, por defecto sí; editor y ficha). El botón de los formularios es **📤 Enviar reporte**: siempre registra el reporte, genera la imagen con el folio, la guarda en el historial (y la analiza la IA) y la publica en Discord; la descarga al dispositivo solo ocurre si la casilla está marcada (`descargarSiProcede` en `src/auth.js`, con caché por formulario).

## Revisión y aprobación de reportes

- Se activa **por formulario**: Admin → Formularios → Editar → "Requiere aprobación de un revisor" (badge *Con revisión* en la lista). Mientras no se active, todo funciona como antes (los reportes nacen aprobados).
- Con la opción activa, cada reporte nuevo queda **pendiente** (`reportes.estado`): se guarda y **se publica en Discord igual** (la publicación es inmediata para todos los reportes), pero no cuenta en el Resumen, el ranking ni las estadísticas hasta que alguien con el permiso **Revisar y aprobar reportes** (`aprobar_reportes`) lo apruebe. El autor lo ve en Mi cuenta → Mis reportes con la etiqueta y, si lo rechazan, con el motivo.
- Pestaña **Revisión** del panel: tarjetas con imagen, autor y resumen; Aprobar (comentario opcional; si la publicación en Discord hubiera fallado al enviar, la reintenta) / al aprobar o rechazar, el servidor publica en el canal del formulario un aviso de solo texto: "✅ Reporte PM-000045 fue revisado y aprobado por Líder PM" (Rango PM del revisor, con el motivo citado si lo hay) / Rechazar (motivo obligatorio) / Volver a pendiente. La pestaña muestra el número de pendientes. Historial tiene filtro y columna de estado; el CSV incluye estado, revisor y comentario.
- **Tres salidas, no dos.** Además de aprobar y rechazar está **devolver para corregir** (`estado = 'devuelto'`), para el reporte que solo necesita un arreglo. El autor lo ve en los avisos del inicio y en Mis reportes con "✏️ Corregir y reenviar", que abre el formulario precargado; al reenviar se **actualiza la misma fila** (mismo id, mismo folio) y `reenviar_a_revision()` la devuelve a `pendiente`.
- El aviso que se publica en Discord al revisar lleva el folio **y el rango y nombre de quien reportó**, además de quién revisó.
- **Revisión en bloque**: casillas por tarjeta y barra inferior para aprobar o devolver varias. Se procesan en serie y, antes de aprobar en bloque, se avisa si alguna trae riesgo alto de la IA.
- Servidor: trigger `reportes_estado_inicial`, RPC `revisar_reporte(id, estado, comentario)` (no permite revisar los propios salvo Administrador; audita `revision_aprobado/rechazado/pendiente`) y el trigger de inmutabilidad solo deja cambiar la revisión a través de ese RPC.

## Auditoría con IA de los reportes (gratis, Gemini)

Cuando un reporte recibe su imagen, un trigger de la base de datos llama por `pg_net` a la Edge Function `auditar-reporte`, que descarga la imagen exportada (con las capturas del juego incrustadas) y la envía a **Gemini** (nivel gratuito de Google AI Studio) junto con los datos del formulario. La IA lee el texto de las capturas (nombres, cifras, horas del HUD, chat), lo compara con lo declarado, busca indicios de montaje o de imagen que no es del juego y coteja una *huella* de las capturas con las de reportes anteriores del mismo autor (capturas reutilizadas). Hace cinco comprobaciones explícitas y las devuelve en `verificaciones`: **autor en pantalla** (quien envía las macros de rol en el chat debe ser el autor; en patrullaje/toma vale cualquier integrante declarado), **nombres declarados** vistos/no vistos sobre los cuerpos o el kill feed, **hora del servidor** de cada captura frente a la fecha declarada (±1 día) y entre sí, **reutilización** frente a las huellas previas, **autenticidad** y **HUD visible** (una foto de la cámara interna del juego, sin HUD ni chat, se marca y sube el riesgo a medio). Regla del clan: la fecha y las horas se declaran **tal como aparecen en el HUD de la captura (HORA DEL SERVIDOR, UTC)**, no según el reloj del jugador (cada integrante está en una zona distinta); la IA exige que coincidan (fecha igual; en patrullaje, horaIni/horaFin a ±15 min de las capturas de salida y regreso). Los formularios muestran un aviso de validación con IA (falta grave / sanción) y lo recuerdan junto a cada campo de fecha y hora; junto a cada campo de foto se pide pantallazo del dispositivo (no la cámara del juego, que oculta chat, macros y hora del servidor). El código escala el riesgo por regla sobre el veredicto del modelo (autor ajeno, reutilización o imagen no del juego → alto; nombres no vistos o fecha incoherente → al menos medio; `reglas` lista los motivos). Devuelve `riesgo` (bajo/medio/alto), `puntaje`, `resumen`, `hallazgos` y `texto_leido`, que se guardan en `reportes.auditoria_ia` (más `imagen_hash`, SHA-256 del archivo). Se muestra como **semáforo** en Revisión (con detalle desplegable y botón 🔎 Analizar/Reanalizar), Historial, ficha del formulario y expediente. La IA solo orienta: aprobar o rechazar sigue siendo del revisor. Si Gemini falla o la cuota se agota, el reporte entra igual ("sin análisis" / "análisis fallido") y se puede reintentar. Admin → Automatización → "Auditoría con IA": interruptor del análisis automático, modelo (`gemini-3.8-flash` por defecto; si falla, tarda más de 45 s o está saturado se prueba el siguiente de la lista de respaldo, máximo 3 por análisis) y estadísticas de 30 días. La clave de Google vive en el servidor (variable `GEMINI_API_KEY` de la función o tabla `secretos`, sin políticas RLS); el trigger se autentica con un token interno (`secretos.AUDITORIA_INTERNO`). Queda en Auditoría como `auditoria_ia`.

## Tema claro / oscuro

Toda la interfaz usa variables CSS (`estilos.css`: `--bg`, `--panel`, `--line2`, `--gold`…) y `js/tema.js` aplica el tema guardado (`localStorage.pm_tema`) antes de pintar. Se cambia desde la barra superior ("🌗 Tema"). Las imágenes de los reportes no cambian: se dibujan sobre sus plantillas.

## Fotos y almacenamiento

Las fotos se reducen en el navegador a 1600 px por lado antes de dibujarlas (`cargarFoto` en `src/auth.js`), lo que acelera la exportación en el celular. La imagen del reporte se descarga en PNG, pero en el historial se guarda en **WebP** (≈60-70 % más liviana; `blobParaHistorial`); en navegadores sin WebP (Safari) se guarda el PNG. Los nombres de descarga y la publicación en Discord respetan la extensión real.

## Mensajes de Discord editables

Cada mensaje que la página envía a Discord se guarda con su identificador en `discord_mensajes` (los envíos se hacen con `?wait=true`; los que salen desde la base de datos por `pg_net` se resuelven con `discord_resolver()`, cron cada 5 min). En Admin → Anuncios, el menú ⋯ ofrece **Publicar en Discord**, y si ya está publicado, **Actualizar en Discord** y **Borrar de Discord**; guardar un anuncio ya publicado actualiza el mensaje y eliminarlo lo borra del canal. Lo hace la Edge Function `notificar-general` (`accion: editar | borrar`) por la API del webhook, solo sobre mensajes registrados por la página; queda en Auditoría como `discord_editado` / `discord_borrado`.


**Reenviar (republicar).** `notificar-general` acepta `accion: "republicar"`: borra el mensaje registrado, borra su fila de `discord_mensajes` y publica uno nuevo al final del canal heredando el `origen` del anterior, así que el anuncio conserva su enlace y estrena id. Es lo que hace el botón 📤 del tablón, para subir un anuncio que quedó sepultado. Audita `discord_republicado` con el id de antes y el de ahora.
## Canales de Discord y automatización

Admin → **Automatización** → Canales de Discord: webhooks por propósito y, debajo, los **canales por formulario** (`formularios_discord`, lo mismo que el campo del editor de Formularios, centralizado aquí con botón Probar); también (`discord_canales`: avisos, anuncios, ranking, resumen, recordatorios, solicitudes, recuperacion) con botón Probar. La Edge Function `notificar-general` (`{canal, texto, embed, prueba}`) publica en ellos; exige sesión con alguno de los permisos que generan avisos y audita como `discord_aviso`. En el cliente: `avisoDiscord(canal, {texto, embed})`.

**Un canal por organización.** La clave de `discord_canales` es `(org_id, clave)`, no solo `clave`: PM y EEA tienen cada una su propio `anuncios`, su propio `solicitudes`, etc. `notificar-general` resuelve la organización de quien llama con `mi_org()` y `discord_enviar(canal, payload, tabla, id, org)` acepta la organización como quinto argumento (por defecto `mi_org()` y, sin sesión —cron—, `'pm'`).

**Hilos.** Cada canal y cada formulario tienen una columna `hilo` con el id del hilo de Discord, aparte del webhook. Va separado a propósito: publicar admite `?thread_id=` al final, pero **editar y borrar** usan `/messages/<id>` y con el parámetro pegado al enlace la dirección queda malformada. Las funciones arman la URL con `URL()` (`urlEnviar` / `urlMensaje`), lo que de paso arregla cualquier webhook que ya trajera parámetros. El panel separa solo un `?thread_id=` pegado en el campo del webhook.

## Formularios públicos (sin sesión)

`acceso.html` y `recuperar.html` son páginas **aisladas**: no importan `auth.js`, ni `config.js`, ni la librería de Supabase; no hay sesión y no tocan ninguna tabla. Comparten `src/publico.js` y se distinguen con `<body data-tipo="acceso|password">`. CSP cerrada (`default-src 'none'`), `noindex`, sin referrer. El destino sale de `?u=<org>`.

Las dos postean a la Edge Function **`solicitud-acceso`** (desplegada con `verify_jwt:false`), que:

1. Exige `TURNSTILE_SECRET_ACCESO` (o, si no existe, `TURNSTILE_SECRET_KEY`). Sin secreto responde 503: falla cerrado.
2. Valida el token contra Cloudflare **y exige que la acción coincida** (`solicitud-acceso` / `recuperar-password`) y que el hostname sea el del sitio. Por eso un token resuelto en el login o en el otro formulario no sirve aquí, aunque el widget sea el mismo.
3. Llama a `solicitud_permitida(org, ip, tipo)`, que comprueba el canal, aplica el tope (24 h para acceso, 2 h para contraseña) y devuelve el webhook. **La IP no se guarda en claro**: se convierte en un HMAC-SHA256 con un pepper aleatorio generado en `secretos_internos` y la tabla `solicitudes_limite` solo guarda ese hash, el tipo y la hora del último envío. Se limpia sola a las 48 h.
4. Limpia el texto (sin enlaces, sin menciones, sin formato, sin caracteres invisibles, con tope de largo), publica con `allowed_mentions: {parse: []}` y **no guarda la solicitud en ninguna parte**.

`solicitudes_limite` y `secretos_internos` tienen RLS activo y **ninguna política**: solo se llegan con la clave de servicio. `solicitud_permitida` solo tiene `execute` para `service_role`. La comprobación del canal va **antes** que la del tope, para que un canal sin configurar no le queme el turno a nadie.

## Calendario de actividades

`actividades` (nombre, icono, descripción, `org_id` NULL = todas, orden) y `actividades_horarios` (`hora_utc`, etiqueta). Las horas se guardan **siempre en UTC**; `calendario.html` las muestra en la hora local de quien mira y en la del servidor, marca lo que ya pasó y lleva la cuenta atrás del siguiente.

En los formularios, una opción de lista que empiece por `HH:MM UTC` se muestra con la hora local añadida (`conHoraLocal` en `plantilla.js`), pero el `<option value>` conserva la cadena UTC: **lo que se guarda y se sella es siempre la hora del servidor**.

## Panel de administración: navegación lateral y fichas

La barra superior (`barraUsuario` en `src/auth.js`) va **pegada arriba** (`position:sticky`) en todas las páginas y publica su altura en `--barra-h` (y la del aviso de "Ver como" en `--vc-h`), que es lo que usan los elementos pegados debajo: el menú del panel, el selector de sección del móvil y los índices laterales de Reglamento y Manuales.

El panel (`admin/index.html`) usa un **menú lateral** agrupado (Identidad: Usuarios, Roles y permisos · Reportes: Formularios, Revisión, Historial, Resumen · Personal: Disciplina, Ascensos, Turnos, Anuncios · Sistema: Automatización, Auditoría), migas de pan y, en el celular, **cajón lateral** (botón `#abrirNav` → `#navCaja.on`, fondo `#navFondo`, cierre con ✕/Escape/tocar fuera/elegir sección; `#navActual` dice en qué sección estás): es el mismo `nav#tabs` del escritorio, sin lista duplicada. Las tablas se envuelven al cargar en `div.tscroll` con `--cols` = número de columnas, de modo que bajo 720 px se deslizan de lado en vez de desbordar la página. Solo aparecen las secciones permitidas por el rol. Las listas de **Usuarios, Roles y Formularios** abren al clic una **ficha** propia (subpágina con cabecera, resumen lateral, acciones y pestañas), al estilo de un directorio:
- `admin/usuario.html?id=` — ver sección siguiente.
- `admin/rol.html?id=` — datos (nombre, descripción, rango PM), **Permisos** (casillas; solo se otorgan los que uno tiene; "Ver como" exclusivo del protegido), **Formularios** (todos o lista), **Miembros** (usuarios del rol, con enlace a su ficha y marca +granular) e **Historial de cambios**. Eliminar rol desde la cabecera. El rol protegido solo lo edita otro Administrador.
- `admin/formulario.html?id=` — **Configuración** (título, icono, orden, descripción, ruta, visible, requiere aprobación), **Discord** (webhook + prueba), **Quién lo usa** (roles con acceso y usuarios con acceso extra), **Reportes recientes**, **Historial de cambios**, más estadísticas (aprobados, pendientes, rechazados, últimos 30 días, quién más reporta) y acciones Abrir / Diseñar / Ocultar / Eliminar.
Los diálogos de "＋ Nuevo" y "Editar" del panel siguen disponibles desde el menú ⋯. Estilos compartidos en `admin/ficha.css`.

## Ficha de usuario y permisos granulares

Clic en una fila de Admin → Usuarios (o ⋯ → "Abrir ficha") abre `admin/usuario.html?id=…`, una subpágina tipo directorio: cuenta (usuario, correo de acceso, rol, rango, último acceso, 2FA), actividad (reportes, último, advertencias, turnos próximos), acciones (Editar, Expediente, Ver como, Contraseña, Quitar 2FA) y tres pestañas:
- **Permisos**: cada permiso con origen *por rol*, casillas **Extra** (se otorga aunque el rol no lo tenga) y **Negado** (se quita aunque el rol lo tenga) y el **efectivo** resultante. Editar requiere el permiso **Permisos granulares por usuario** (`permisos_granulares`, por defecto solo Administrador); solo se pueden otorgar como extra permisos que uno mismo tiene; "Ver como" nunca; nadie se edita a sí mismo; a un Administrador solo otro Administrador.
- **Formularios**: acceso extra a formularios además de los del rol.
- **Historial de cambios**: auditoría relacionada con el usuario. Más un cuadro de **notas del administrador**.
Servidor: `perfiles.permisos_extra / permisos_negados / formularios_extra / notas_admin`, `permisos_efectivos()` (usada por `tengo_permiso`, `puedo_usar_formulario` y el cliente en `cargarYo`), RPCs `fijar_permisos_usuario` (audita) y `ficha_usuario`. En la lista de usuarios, quien tiene ajustes propios muestra la etiqueta *+granular*.

## "Ver como" (solo Administrador)

En Admin → Usuarios, el rol Administrador tiene el botón **👁 Ver como** en cada usuario. Al pulsarlo, toda la página (inicio, formularios, panel, Mi cuenta…) se muestra exactamente como la vería esa persona, con una **franja amarilla fija** arriba ("Estás viendo como … · solo lectura · Salir de Ver como"). Sirve para comprobar quejas tipo "a mí no me aparece el formulario X".

- Es **solo lectura**: el cliente bloquea cualquier escritura (insert/update/delete, RPCs de escritura, subida a storage, funciones, cambio de contraseña) con el mensaje "No disponible en modo Ver como". Exportar reportes y los botones de guardar quedan deshabilitados.
- La sesión sigue siendo la del admin: no se genera ningún token del otro usuario. El RPC `ver_como(p_usuario, p_evento)` (SECURITY DEFINER, exige el permiso `ver_como`) devuelve el perfil y rol del otro usuario; el estado vive en `sessionStorage` (`pm_ver_como`) y se pierde al cerrar la pestaña o al pulsar Salir.
- Queda en Auditoría como `ver_como_inicio` / `ver_como_fin` (quién vio a quién).
- El permiso `ver_como` es exclusivo del rol Administrador: no aparece en el editor de roles.
- Lo que se ve en "Ver como" está limitado por los permisos reales de quien lo usa (el admin ve todo, así que coincide con lo que verá el usuario).

## Exportación bloqueada y limpieza automática

Al pulsar **Exportar imagen** se muestra una pantalla de bloqueo (`bloquearPantalla` en `src/auth.js`) con un indicador de carga y el paso en curso (registrando, generando imagen, guardando en el historial, Discord). Mientras dura, no se puede pulsar nada, ni usar Esc/Enter/Tab/F5/Ctrl+R, y el navegador avisa si se intenta cerrar la pestaña. Al terminar aparece "✅ Reporte exportado" con el folio y un botón **Aceptar** (se cierra solo a los pocos segundos); el formulario queda **limpio** para que no se exporte dos veces el mismo reporte (en el formulario genérico se recarga la página). Si algo falla, el bloqueo se quita y el formulario conserva lo escrito.

## Borradores

Todos los formularios guardan automáticamente lo escrito en el navegador (`localStorage`, por usuario y formulario; las fotos no). Al volver a abrir el formulario aparece un aviso "Tienes un borrador sin exportar del…" con **Continuar** (restaura campos, cantidades de páginas/integrantes/vehículos) o **Descartar**. El borrador se borra al exportar con éxito o al pulsar Limpiar, y caduca a los 7 días.

## Seguridad operativa

- **Cierre por inactividad**: 7 días sin actividad (clic, teclado, scroll) cierran la sesión en todas las páginas protegidas; el login muestra el motivo. Se cambia en `INACTIVIDAD_MIN` (`src/auth.js`), y el texto que lo anuncia está además en `app-login.js`, `cuenta.html` y los manuales.
- **Cerrar sesión en todos mis dispositivos**: en Mi cuenta (revoca todos los refresh tokens del usuario).
- **Intentos de acceso con cuentas inactivas**: quedan en auditoría (`login_inactivo`, máximo uno por minuto por usuario) y el panel de Usuarios muestra un aviso con los de los últimos 7 días (requiere ver auditoría).
- **Exportar CSV**: botones en Historial y Auditoría; descargan lo que está filtrado (UTF-8 con BOM, separador `;`, abre directo en Excel).

## Resumen (estadísticas)

Pestaña **Resumen** del panel (permiso ver historial): periodo configurable (30 días por defecto), KPIs (reportes, por día, usuarios activos, bajas reportadas, reclutamientos, patrullajes, AKs tomados), reportes por día, por formulario, actividad por usuario, patrullajes por integrante, bajas reportadas por persona y reclutamientos por persona (con los nombres reclutados) (nombres que aparecen en Patrullaje y Toma de Territorio). Se calcula en el navegador a partir de `reportes_vista` (máximo 3000 reportes por consulta).

## Móvil

En pantallas angostas los formularios muestran una barra fija abajo con **Vista previa** (baja a la imagen) y **Exportar** (y lleva al mensaje de error si falta algo). Junto a cada selector de fotos hay un botón **📷 Cámara** que abre la cámara del celular directamente (los selectores normales siguen permitiendo elegir de la galería).

## PWA (instalar como app)

`manifest.webmanifest` + `sw.js` + iconos en `icons/` (generados desde `favicon.svg`). En **Mi cuenta › Instalar como app** aparece el botón de instalación (Android/Chrome/Edge) o las instrucciones para iPhone (Compartir → Añadir a pantalla de inicio). El service worker guarda el cascarón (páginas, estilos, scripts, plantillas, iconos): las páginas y scripts van **red primero** con caché de respaldo (los cambios llegan de inmediato; `build.mjs` cambia la versión del SW con cada build), las imágenes van **caché primero**; las llamadas a Supabase nunca se cachean. Sin conexión: las páginas ya visitadas abren; lo no visitado muestra `sin-conexion.html`. Iniciar sesión, exportar y ver historial requieren conexión.

## Ruta de aprendizaje

Cuatro etapas (`ruta.html` + `src/app-ruta.js`), iguales para todas las unidades y **solo guía**: no otorga ni quita permisos. Las tres primeras se calculan con datos que ya existen; la cuarta la firma el liderazgo.

- `ruta_marcas(usuario_id, paso)` — lo que la persona marca a mano. Solo escribe sobre sí misma.
- `ruta_firmas(usuario_id, etapa, firmado_por, nota)` — la firma de la etapa 4.
- `mi_ruta(usuario)` — datos crudos (reportes, aprobados, turnos cumplidos, participaciones, MFA, marcas, firma) más `activa`, `puedo_firmar`, `puedo_reiniciar` y `mi_nivel`. La página decide qué paso está hecho.
- `firmar_ruta(usuario, nota)` y `reiniciar_ruta(usuario)` — con sus candados; auditan `ruta_firmada` y `ruta_reiniciada`.

**Aviso al entrar.** `src/ruta-pasos.js` tiene la definición de las etapas y los ayudantes, compartidos por `app-ruta.js` y por `app-index.js`. El inicio llama a `mi_ruta()` solo si la sesión dice que la ruta está encendida para esa persona, y si `pendientes()` devuelve algo abre un `<dialog>` con la etapa en curso y lo que falta. Se muestra **en cada visita al inicio** mientras quede algo pendiente.

**Jerarquía de firma.** `roles.nivel_firma` (0 sin firma, 1 Auxiliar, 2 Co-Líder, 3 Líder) es explícita por rol y se edita en el panel: no se deduce del nombre del rol ni del `rango_pm`, porque cada unidad los llama distinto. `puedo_firmar_ruta()` permite firmar a quien tenga nivel **igual o menor** al propio, y solo el nivel 3 puede firmarse a sí mismo.

**Interruptor general.** `ajustes_globales` (clave `ruta_aprendizaje`) con RLS: lectura para cualquier perfil activo, escritura solo para el superadmin. Nace apagado. Mientras lo esté, `rutaVisible()` esconde el enlace del menú y del inicio, y la página solo la ve quien puede encenderla. `mi_sesion()` devuelve el estado para no consultar en cada página.

**Excepción por persona.** `ruta_usuario(usuario_id, activa, motivo, cambiado_por)`: sin fila se sigue el ajuste general, con fila manda la fila en los dos sentidos. `ruta_activa_para(usuario)` resuelve el estado efectivo y es lo que miran `mi_sesion`, `mi_ruta` y `firmar_ruta`. Se cambia con `ruta_para_usuario(usuario, activa, motivo)` — `activa = null` quita la excepción — que exige `puedo_gestionar_ruta()` (permiso de usuarios, misma organización y rol dentro de los permisos propios) y audita `ruta_usuario`.

## Reporte de actividad

Pestaña **Actividad** del panel (permiso `historial`). Responde a "quién está reportando y quién no", que es distinto de lo que mide el Resumen.

- `actividad(desde, hasta)` devuelve una fila por miembro activo de `mi_org()`, **incluidos los que no reportaron** (ceros). Cuentan como actividad los estados `aprobado` y `pendiente`; `devuelto` y `rechazado` van en columnas aparte. Calcula también días activos, bajas, patrullajes, reclutamientos, AKs, participaciones y la fecha del último reporte del periodo.
- Periodo: semana, mes o rango libre, con navegación ‹ ›. El **día en que empieza la semana** y los **mínimos esperados** (semanal y mensual) viven en `configuracion` clave `actividad`, por organización.
- Export a PDF/PNG con `dibujarActividad()` (en `resumen-export.js`, que ahora acepta `cab.titulo` y `cab.unidad`), CSV, y publicación manual a Discord con el resumen de los más activos y los pendientes.
- Tarea programada `actividad_semanal`: publica el balance de la semana que acaba de cerrar. `ejecutar_programada` quedó como envoltura de `ejecutar_programada_base` para no reescribir la función entera; **cuidado con los valores por defecto**, porque cron la llama con un solo argumento.

## Deuda conocida

- La clave de `configuracion` y la de `discord_canales` pasaron a ser únicas por organización; cualquier función SECURITY DEFINER que las lea debe filtrar por `org_id`.
- `supabase/schema.sql` quedó desactualizado frente al modelo multi-organización: sirve como referencia histórica, no para recrear la base desde cero. La fuente de verdad son las migraciones aplicadas en Supabase.
- Quedan funciones SQL pensadas para una sola organización (`expediente`, `ranking_calc`, `turnos_lista`, `ejecutar_programada`, insignias): funcionan porque hoy solo la PM las usa en serio, pero habrá que pasarlas por `mi_org()`.
- Las versiones de dos argumentos de `discord_enviar`, `discord_enviar_formulario` y `ejecutar_programada` quedaron renombradas a `*_obsoleta` para resolver una ambigüedad de sobrecarga; se pueden borrar cuando nadie las llame.
