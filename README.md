# Policía Militar · Reportes — Army de Wasco

Sitio en GitHub Pages con acceso por usuario y contraseña, roles con permisos, panel de administración e historial de reportes. Backend: Supabase (Auth + Postgres + Storage).

Publicado en: https://jflorezwearkzo.github.io/army-wasco/

## Estructura

```
index.html            Inicio: lista los formularios que el rol del usuario puede usar
login.html            Ingreso con usuario y contraseña
cuenta.html           Mi cuenta: cambiar contraseña
admin/index.html      Panel de administración (pestañas según permisos)
auth.js, config.js    Cliente Supabase, sesión, permisos, guardado del historial
estilos.css           Estilos compartidos
reportes/<id>/        Cada formulario (index.html + plantilla.png)
supabase/schema.sql   Esquema de la base de datos (idempotente)
```

## Roles y permisos

Un rol es un conjunto de permisos más la lista de formularios a los que da acceso:

| Permiso | Qué permite |
|---|---|
| Gestión de usuarios | Crear usuarios, activarlos/desactivarlos, editar su nombre y asignar su rango militar |
| Asignación y creación de roles | Crear/editar/eliminar roles y asignar rol a los usuarios |
| Creación / gestión de reportes | Registrar formularios en el catálogo, ocultarlos o mostrarlos en el inicio |
| Ver historial de todos | Ver, descargar y eliminar cualquier reporte guardado |
| Acceso a formularios | "Todos" o una selección; sin acceso, el formulario no aparece ni se puede abrir |

Roles iniciales: **Administrador** (todo) y **Usuario** (solo llena reportes). Se pueden crear los que hagan falta desde el panel.

Las reglas se aplican en la base de datos (RLS), no solo en la interfaz.

## Flujo

1. El admin crea usuarios desde el panel (usuario, nombre, contraseña inicial, rol). No hay registro libre.
2. Cada usuario entra en `login.html`, ve solo sus formularios y cambia su contraseña en "Mi cuenta".
3. Al exportar un reporte, se descarga el PNG y además se guarda (datos + imagen) en el historial.

## Agregar un formulario nuevo

1. Crea `reportes/<id>/index.html` (copiando uno existente) con su plantilla.
2. En el panel → Formularios → Nuevo: id, título, ruta `reportes/<id>/`, icono y orden.
3. Da acceso al formulario en los roles que corresponda.

## Configuración de Supabase (ya hecha)

- Proyecto `army-wasco`; esquema aplicado desde `supabase/schema.sql`.
- `config.js` contiene la URL del proyecto y la clave pública (publishable), que es segura de exponer.
- Authentication → Providers → Email: **"Confirm email" desactivado** (los usuarios no tienen correo real; se usan `usuario@armywasco.local`).
- Restablecer una contraseña olvidada: Supabase → Authentication → Users → usuario → Reset password.
