import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const loading = $('auth-loading');
const gate = $('gate');
const doors = $('doors');
const sessionBar = $('session-bar');
const sessionUser = $('session-user');
const btnLogout = $<HTMLButtonElement>('btn-logout');
const doorPerformance = $<HTMLAnchorElement>('door-performance');
const doorMaturity = $<HTMLAnchorElement>('door-maturity');

// Login (Magic Link)
const formView = $('gate-form-view');
const sentView = $('gate-sent-view');
const otpForm = $<HTMLFormElement>('otp-form');
const otpEmail = $<HTMLInputElement>('otp-email');
const btnSend = $<HTMLButtonElement>('btn-send');
const gateStatus = $('gate-status');
const sentEmail = $('gate-sent-email');
const btnResend = $<HTMLButtonElement>('btn-resend');

const ALLOWED_DOMAIN = '@lmmobilidade.com.br';

function firstName(session: Session): string {
  const meta = session.user.user_metadata ?? {};
  const name: string = meta.full_name || meta.name || session.user.email || '';
  return name.split(/[\s@]/)[0] || 'você';
}

// Autorização: domínio corporativo OU exceção aprovada em neo_access (via RPC is_neo_allowed).
// O domínio cobre o caso comum sem round-trip; o RPC resolve as exceções e é resiliente a falha.
async function isAllowed(session: Session): Promise<boolean> {
  const email = (session.user.email || '').toLowerCase();
  if (email.endsWith(ALLOWED_DOMAIN)) return true;
  try {
    const { data, error } = await supabase.rpc('is_neo_allowed');
    return !error && data === true;
  } catch {
    return false;
  }
}

function showGate(view: 'form' | 'sent') {
  loading.hidden = true;
  gate.hidden = false;
  doors.hidden = true;
  sessionBar.hidden = true;
  formView.hidden = view !== 'form';
  sentView.hidden = view !== 'sent';
}

function showDoors(session: Session) {
  loading.hidden = true;
  gate.hidden = true;
  doors.hidden = false;
  sessionBar.hidden = false;
  sessionUser.textContent = `Conectado como ${firstName(session)}`;
}

function showError(message: string) {
  gateStatus.textContent = message;
  gateStatus.hidden = false;
}

// Decide o que mostrar a partir da sessão: autorizado → doors; logado-mas-não-autorizado → erro; sem sessão → form.
async function reconcile(session: Session | null) {
  if (!session) {
    showGate('form');
    return;
  }
  if (await isAllowed(session)) {
    showDoors(session);
  } else {
    await supabase.auth.signOut();
    showGate('form');
    showError('Este e-mail não tem acesso ao NEO. Use sua conta @lmmobilidade.com.br ou fale com o administrador.');
  }
}

async function init() {
  const { data } = await supabase.auth.getSession();
  await reconcile(data.session);

  // Dispara ao voltar do link mágico (SIGNED_IN) e ao sair (SIGNED_OUT).
  supabase.auth.onAuthStateChange((_event, session) => {
    void reconcile(session);
  });

  otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    gateStatus.hidden = true;
    const email = otpEmail.value.trim().toLowerCase();
    if (!email.endsWith(ALLOWED_DOMAIN)) {
      showError('Use um e-mail corporativo @lmmobilidade.com.br.');
      return;
    }
    btnSend.disabled = true;
    btnSend.textContent = 'Enviando…';
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/` },
    });
    btnSend.disabled = false;
    btnSend.textContent = 'Receber link de acesso';
    if (error) {
      showError(error.message);
      return;
    }
    sentEmail.textContent = email;
    showGate('sent');
  });

  // Handoff de sessão: hub e apps são origens diferentes (localStorage não é compartilhado),
  // então ao abrir uma app levamos a sessão no fragment (#), que ela consome e limpa no boot.
  // O fragment não é enviado ao servidor nem a logs; os tokens duram ~1h.
  const openApp = async (e: Event, baseUrl: string) => {
    e.preventDefault();
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (!s) { await reconcile(null); return; }
    const frag = `neo_at=${encodeURIComponent(s.access_token)}&neo_rt=${encodeURIComponent(s.refresh_token)}`;
    window.location.href = `${baseUrl.split('#')[0]}#${frag}`;
  };
  doorPerformance.addEventListener('click', (e) => void openApp(e, doorPerformance.href));
  doorMaturity.addEventListener('click', (e) => void openApp(e, doorMaturity.href));

  btnResend.addEventListener('click', () => {
    showGate('form');
    otpEmail.focus();
  });

  btnLogout.addEventListener('click', async () => {
    await supabase.auth.signOut();
  });
}

void init();
