# Policía Militar · Reportes — Army de Wasco

Sitio estático (GitHub Pages) con la página de inicio **Policía Militar · Reportes** y los formatos de reporte de la unidad.

Publicado en: https://jflorezwearkzo.github.io/army-wasco/

## Estructura

```
index.html          Página de inicio: lista los reportes
reportes.json       Catálogo de reportes (alimenta la lista de inicio)
reportes/
  bajas/            Reporte de Bajas (index.html + plantilla.png)
  reclutamiento/    Reporte de Reclutamiento (index.html + plantilla.png)
```

## Reportes disponibles

| Reporte | Ruta | Descripción |
|---|---|---|
| Reporte de Bajas | `reportes/bajas/` | Llena el formato con fecha, emisor, hasta 10 abatidos y de 1 a 10 fotos; exporta PNG en alta resolución con anexo fotográfico. |
| Reporte de Reclutamiento | `reportes/reclutamiento/` | Fecha, emisor (rango + Rango PM: Auxiliar/Co-líder/Líder PM), oficial reclutado con rango y rango asignado PM (Oficial/Auxiliar PM/Co-Líder), notas y 1 foto de evidencia; exporta PNG en alta resolución con la foto a todo el ancho debajo. |

## Agregar un reporte nuevo

1. Crea la carpeta `reportes/<id>/` con su `index.html` (y su plantilla si la usa).
2. Añade una entrada en `reportes.json`:

```json
{
  "id": "<id>",
  "titulo": "Nombre del reporte",
  "descripcion": "Qué hace",
  "ruta": "reportes/<id>/",
  "icono": "📋",
  "creado": "AAAA-MM-DD",
  "estado": "activo"
}
```

`"estado": "proximo"` muestra la tarjeta deshabilitada como "Próximamente".

Todo se procesa en el navegador; no hay servidor ni se sube información a ningún lado.
