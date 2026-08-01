import './tokens.css';
import type { Session } from '@supabase/supabase-js';
// Subpath `/doors`: o índice de @neo/auth toca `process.env` e exigiria @types/node numa app
// de browser — o que faria `process.env` compilar calado no cliente. Ver src/doors.ts.
import { PORTAL_DOORS, doorForPath } from '@neo/auth/doors';
import { supabase } from './supabase';
import { safeNextPath } from './next';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const loading = $('auth-loading');
const gate = $('gate');
const doors = $('doors');
const doorMessage = $('door-message');
const sessionBar = $('session-bar');
const sessionUser = $('session-user');
const btnLogout = $<HTMLButtonElement>('btn-logout');

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

/**
 * Elemento de cada porta no HTML. A permissão vem de `PORTAL_DOORS` (@neo/auth), a mesma lista
 * que a borda usa — o hub não mantém a sua. Se uma porta nova entrar lá sem elemento aqui, o
 * `?` do lookup a ignora em vez de quebrar a tela.
 *
 * `/admin` NÃO é um card: é um link discreto na barra de sessão. A mecânica de mostrar/esconder
 * por permissão é a mesma — muda só onde o elemento mora. Ver o comentário no index.html.
 */
const DOOR_ELEMENT_BY_PREFIX: Record<string, string> = {
  '/dash': 'door-performance',
  '/maturity': 'door-maturity',
  '/nero': 'door-nero',
  '/admin': 'link-admin',
};

/**
 * Permissões GLOBAIS da pessoa, lidas AO VIVO do banco (não do cookie).
 *
 * O hub é o lugar onde a resposta precisa ser fresca: é ele quem re-emite o cookie e quem dá a
 * palavra final quando a borda recusa. Ler a claim aqui só repetiria o que a borda já leu, com
 * a mesma idade — e o ping-pong nunca terminaria.
 *
 * Falha devolve `null`, que o chamador trata como "não sei": mostra todas as portas em vez de
 * nenhuma. Uma porta que não deveria aparecer só custa um 302 de volta; esconder todas por
 * causa de um RPC intermitente faz o portal parecer vazio para quem tem acesso.
 */
async function fetchPerms(): Promise<string[] | null> {
  try {
    const { data, error } = await supabase.rpc('my_neo_claims');
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    const perms = (row as { perms?: unknown } | null)?.perms;
    return Array.isArray(perms) && perms.every((p) => typeof p === 'string') ? (perms as string[]) : null;
  } catch {
    return null;
  }
}

function showDoors(session: Session, perms: string[] | null) {
  loading.hidden = true;
  gate.hidden = true;
  doors.hidden = false;
  sessionBar.hidden = false;
  sessionUser.textContent = `Conectado como ${firstName(session)}`;

  for (const door of PORTAL_DOORS) {
    const el = document.getElementById(DOOR_ELEMENT_BY_PREFIX[door.prefix] ?? '');
    if (!el) continue;
    // `perms === null` = não consegui perguntar → mostra tudo (ver fetchPerms).
    el.hidden = perms !== null && !perms.includes(door.perm);
  }
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

// Emite o cookie neo_session (HttpOnly) que o Edge Middleware exige para servir /dash e
// /maturity. Melhor-esforço: sem ele o middleware devolve o usuário ao hub com ?next=.
async function establishNeoSession(session: Session): Promise<boolean> {
  try {
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    return response.ok;
  } catch {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  }
}

// Destino pós-login vindo do middleware (?next=/dash/...). Só caminhos internos das apps —
// nunca URL absoluta (anti open-redirect).
function pendingNext(): string | null {
  const next = new URLSearchParams(window.location.search).get('next');
  return safeNextPath(next);
}

/** A borda marca `negado=<perm>` quando a recusa foi por PERMISSÃO, não por falta de sessão. */
function deniedPerm(): string | null {
  return new URLSearchParams(window.location.search).get('negado');
}

/**
 * TRAVA DO PING-PONG.
 *
 * A autocura manda a pessoa de volta ao destino depois de re-emitir o cookie. Isso resolve o
 * caso normal (claim velha) e cria um caso patológico: se o cookie não CONSEGUE carregar a
 * claim — o teto de tamanho de `api/session.ts` derrubando as permissões, por exemplo —, a
 * borda recusa de novo, o hub re-emite de novo, e a pessoa fica presa num redirecionamento
 * infinito, que é pior do que uma negativa clara.
 *
 * A janela de 30s é o que separa os dois casos: um ping-pong acontece em segundos; voltar ao
 * mesmo destino horas depois é uso normal e não pode ficar bloqueado.
 */
const ATTEMPT_KEY = 'neo:next-attempt';
const ATTEMPT_WINDOW_MS = 30_000;

function attemptedRecently(next: string): boolean {
  try {
    const raw = sessionStorage.getItem(ATTEMPT_KEY);
    if (!raw) return false;
    const { path, at } = JSON.parse(raw) as { path?: string; at?: number };
    return path === next && typeof at === 'number' && Date.now() - at < ATTEMPT_WINDOW_MS;
  } catch {
    return false;
  }
}

function markAttempt(next: string) {
  try {
    sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ path: next, at: Date.now() }));
  } catch {
    // sessionStorage bloqueado (modo restrito): sem trava, mas o caminho normal segue.
  }
}

function clearAttempt() {
  try {
    sessionStorage.removeItem(ATTEMPT_KEY);
  } catch {
    /* idem */
  }
}

/** Mensagem na tela de portas quando um destino não pôde ser aberto. */
function showDoorMessage(message: string) {
  doorMessage.textContent = message;
  doorMessage.hidden = false;
}

// Decide o que mostrar a partir da sessão: autorizado → doors; logado-mas-não-autorizado → erro; sem sessão → form.
async function reconcile(session: Session | null) {
  if (!session) {
    showGate('form');
    return;
  }
  if (!(await isAllowed(session))) {
    await supabase.auth.signOut();
    showGate('form');
    showError('Este e-mail não tem acesso ao NEO. Use sua conta @lmmobilidade.com.br ou fale com o administrador.');
    return;
  }

  // Re-emite o cookie com as claims FRESCAS. É este passo que cura a claim velha — a pessoa
  // que acabou de ganhar um papel entra sem precisar refazer login.
  const sessionReady = await establishNeoSession(session);
  if (!sessionReady) {
    showGate('form');
    showError('Não foi possível estabelecer a sessão segura do NEO. Atualize a página e tente novamente.');
    return;
  }

  const perms = await fetchPerms();
  const next = pendingNext();
  if (!next) {
    clearAttempt();
    showDoors(session, perms);
    return;
  }

  const door = doorForPath(new URL(next, window.location.origin).pathname);
  // Sem dado fresco (RPC fora do ar), acredita no veredito da borda: insistir num destino que
  // ela acabou de recusar por permissão é garantir o ping-pong.
  const podeEntrar = !door
    ? true
    : perms !== null
      ? perms.includes(door.perm)
      : deniedPerm() === null;

  if (!podeEntrar) {
    clearAttempt();
    showDoors(session, perms);
    showDoorMessage(
      `Você não tem acesso a ${door?.label ?? 'essa área'}. Se precisar, peça a um administrador do NEO.`,
    );
    return;
  }

  if (attemptedRecently(next)) {
    // Tem a permissão e MESMO ASSIM voltou. Não é caso de permissão — é o cookie não estar
    // carregando a claim. A pessoa não tem como resolver, então a mensagem diz isso, e o
    // diagnóstico está no log de `/api/session`.
    clearAttempt();
    showDoors(session, perms);
    showDoorMessage(
      `Não foi possível abrir ${door?.label ?? 'essa área'} mesmo com a permissão concedida. ` +
        'Avise o time do NEO — o acesso está bloqueado por um problema técnico, não por permissão.',
    );
    return;
  }

  markAttempt(next);
  window.location.replace(next);
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

  // Portal de origem única: as portas são links normais (/dash/, /maturity/) — a sessão
  // Supabase vive no localStorage da mesma origem, sem handoff por fragment.

  btnResend.addEventListener('click', () => {
    if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
    codeStatus.classList.remove('ok');
    codeStatus.hidden = true;
    showGate('form');
    otpEmail.focus();
  });

  btnLogout.addEventListener('click', async () => {
    // Remove o cookie do middleware junto com a sessão Supabase.
    await fetch('/api/session', { method: 'DELETE' }).catch(() => {});
    await supabase.auth.signOut();
  });
}

void init();
