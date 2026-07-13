export interface SessionState {
  authenticated: boolean;
  configured: boolean;
}

/**
 * Consulta a sessão. Se o endpoint não existe (ex.: dev local sem serverless) ou o gate
 * não está configurado, consideramos "autenticado" para não travar o desenvolvimento.
 */
export async function checkSession(): Promise<SessionState> {
  try {
    const res = await fetch('/api/login', { method: 'GET' });
    if (!res.ok) return { authenticated: true, configured: false };
    const data = await res.json().catch(() => ({}));
    return { authenticated: data?.authenticated ?? true, configured: data?.configured ?? false };
  } catch {
    return { authenticated: true, configured: false };
  }
}

export async function login(password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/login', { method: 'DELETE' });
  } catch {
    /* ignore */
  }
}
