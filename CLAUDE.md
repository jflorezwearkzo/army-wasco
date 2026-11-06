# Instrucciones para agentes en este repo (Army de Wasco · Policía Militar)

- Idioma del código y docs: español.
- Nunca push directo a `main`: rama de trabajo + PR (ver CONTRIBUTING.md). Merge a `main` = publicación en GitHub Pages (`pmwasco.zylarion.io`).
- Commits en Conventional Commits. **No** agregues líneas `Co-Authored-By` ni `Claude-Session` a los commits.
- El código legible está en `src/`; `js/` es la salida de `npm run build` (ofuscada). Se edita `src/` y se compila; ambos van en el commit.
- Backend: UltimateBase, proyecto `army` (`https://ultimatebase.zylarion.io/p/army`). Cambios de esquema con el conector (`apply_migration`, project `army`) y el mismo SQL en `supabase/migrations/<version>_<nombre>.sql`. Edge Functions en `supabase/functions/`.
- Nunca secretos en el repo: solo la llave anon y la clave de sitio de Turnstile, que son públicas. Los secretos de funciones van con `set_edge_function_secrets` o el panel.
- Nada de `innerHTML` con datos del usuario; toda entrada se valida también en la base (RLS) o en la función.
