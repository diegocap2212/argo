import { createClient } from '@supabase/supabase-js';

// Mesmo projeto Supabase das demais apps NEO (Portal MMA / Performance Dash).
// A identidade é única; cada origem Vercel mantém sua própria sessão em localStorage.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    // 'implicit': o Magic Link traz o token direto no fragment da URL, sem depender do
    // navegador que pediu o código (PKCE quebrava ao abrir o link em outra aba/app, ou
    // quando o filtro de spam pré-visita o link e consome o token de uso único).
    flowType: 'implicit',
    detectSessionInUrl: true,
  },
});
