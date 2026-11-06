# Cómo trabajamos en este repo

Estándar de desarrollo de Zylarion (el mismo de `zylarion/zylarion-web` y `zylarion/baas`).

## Ramas

| Rama | Para qué | Se publica en | Cómo se llega |
|---|---|---|---|
| `main` | Lo que está en producción | `https://pmwasco.zylarion.io` (GitHub Pages) | Solo por PR |
| `feature/*`, `fix/*`, `security/*`, `chore/*`, `docs/*` | Trabajo | — | Sale de `main` |

**Nunca se hace push directo a `main`.** Pendiente (fase 3): `develop` con una copia de staging
contra el staging de UltimateBase.

## Ciclo

```bash
git switch main && git pull
git switch -c fix/formulario-bajas
# … cambios en src/ …
npm ci && npm run build      # actualiza js/
git commit -m "fix(reportes): validar el campo de bajas"
git push -u origin fix/formulario-bajas   # PR → main
```

Títulos de PR en [Conventional Commits](https://www.conventionalcommits.org/es/) (se validan en CI).
Merge: squash.

## Qué valida cada PR

1. Título en Conventional Commits.
2. `npm run build` funciona y `js/` es JavaScript válido.
3. Seguridad: secretos (gitleaks), dependencias (`npm audit`) y análisis estático (Semgrep sobre `src/` y `supabase/functions/`).
