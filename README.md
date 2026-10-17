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
5. **Vista previa** con datos de ejemplo y **Guardar**. Requiere el permiso **Creación de formularios (diseñador)** (`disenar_formularios`), independiente de creación/gestión de reportes. Cada guardado sube `version`; los reportes guardan `datos.plantilla_version`.

El formulario queda en `reportes/plantilla/?id=<id>` y se comporta como los demás (permisos por rol, folio y sello del servidor, historial, auditoría). Los cuatro formularios originales siguen en código; pueden recrearse en el diseñador si se quiere editarlos sin programar.

## Discord

Panel › Formularios › Editar › **Webhook de Discord** (requiere gestión de reportes). Al sellar un reporte de ese formulario, el navegador llama a la Edge Function `notificar-discord`, que verifica que quien llama puede ver el reporte, lee el webhook con la clave de servicio (nunca viaja al navegador), descarga la imagen del bucket y la publica en el canal con folio, fecha, quién reporta y resumen. Marca `reportes.discord_enviado_en` para no repetir y deja rastro en auditoría (`discord_publicado`). "Enviar prueba" manda un mensaje de verificación al canal. Si Discord falla, el reporte igual queda sellado y en el historial; el mensaje de éxito indica el motivo.

## Borradores

Todos los formularios guardan automáticamente lo escrito en el navegador (`localStorage`, por usuario y formulario; las fotos no). Al volver a abrir el formulario aparece un aviso "Tienes un borrador sin exportar del…" con **Continuar** (restaura campos, cantidades de páginas/integrantes/vehículos) o **Descartar**. El borrador se borra al exportar con éxito o al pulsar Limpiar, y caduca a los 7 días.

## Seguridad operativa

- **Cierre por inactividad**: 2 horas sin actividad (clic, teclado, scroll) cierran la sesión en todas las páginas protegidas; el login muestra el motivo.
- **Cerrar sesión en todos mis dispositivos**: en Mi cuenta (revoca todos los refresh tokens del usuario).
- **Intentos de acceso con cuentas inactivas**: quedan en auditoría (`login_inactivo`, máximo uno por minuto por usuario) y el panel de Usuarios muestra un aviso con los de los últimos 7 días (requiere ver auditoría).
- **Exportar CSV**: botones en Historial y Auditoría; descargan lo que está filtrado (UTF-8 con BOM, separador `;`, abre directo en Excel).

## Resumen (estadísticas)

Pestaña **Resumen** del panel (permiso ver historial): periodo configurable (30 días por defecto), KPIs (reportes, por día, usuarios activos, bajas reportadas, patrullajes, AKs tomados), reportes por día, por formulario, actividad por usuario y patrullajes por integrante (nombres que aparecen en Fin de Día y Toma de Territorio). Se calcula en el navegador a partir de `reportes_vista` (máximo 3000 reportes por consulta).

## Móvil

En pantallas angostas los formularios muestran una barra fija abajo con **Vista previa** (baja a la imagen) y **Exportar** (y lleva al mensaje de error si falta algo). Junto a cada selector de fotos hay un botón **📷 Cámara** que abre la cámara del celular directamente (los selectores normales siguen permitiendo elegir de la galería).
