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
manifest.webmanifest  PWA (nombre, iconos en icons/, atajos); sw.js service worker (versión inyectada por build.mjs); sin-conexion.html
admin/index.html      Panel de administración (pestañas según permisos)
src/                  Código JavaScript legible (auth.js, config.js y el script de cada página)
js/                   Código publicado: ofuscado a partir de src/ (no editar a mano)
build.mjs             Construcción: npm install && npm run build  (regenera js/ desde src/)
estilos.css           Estilos compartidos
reportes/<id>/        Cada formulario (index.html + plantilla.png)
supabase/schema.sql   Esquema de la base de datos (idempotente)
supabase/functions/   Edge Functions (reset-password, crear-usuario)
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

Roles iniciales: **Administrador** (todo) y **Usuario** (solo llena reportes). Se pueden crear los que hagan falta desde el panel.

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

## Protección del lado del cliente

- **CSP** (Content-Security-Policy en cada página): solo se ejecutan scripts del propio sitio y de cdn.jsdelivr.net, y solo se conecta a Supabase; bloquea scripts inyectados (XSS) y scripts incrustados.
- **Ofuscación**: `js/` se genera con javascript-obfuscator a partir de `src/`. Dificulta leer el código; no impide modificarlo. La seguridad real está en el servidor (RLS, triggers, sello de reportes).
- Flujo de cambio: editar en `src/` → `npm run build` → commit de `src/` y `js/`.

## Flujo

1. El admin crea usuarios desde el panel (usuario, nombre, contraseña inicial, rol). No hay registro libre.
2. Cada usuario entra en `login.html`, ve solo sus formularios y cambia su contraseña en "Mi cuenta".
3. En los formularios, la fecha arranca en hoy (editable con calendario); nombre, rango y Rango PM se toman del perfil y del rol y no son editables.
4. Al exportar, primero se registra el reporte en el servidor, que **sella** usuario, nombre, rango y Rango PM desde el perfil (ignora lo que envíe el navegador) y asigna un **folio** (`PM-000012`); luego la imagen se genera con el folio estampado y se adjunta al registro, una sola vez. Un reporte sellado no se puede modificar. Para verificar una imagen, se compara su folio con el historial.

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

## Exportar el Resumen (PDF o PNG)

En Admin → Resumen, el selector **PDF / Imagen PNG** y el botón **⬇ Exportar resumen** generan un reporte con el estilo de la página (`src/resumen-export.js`): cabecera, KPIs, barras por día y las tablas (por formulario, por usuario, patrullajes por integrante, bajas y reclutamientos por persona), con el periodo filtrado y quién lo generó. Se dibuja en canvas (A4, varias páginas si hace falta); el PDF se construye a mano (una imagen JPEG por página) sin librerías externas, y el PNG apila las páginas en una sola imagen.

## Panel → Usuarios (buscador, menú ⋯ y acciones en bloque)

- **Buscador** en vivo (usuario, nombre, rango, rol) con filtros *Todos / Activos / Inactivos / Ocultos / Sin rol* y por rol; contador "Mostrando X de Y".
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

Permisos **Turnos: asignar y editar** (`turnos`) y **Turnos: solo ver la agenda** (`ver_turnos`, abre la pestaña sin botones de edición). Admin → **Turnos**: agenda con vistas **Día / Semana / Mes** (‹ › Hoy; en Mes, clic en el número del día abre ese día), "＋ Asignar turno" (integrante con **buscador** por nombre/usuario/rango, fecha con calendario, hora inicio/fin, notas, repetir N semanas), clic en un turno para editar o eliminar. Los turnos pasados muestran ✅ si ese día existe Reporte de Fin de Día del integrante o ⏳ si no. Cada integrante ve "Mis próximos turnos" (14 días) en el inicio. Tabla `turnos`, RPC `turnos_lista`.

## Tablón de anuncios

Permisos **Anuncios: publicar y editar** (`anuncios`) y **Anuncios: solo ver** (`ver_anuncios`, ve la lista y el contador de leídos sin editar). Admin → **Anuncios**: crear/editar (título, contenido, **una imagen** opcional —bucket público `anuncios`, se muestra en el tablón y en el embed de Discord—, caducidad, fijar arriba, visible, publicar en Discord), contador de "leído por". En el inicio aparecen para todos; los no leídos salen como NUEVO con "Marcar como leído" (`anuncios_vistos`).

## Ranking mensual e insignias

`ranking.html` (enlace "Ranking" en la barra): podio por categoría (reportes, bajas, patrullajes, reclutamientos, AKs, participaciones), tabla completa ordenable, selector de mes y Salón de insignias. Solo cuentan reportes aprobados (RPC `ranking_mes`). La tarea `ranking_mensual` publica el top 3 del mes anterior en Discord el día 1 y otorga la insignia 🥇 de cada categoría (`insignias`).

## Tareas programadas (Automatización)

Admin → Automatización → Tareas programadas: **Recordatorio de turnos de hoy** (quién tiene turno y quién no ha reportado), **Cierre del día**, **Resumen semanal** (día y hora) y **Ranking mensual** (día 1). Cada una se activa/desactiva, se le fija la hora (Colombia) y tiene "▶ Ejecutar ahora". Corren dentro de Postgres con pg_cron y publican por pg_net en el canal de Discord correspondiente (`discord_canales`): no hay Edge Function ni secretos de por medio. RPCs `programar`, `ejecutar_programada`; configuración en `configuracion.programadas`; quedan en Auditoría como `programada_*`.

## Manuales de uso

`manuales.html` (enlace "Manuales" en la barra y "📖 Manuales de uso" en el panel): guías paso a paso por módulo, con la misma navegación del Reglamento. Cada sección declara `data-permisos` (`*` = todos; o lista de permisos) y `src/app-manuales.js` elimina las que el rol no puede usar; los bloques con `data-solo="<permiso>"` (o `superadmin`) se ocultan igual. Manuales: Inicio y tablón, Enviar un reporte, Mi cuenta y seguridad, Mi expediente y ranking (todos) · Usuarios, Roles y permisos, Formularios y diseñador, Revisión, Disciplina, Ascensos, Turnos, Anuncios, Historial y Resumen, Automatización, Auditoría (según permiso). Para añadir o cambiar un manual se edita el HTML de esa sección.

## Expediente por integrante

`expediente.html?id=<uuid>` (sin id: el propio; enlace "Mi expediente" en la barra y en Mi cuenta; en Admin desde el menú ⋯ de cada usuario). Muestra perfil y rol, rango y desde cuándo, KPIs (reportes aprobados, últimos 30 días, bajas, reclutamientos, patrullajes, AKs, participaciones como integrante, advertencias activas, pendientes/rechazados), sanciones, ascensos y reportes recientes. Los demás expedientes requieren `historial`, `usuarios` o `sanciones` (RPC `expediente`). Incluye la **foto del personaje** (clic en el círculo): imagen del personaje dentro del RP, **nunca una foto real**; el aviso aparece al subirla. Se recorta a 512×512 WebP y va al bucket público `avatares` (`perfiles.avatar_path`, RPC `fijar_avatar`); el propio usuario o quien tenga `usuarios` puede cambiarla o quitarla.

## Sanciones y advertencias

Permiso **Sanciones y advertencias** (`sanciones`). Se registran desde el expediente o desde Admin → **Disciplina** (buscador de integrante) (tipos: advertencia, sanción, suspensión, expulsión; motivo obligatorio; fecha). Nunca se borran: se **anulan** con motivo. Con **3 advertencias activas** el expediente y la pestaña muestran la alerta de expulsión. Cada registro publica un embed en el canal de Discord *avisos* (si está configurado) y queda en Auditoría (`sancion_<tipo>`, `sancion_anulada`). Tablas `sanciones`; RPCs `registrar_sancion`, `anular_sancion`.

## Ascensos

Todo cambio de rango queda en `ascensos` (trigger sobre `perfiles.rango`), con motivo y quién lo otorgó cuando se hace desde el expediente ("⬆ Cambiar rango", permiso `usuarios`; publica en Discord *avisos*). Admin → **Ascensos**: lista de elegibles al siguiente rango según **requisitos por rango** editables (días mínimos en el rango anterior y reportes aprobados desde el último ascenso; quien tiene advertencias activas no cumple). RPC `datos_ascensos`, tabla `requisitos_ascenso`.

## Revisión y aprobación de reportes

- Se activa **por formulario**: Admin → Formularios → Editar → "Requiere aprobación de un revisor" (badge *Con revisión* en la lista). Mientras no se active, todo funciona como antes (los reportes nacen aprobados).
- Con la opción activa, cada reporte nuevo queda **pendiente** (`reportes.estado`): se descarga y se guarda igual, pero no cuenta en el Resumen ni se publica en Discord hasta que alguien con el permiso **Revisar y aprobar reportes** (`aprobar_reportes`) lo apruebe. El autor lo ve en Mi cuenta → Mis reportes con la etiqueta y, si lo rechazan, con el motivo.
- Pestaña **Revisión** del panel: tarjetas con imagen, autor y resumen; Aprobar (comentario opcional, publica en Discord si el formulario tiene webhook) / Rechazar (motivo obligatorio) / Volver a pendiente. La pestaña muestra el número de pendientes. Historial tiene filtro y columna de estado; el CSV incluye estado, revisor y comentario.
- Servidor: trigger `reportes_estado_inicial`, RPC `revisar_reporte(id, estado, comentario)` (no permite revisar los propios salvo Administrador; audita `revision_aprobado/rechazado/pendiente`) y el trigger de inmutabilidad solo deja cambiar la revisión a través de ese RPC.

## Tema claro / oscuro

Toda la interfaz usa variables CSS (`estilos.css`: `--bg`, `--panel`, `--line2`, `--gold`…) y `js/tema.js` aplica el tema guardado (`localStorage.pm_tema`) antes de pintar. Se cambia desde la barra superior ("🌗 Tema"). Las imágenes de los reportes no cambian: se dibujan sobre sus plantillas.

## Fotos y almacenamiento

Las fotos se reducen en el navegador a 1600 px por lado antes de dibujarlas (`cargarFoto` en `src/auth.js`), lo que acelera la exportación en el celular. La imagen del reporte se descarga en PNG, pero en el historial se guarda en **WebP** (≈60-70 % más liviana; `blobParaHistorial`); en navegadores sin WebP (Safari) se guarda el PNG. Los nombres de descarga y la publicación en Discord respetan la extensión real.

## Canales de Discord y automatización

Admin → **Automatización** → Canales de Discord: webhooks por propósito y, debajo, los **canales por formulario** (`formularios_discord`, lo mismo que el campo del editor de Formularios, centralizado aquí con botón Probar); también (`discord_canales`: avisos, anuncios, ranking, resumen, recordatorios) con botón Probar. La Edge Function `notificar-general` (`{canal, texto, embed, prueba}`) publica en ellos; exige sesión con alguno de los permisos que generan avisos y audita como `discord_aviso`. En el cliente: `avisoDiscord(canal, {texto, embed})`.

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

- **Cierre por inactividad**: 2 horas sin actividad (clic, teclado, scroll) cierran la sesión en todas las páginas protegidas; el login muestra el motivo.
- **Cerrar sesión en todos mis dispositivos**: en Mi cuenta (revoca todos los refresh tokens del usuario).
- **Intentos de acceso con cuentas inactivas**: quedan en auditoría (`login_inactivo`, máximo uno por minuto por usuario) y el panel de Usuarios muestra un aviso con los de los últimos 7 días (requiere ver auditoría).
- **Exportar CSV**: botones en Historial y Auditoría; descargan lo que está filtrado (UTF-8 con BOM, separador `;`, abre directo en Excel).

## Resumen (estadísticas)

Pestaña **Resumen** del panel (permiso ver historial): periodo configurable (30 días por defecto), KPIs (reportes, por día, usuarios activos, bajas reportadas, reclutamientos, patrullajes, AKs tomados), reportes por día, por formulario, actividad por usuario, patrullajes por integrante, bajas reportadas por persona y reclutamientos por persona (con los nombres reclutados) (nombres que aparecen en Fin de Día y Toma de Territorio). Se calcula en el navegador a partir de `reportes_vista` (máximo 3000 reportes por consulta).

## Móvil

En pantallas angostas los formularios muestran una barra fija abajo con **Vista previa** (baja a la imagen) y **Exportar** (y lleva al mensaje de error si falta algo). Junto a cada selector de fotos hay un botón **📷 Cámara** que abre la cámara del celular directamente (los selectores normales siguen permitiendo elegir de la galería).

## PWA (instalar como app)

`manifest.webmanifest` + `sw.js` + iconos en `icons/` (generados desde `favicon.svg`). En **Mi cuenta › Instalar como app** aparece el botón de instalación (Android/Chrome/Edge) o las instrucciones para iPhone (Compartir → Añadir a pantalla de inicio). El service worker guarda el cascarón (páginas, estilos, scripts, plantillas, iconos): las páginas y scripts van **red primero** con caché de respaldo (los cambios llegan de inmediato; `build.mjs` cambia la versión del SW con cada build), las imágenes van **caché primero**; las llamadas a Supabase nunca se cachean. Sin conexión: las páginas ya visitadas abren; lo no visitado muestra `sin-conexion.html`. Iniciar sesión, exportar y ver historial requieren conexión.
