// Configuración de Supabase.
// Las dos claves son PÚBLICAS (Project URL y anon public key): es seguro tenerlas en el repo.
// Las encuentras en Supabase → Project Settings → API.
export const SUPABASE_URL = 'https://rvwvnrqwlaudjgzvrzgf.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_02CX_XHARt2vV6AouHjQ-A_PEZfHViR';

// Dominio ficticio que convierte el nombre de usuario en el correo que usa Supabase Auth.
export const DOMINIO_USUARIOS = 'armywasco.local';

// Cloudflare Turnstile (clave de sitio, pública). Vacío = sin captcha en el login.
export const TURNSTILE_SITE_KEY = '0x4AAAAAAFYv4mcBFXtubNo9';
