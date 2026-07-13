import { createClient } from '@supabase/supabase-js';

// Mesmo projeto Supabase das demais apps ARGO (Portal MMA / Performance Dash).
// A identidade é única; cada origem Vercel mantém sua própria sessão em localStorage.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'pkce',
  },
});
