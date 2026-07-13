import { supabase, supabaseConfigured } from '../lib/supabase';

// URL do hub NEO (página de login única). Configurável por env; default = projeto Vercel do hub.
const HUB_URL = (import.meta.env.VITE_HUB_URL as string | undefined) || 'https://neo-hub.vercel.app';

/**
 * Consome a sessão passada pelo hub no fragment da URL (#neo_at=…&neo_rt=…) e a aplica.
 * Necessário porque hub e Dash são origens distintas (localStorage não é compartilhado).
 * Limpa o fragment em seguida para não deixar tokens na barra de endereços/histórico.
 */
export async function consumeNeoSession(): Promise<void> {
  if (!supabaseConfigured) return;
  const hash = window.location.hash;
  if (!hash.includes('neo_at=')) return;
  const p = new URLSearchParams(hash.slice(1));
  const access_token = p.get('neo_at');
  const refresh_token = p.get('neo_rt');
  if (access_token && refresh_token) {
    await supabase.auth.setSession({ access_token, refresh_token });
  }
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

/** Access token da sessão Supabase, para enviar como Bearer às functions autenticadas. */
export async function getAccessToken(): Promise<string | null> {
  if (!supabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Header de autorização para o fetch dos endpoints /api/* (vazio em dev sem Supabase). */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Há sessão válida? Em dev/local (sem Supabase) libera direto — paridade com o gate antigo. */
export async function hasSession(): Promise<boolean> {
  if (!supabaseConfigured) return true;
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

/** Manda o usuário ao hub para autenticar (o Dash não tem tela de login própria). */
export function redirectToHub(): void {
  window.location.href = HUB_URL;
}

/** Encerra a sessão e volta ao hub. */
export async function logout(): Promise<void> {
  if (supabaseConfigured) await supabase.auth.signOut();
  redirectToHub();
}
