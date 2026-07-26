/**
 * Testes do contrato de sessão. Rodar: `pnpm --filter @neo/auth test`
 *
 * O teste que mais importa é o de INTEROPERABILIDADE: os cookies `neo_session` que estão
 * vivos agora foram assinados pelo código antigo com `node:crypto`. Se o Web Crypto deste
 * pacote não verificar exatamente o mesmo formato, todo usuário logado é deslogado no
 * deploy. Aqui a assinatura antiga é reproduzida à mão e conferida contra a nova.
 *
 * Convenção do repo: script tsx com contagem de falhas (igual scripts/test-performance.ts
 * do Dash) — sem framework de teste novo.
 */
import crypto from 'node:crypto';
import {
  bearerFrom,
  emailFromJwt,
  parseCookie,
  readToken,
  safeSecretEqual,
  serializeCookie,
  signToken,
  verifyToken,
} from './src/index.ts';
// O middleware da raiz é autocontido por imposição da Vercel (ver o cabeçalho dele) e por
// isso mantém a própria cópia do HMAC. Importamos aqui para exigir que as duas
// implementações concordem — é o que impede a cópia de divergir em silêncio.
import {
  parseCookie as mwParseCookie,
  verifyToken as mwVerifyToken,
} from '../../middleware.ts';
// api/session.ts também é autocontida (as functions da Vercel não resolvem código
// compartilhado — ver o aviso no cabeçalho dela). Mesma ideia: o contrato é testado.
import { makeToken as fnMakeToken, emailFromJwt as fnEmailFromJwt } from '../../api/session.ts';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const SECRET = 'segredo-de-teste-32-bytes-aqui!!';
const OTHER_SECRET = 'outro-segredo-completamente-dif!';

/** Assinatura EXATAMENTE como api/session.ts e api/tower.ts faziam antes (node:crypto). */
function legacySign(payloadB64: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}
function legacyToken(payload: object, secret: string): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${b64}.${legacySign(b64, secret)}`;
}

async function main() {
  const future = Date.now() + 60_000;
  const past = Date.now() - 1;

  console.log('\n▶ Interoperabilidade com o formato legado (node:crypto ↔ Web Crypto)');
  {
    // 1. Token do código ANTIGO precisa passar na verificação NOVA (sessões vivas).
    const legacy = legacyToken({ email: 'a@lmmobilidade.com.br', exp: future }, SECRET);
    check('token legado (node:crypto) verifica no Web Crypto', await verifyToken(legacy, SECRET));
    const payload = await readToken(legacy, SECRET);
    check('payload do token legado é lido', payload?.email === 'a@lmmobilidade.com.br');

    // 2. Token do código NOVO precisa passar na verificação ANTIGA (rollback seguro).
    const fresh = await signToken({ email: 'b@lmmobilidade.com.br', exp: future }, SECRET);
    const [b64, sig] = fresh.split('.');
    check('token novo tem assinatura idêntica à do node:crypto', sig === legacySign(b64, SECRET));
  }

  console.log('\n▶ Rejeições');
  {
    const valid = await signToken({ exp: future }, SECRET);
    const [b64, sig] = valid.split('.');

    check('secret errado rejeita', !(await verifyToken(valid, OTHER_SECRET)));
    check('expirado rejeita', !(await verifyToken(await signToken({ exp: past }, SECRET), SECRET)));
    check('payload adulterado rejeita', !(await verifyToken(`${b64}x.${sig}`, SECRET)));
    check('assinatura adulterada rejeita', !(await verifyToken(`${b64}.${sig.slice(0, -2)}xy`, SECRET)));
    check('token sem ponto rejeita (sem lançar)', !(await verifyToken(b64, SECRET)));
    check('token vazio rejeita (sem lançar)', !(await verifyToken('', SECRET)));
    check('lixo base64 rejeita (sem lançar)', !(await verifyToken('%%%.###', SECRET)));
    check('exp ausente rejeita', !(await verifyToken(legacyToken({ email: 'x' }, SECRET), SECRET)));
    // exp em SEGUNDOS (erro clássico) tem de ser tratado como expirado, não como válido.
    const secondsExp = Math.floor((Date.now() + 60_000) / 1000);
    check('exp em segundos rejeita (o contrato é ms)', !(await verifyToken(legacyToken({ exp: secondsExp }, SECRET), SECRET)));
  }

  console.log('\n▶ parseCookie');
  {
    const h = 'foo=1; neo_session=abc.def; neo_tower=xyz';
    check('lê cookie do meio', parseCookie(h, 'neo_session') === 'abc.def');
    check('lê cookie do fim', parseCookie(h, 'neo_tower') === 'xyz');
    check('cookie ausente devolve null', parseCookie(h, 'nao_existe') === null);
    check('header nulo devolve null', parseCookie(null, 'neo_session') === null);
    check('header vazio devolve null', parseCookie('', 'neo_session') === null);
    // Regressão real: `neo_session=%` derrubava a function com 500 (decodeURIComponent lança).
    check('cookie malformado devolve null, não lança', parseCookie('neo_session=%', 'neo_session') === null);
    check('não casa prefixo de nome', parseCookie('xneo_session=v', 'neo_session') === null);
    check('tolera espaços', parseCookie('  neo_session = v ', 'neo_session') === 'v');
  }

  console.log('\n▶ safeSecretEqual');
  {
    check('senhas iguais', await safeSecretEqual('senha-correta', 'senha-correta'));
    check('senhas diferentes', !(await safeSecretEqual('senha-errada', 'senha-correta')));
    check('tamanhos diferentes', !(await safeSecretEqual('a', 'aaaaaaaaaaaaaaaaaaaa')));
    check('vazio vs preenchido', !(await safeSecretEqual('', 'senha')));
    check('unicode', await safeSecretEqual('sênha-çom-açento', 'sênha-çom-açento'));
  }

  console.log('\n▶ serializeCookie / bearerFrom / emailFromJwt');
  {
    const c = serializeCookie('neo_nero', 'tok', 43200);
    check('cookie tem HttpOnly+Secure+SameSite+Path', /HttpOnly/.test(c) && /Secure/.test(c) && /SameSite=Lax/.test(c) && /Path=\//.test(c));
    check('cookie tem Max-Age', /Max-Age=43200/.test(c));
    check('expiração usa Max-Age=0', /Max-Age=0/.test(serializeCookie('neo_nero', '', 0)));

    check('bearerFrom extrai token', bearerFrom('Bearer abc123') === 'abc123');
    check('bearerFrom sem prefixo devolve vazio', bearerFrom('abc123') === '');
    check('bearerFrom undefined devolve vazio', bearerFrom(undefined) === '');

    const jwt = `h.${Buffer.from(JSON.stringify({ email: 'c@lmmobilidade.com.br' })).toString('base64url')}.s`;
    check('emailFromJwt lê o e-mail', emailFromJwt(jwt) === 'c@lmmobilidade.com.br');
    check('emailFromJwt em lixo devolve null', emailFromJwt('nao-e-jwt') === null);
    check('emailFromJwt sem e-mail devolve null', emailFromJwt(`h.${Buffer.from('{}').toString('base64url')}.s`) === null);
  }

  // ── CONTRATO com a cópia autocontida do middleware ──
  // O Edge Middleware standalone da Vercel não bundleia imports, então middleware.ts tem a
  // própria cópia do HMAC. Este bloco é o que garante que a cópia não divirja: as duas
  // implementações têm de dar a MESMA resposta para o mesmo token.
  console.log('\n▶ Contrato: middleware.ts (cópia autocontida) × @neo/auth');
  {
    const casos: Array<[string, string, string]> = [
      ['token válido', await signToken({ email: 'a@b.c', exp: future }, SECRET), SECRET],
      ['token legado', legacyToken({ email: 'a@b.c', exp: future }, SECRET), SECRET],
      ['expirado', await signToken({ exp: past }, SECRET), SECRET],
      ['secret errado', await signToken({ exp: future }, SECRET), OTHER_SECRET],
      ['sem exp', legacyToken({ email: 'x' }, SECRET), SECRET],
      ['exp em segundos', legacyToken({ exp: Math.floor(future / 1000) }, SECRET), SECRET],
      ['sem ponto', 'abcdef', SECRET],
      ['vazio', '', SECRET],
      ['lixo base64', '%%%.###', SECRET],
      ['assinatura adulterada', (await signToken({ exp: future }, SECRET)).slice(0, -2) + 'xy', SECRET],
    ];
    for (const [nome, token, secret] of casos) {
      const [pkg, mw] = await Promise.all([verifyToken(token, secret), mwVerifyToken(token, secret)]);
      check(`verifyToken concorda: ${nome} (${pkg})`, pkg === mw, `pacote=${pkg} middleware=${mw}`);
    }

    const cookies: Array<[string, string]> = [
      ['normal', 'foo=1; neo_session=abc.def'],
      ['malformado', 'neo_session=%'],
      ['ausente', 'outro=1'],
      ['com espaços', '  neo_session = v '],
      ['prefixo parecido', 'xneo_session=v'],
    ];
    for (const [nome, header] of cookies) {
      const pkg = parseCookie(header, 'neo_session');
      const mw = mwParseCookie(header, 'neo_session');
      check(`parseCookie concorda: ${nome}`, pkg === mw, `pacote=${pkg} middleware=${mw}`);
    }
  }

  console.log('\n▶ Contrato: api/session.ts (cópia autocontida) × @neo/auth × middleware');
  {
    // O token que a function EMITE tem de ser aceito pelo middleware que o LÊ e pelo pacote.
    // É o caminho crítico do portal: emitir aqui e barrar ali = ninguém entra.
    const payload = { email: 'd@lmmobilidade.com.br', exp: future };
    const emitido = fnMakeToken(payload, SECRET);
    check('token emitido pela function passa no pacote', await verifyToken(emitido, SECRET));
    check('token emitido pela function passa no middleware', await mwVerifyToken(emitido, SECRET));
    check('token emitido é byte-idêntico ao do pacote', emitido === (await signToken(payload, SECRET)));

    // E o inverso: token do pacote tem de ser aceito por quem consome.
    const doPacote = await signToken(payload, SECRET);
    check('token do pacote passa no middleware', await mwVerifyToken(doPacote, SECRET));

    // Expirado emitido pela function tem de ser rejeitado pelos dois leitores.
    const velho = fnMakeToken({ exp: past }, SECRET);
    check('token expirado da function é rejeitado no pacote', !(await verifyToken(velho, SECRET)));
    check('token expirado da function é rejeitado no middleware', !(await mwVerifyToken(velho, SECRET)));

    const jwt = `h.${Buffer.from(JSON.stringify({ email: 'e@f.g' })).toString('base64url')}.s`;
    check('emailFromJwt da function concorda com o pacote', fnEmailFromJwt(jwt) === emailFromJwt(jwt));
    check('emailFromJwt da function em lixo devolve vazio', fnEmailFromJwt('lixo') === '');
  }

  console.log(`\n${fail === 0 ? '✔' : '✖'} ${pass} passaram, ${fail} falharam\n`);
  process.exit(fail === 0 ? 0 : 1);
}

void main();
