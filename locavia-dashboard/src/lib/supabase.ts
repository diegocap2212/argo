import { createClient } from '@supabase/supabase-js';

// Projeto Supabase compartilhado do NEO (o mesmo do hub e do Portal MMA). A identidade é única;
// a sessão nasce no hub e o Performance Dash a reusa (ou a recebe via postMessage no modo embed).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// Configurado apenas quando as envs existem. Sem elas (dev local), a auth é fail-open — paridade
// com o comportamento histórico do gate de senha.
export const supabaseConfigured = !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const supabase = createClient(
  SUPABASE_URL ?? 'https://placeholder.supabase.co',
  SUPABASE_PUBLISHABLE_KEY ?? 'placeholder-anon-key',
  { auth: { storage: localStorage, persistSession: true, autoRefreshToken: true, flowType: 'pkce' } },
);
