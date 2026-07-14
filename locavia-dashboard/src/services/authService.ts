import { supabase, supabaseConfigured } from '../lib/supabase';

// Portal NEO de origem única: o hub (login) vive em `/` na mesma origem — a sessão Supabase
// é compartilhada pelo localStorage, sem handoff por fragment.

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

/** Manda o usuário ao hub (raiz da origem) para autenticar — o Dash não tem login próprio. */
export function redirectToHub(): void {
  window.location.href = '/';
}

/** Encerra a sessão NEO (cookie do middleware + Supabase) e volta ao hub. */
export async function logout(): Promise<void> {
  await fetch('/api/session', { method: 'DELETE' }).catch(() => {});
  if (supabaseConfigured) await supabase.auth.signOut();
  redirectToHub();
}
