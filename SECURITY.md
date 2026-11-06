# Seguridad

## Reportar una vulnerabilidad

Escribe a **security@zylarion.io**. No abras issues públicos. Respondemos en máximo 3 días hábiles.

## Modelo (resumen)

- Sitio estático (GitHub Pages) con CSP por página; sin servidor propio.
- Backend en UltimateBase (proyecto `army`): login con captcha (Turnstile) y MFA; registro cerrado
  (los usuarios los crea la app con la función `crear-usuario`); permisos por rol con RLS en cada tabla
  y en Storage.
- En el repo solo hay valores públicos: la llave anon de UltimateBase y la clave de sitio de Turnstile.
- CI de seguridad en cada PR y cada lunes (`.github/workflows/security.yml`).
