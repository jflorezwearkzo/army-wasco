// Configuración del backend (UltimateBase, compatible con el SDK de Supabase).
// Las dos claves son PÚBLICAS (Project URL y anon public key): es seguro tenerlas en el repo.
// Las encuentras en el panel de UltimateBase → API.
export const SUPABASE_URL = 'https://ultimatebase.zylarion.io';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogImJhYXMiLCAiaWF0IjogMTc5Mzg2ODMxMCwgImV4cCI6IDIxMDkyMjgzMTB9.EeHRuqKoIezSDvqRCZv0gw70Hteap98U9teb4j9enYw';

// Dominio ficticio que convierte el nombre de usuario en el correo que usa Supabase Auth.
export const DOMINIO_USUARIOS = 'armywasco.local';

// Cloudflare Turnstile (clave de sitio, pública). Vacío = sin captcha en el login.
export const TURNSTILE_SITE_KEY = '0x4AAAAAAFYv4mcBFXtubNo9';
