import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const loading = $('auth-loading');
const gate = $('gate');
const doors = $('doors');
const sessionBar = $('session-bar');
const sessionUser = $('session-user');
const gateStatus = $('gate-status');
const btnMicrosoft = $<HTMLButtonElement>('btn-microsoft');
const btnLogout = $<HTMLButtonElement>('btn-logout');

function firstName(session: Session): string {
  const meta = session.user.user_metadata ?? {};
  const name: string = meta.full_name || meta.name || session.user.email || '';
  return name.split(/[\s@]/)[0] || 'você';
}

function render(session: Session | null) {
  loading.hidden = true;
  gate.hidden = !!session;
  doors.hidden = !session;
  sessionBar.hidden = !session;
  if (session) sessionUser.textContent = `Conectado como ${firstName(session)}`;
}

function showError(message: string) {
  gateStatus.textContent = message;
  gateStatus.hidden = false;
}

// Erro devolvido pelo OAuth (ex.: conta fora do tenant lmmobilidade.com.br).
function oauthErrorFromUrl(): string | null {
  const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  const description = params.get('error_description') || params.get('error');
  return description ? description.replace(/\+/g, ' ') : null;
}

async function init() {
  const oauthError = oauthErrorFromUrl();

  const { data } = await supabase.auth.getSession();
  render(data.session);

  if (oauthError && !data.session) {
    showError(
      /denied|cancel/i.test(oauthError)
        ? 'Acesso não autorizado. Use uma conta @lmmobilidade.com.br.'
        : oauthError,
    );
    history.replaceState(null, '', location.pathname);
  }

  supabase.auth.onAuthStateChange((_event, session) => render(session));

  btnMicrosoft.addEventListener('click', async () => {
    btnMicrosoft.disabled = true;
    gateStatus.hidden = true;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'openid profile email',
        redirectTo: `${location.origin}/`,
      },
    });
    if (error) {
      btnMicrosoft.disabled = false;
      showError(error.message);
    }
    // Em sucesso o browser navega para o login da Microsoft.
  });

  btnLogout.addEventListener('click', async () => {
    await supabase.auth.signOut();
    render(null);
  });
}

void init();
