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

// Login (código OTP por e-mail — mais robusto que o link, que scanners de spam consomem)
const formView = $('gate-form-view');
const sentView = $('gate-sent-view');
const otpForm = $<HTMLFormElement>('otp-form');
const otpEmail = $<HTMLInputElement>('otp-email');
const btnSend = $<HTMLButtonElement>('btn-send');
const gateStatus = $('gate-status');
const sentEmail = $('gate-sent-email');
const btnResend = $<HTMLButtonElement>('btn-resend');
const codeForm = $<HTMLFormElement>('code-form');
const otpCode = $<HTMLInputElement>('otp-code');
const btnVerify = $<HTMLButtonElement>('btn-verify');
const codeStatus = $('code-status');
const btnResendCode = $<HTMLButtonElement>('btn-resend-code');

let pendingEmail = '';
let resendTimer: ReturnType<typeof setInterval> | null = null;

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

// Cooldown de 60s no "Reenviar código" — é o intervalo mínimo que o Supabase aceita entre
// dois envios de OTP; segurar o botão evita erro e deixa o tempo de espera explícito.
function startResendCooldown() {
  if (resendTimer) clearInterval(resendTimer);
  let left = 60;
  const tick = () => {
    if (left <= 0) {
      if (resendTimer) clearInterval(resendTimer);
      resendTimer = null;
      btnResendCode.disabled = false;
      btnResendCode.textContent = 'Reenviar código';
      return;
    }
    btnResendCode.disabled = true;
    btnResendCode.textContent = `Reenviar em ${left}s`;
    left -= 1;
  };
  tick();
  resendTimer = setInterval(tick, 1000);
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
    if (!email) return;
    btnSend.disabled = true;
    btnSend.textContent = 'Verificando…';
    // A allowlist decide quem pode receber o link: domínio @lmmobilidade OU exceção aprovada.
    const { data: allowed, error: allowErr } = await supabase.rpc('is_neo_email_allowed', { check_email: email });
    if (allowErr || allowed !== true) {
      btnSend.disabled = false;
      btnSend.textContent = 'Receber link de acesso';
      showError('Este e-mail não tem acesso ao NEO. Use sua conta @lmmobilidade.com.br ou fale com o administrador.');
      return;
    }
    btnSend.textContent = 'Enviando…';
    // shouldCreateUser: cria o usuário no 1º acesso. Sem emailRedirectTo o e-mail usa o código
    // ({{ .Token }}) em vez do link — imune ao scanner de spam que consumia o link de uso único.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    btnSend.disabled = false;
    btnSend.textContent = 'Receber código de acesso';
    if (error) {
      showError(error.message);
      return;
    }
    pendingEmail = email;
    sentEmail.textContent = email;
    showGate('sent');
    otpCode.value = '';
    codeStatus.hidden = true;
    startResendCooldown();
    otpCode.focus();
  });

  // Reenvia o código para o mesmo e-mail (a allowlist já foi validada no 1º envio).
  btnResendCode.addEventListener('click', async () => {
    if (!pendingEmail || btnResendCode.disabled) return;
    startResendCooldown();
    const { error } = await supabase.auth.signInWithOtp({
      email: pendingEmail,
      options: { shouldCreateUser: true },
    });
    codeStatus.classList.toggle('ok', !error);
    codeStatus.textContent = error
      ? 'Não foi possível reenviar agora. Aguarde um instante e tente de novo.'
      : 'Enviamos um novo código. Use sempre o do e-mail mais recente.';
    codeStatus.hidden = false;
  });

  // Verifica o código digitado (6 dígitos do e-mail) → cria a sessão.
  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    codeStatus.hidden = true;
    const token = otpCode.value.trim();
    if (token.length < 6 || !pendingEmail) return;
    btnVerify.disabled = true;
    btnVerify.textContent = 'Entrando…';
    // Tenta como OTP de e-mail e, se falhar, como magiclink — o código do Supabase pode ser
    // verificado por qualquer um dos dois tipos dependendo de como foi emitido.
    let error = (await supabase.auth.verifyOtp({ email: pendingEmail, token, type: 'email' })).error;
    if (error) {
      error = (await supabase.auth.verifyOtp({ email: pendingEmail, token, type: 'magiclink' })).error;
    }
    btnVerify.disabled = false;
    btnVerify.textContent = 'Entrar';
    if (error) {
      codeStatus.classList.remove('ok');
      codeStatus.textContent = 'Código inválido ou expirado. Peça um código novo e use o do e-mail mais recente.';
      codeStatus.hidden = false;
      return;
    }
    // Sucesso: onAuthStateChange(SIGNED_IN) dispara reconcile → mostra as portas.
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
    if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
    codeStatus.classList.remove('ok');
    codeStatus.hidden = true;
    showGate('form');
    otpEmail.focus();
  });

  btnLogout.addEventListener('click', async () => {
    await supabase.auth.signOut();
  });
}

void init();
