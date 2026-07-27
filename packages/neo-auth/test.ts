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
import {
  isScope,
  parseCookie as gateParseCookie,
  safeSecretEqual as gateSafeSecretEqual,
  verifyToken as gateVerifyToken,
} from '../../api/gate.ts';

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

  // ══════════════════════════════════════════════════════════════════════════
  // CONFUSÃO DE TOKEN (achado 4.2 do review de 2026-07-27)
  //
  // Os três cookies do portal (`neo_session`, `neo_tower`, `neo_nero`) eram assinados com o
  // MESMO `SESSION_SECRET`, e os verificadores só checavam assinatura + `exp`. Qualquer token
  // válido servia em QUALQUER trava — e ESTE ARQUIVO afirmava isso como comportamento
  // esperado, no caso 'emitido pela function de sessão' do bloco do gate.
  //
  // A correção é subchave por propósito (HKDF-SHA256, `info` = propósito). Não é só um campo
  // `purpose` no payload: com campo, a proteção depende de todo verificador lembrar de
  // conferi-lo, e são QUATRO lugares, três deles cópias autocontidas por imposição da Vercel.
  // Com subchave, a assinatura de outro propósito simplesmente não confere.
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n▶ Confusão de token entre propósitos é impossível');
  {
    const sessao = await signToken({ email: 'a@b.c', exp: future }, SECRET, 'neo_session');
    const tower = await signToken({ email: 'a@b.c', exp: future }, SECRET, 'tower');
    const nero = await signToken({ email: 'a@b.c', exp: future }, SECRET, 'nero');

    // Cada token vale no PRÓPRIO propósito...
    check('sessão vale como sessão', await verifyToken(sessao, SECRET, 'neo_session'));
    check('tower vale como tower', await verifyToken(tower, SECRET, 'tower'));
    check('nero vale como nero', await verifyToken(nero, SECRET, 'nero'));

    // ...e em NENHUM outro. Copiar o valor de um cookie para outro deixa de ser escalada.
    check('sessão NÃO vale como tower', !(await verifyToken(sessao, SECRET, 'tower')));
    check('sessão NÃO vale como nero', !(await verifyToken(sessao, SECRET, 'nero')));
    check('tower NÃO vale como sessão', !(await verifyToken(tower, SECRET, 'neo_session')));
    check('tower NÃO vale como nero', !(await verifyToken(tower, SECRET, 'nero')));
    check('nero NÃO vale como sessão', !(await verifyToken(nero, SECRET, 'neo_session')));
    check('nero NÃO vale como tower', !(await verifyToken(nero, SECRET, 'tower')));

    // A subchave é o que garante; o campo no payload é diagnóstico.
    check('payload carrega o propósito', (await readToken(nero, SECRET, 'nero'))?.purpose === 'nero');
  }

  console.log('\n▶ Formato ANTIGO (segredo plano) é recusado — quebra deliberada');
  {
    // Esta seção testava o oposto: que o token de HMAC plano PASSAVA, para não derrubar
    // sessões vivas na migração node:crypto → Web Crypto. Com a subchave por propósito o
    // formato mudou de novo, e agora recusar é o comportamento CORRETO — um token assinado com
    // o segredo cru não distingue propósito, que é exatamente o defeito.
    //
    // CONSEQUÊNCIA OPERACIONAL: ao subir isto, TODA sessão viva cai e todos refazem login
    // (OTP + senha de Torre/Nero). É o mesmo efeito de rotacionar `SESSION_SECRET`, já
    // documentado no SECRETS.md.
    const plano = legacyToken({ email: 'a@lmmobilidade.com.br', exp: future }, SECRET);
    check('token de segredo plano NÃO verifica como sessão', !(await verifyToken(plano, SECRET, 'neo_session')));
    check('token de segredo plano NÃO verifica como tower', !(await verifyToken(plano, SECRET, 'tower')));
    check('token de segredo plano NÃO verifica como nero', !(await verifyToken(plano, SECRET, 'nero')));

    // E a assinatura nova NÃO é mais igual à do HMAC plano — se voltasse a ser, a subchave
    // não estaria sendo usada.
    const novo = await signToken({ email: 'b@lmmobilidade.com.br', exp: future }, SECRET, 'neo_session');
    const [b64, sig] = novo.split('.');
    check('assinatura nova difere do HMAC de segredo plano', sig !== legacySign(b64, SECRET));
  }

  console.log('\n▶ Rejeições');
  {
    const valid = await signToken({ exp: future }, SECRET, 'neo_session');
    const [b64, sig] = valid.split('.');

    check('secret errado rejeita', !(await verifyToken(valid, OTHER_SECRET, 'neo_session')));
    check('expirado rejeita', !(await verifyToken(await signToken({ exp: past }, SECRET, 'neo_session'), SECRET, 'neo_session')));
    check('payload adulterado rejeita', !(await verifyToken(`${b64}x.${sig}`, SECRET, 'neo_session')));
    check('assinatura adulterada rejeita', !(await verifyToken(`${b64}.${sig.slice(0, -2)}xy`, SECRET, 'neo_session')));
    check('token sem ponto rejeita (sem lançar)', !(await verifyToken(b64, SECRET, 'neo_session')));
    check('token vazio rejeita (sem lançar)', !(await verifyToken('', SECRET, 'neo_session')));
    check('lixo base64 rejeita (sem lançar)', !(await verifyToken('%%%.###', SECRET, 'neo_session')));
    check('exp ausente rejeita', !(await verifyToken(await signToken({ email: 'x' } as never, SECRET, 'neo_session'), SECRET, 'neo_session')));
    // exp em SEGUNDOS (erro clássico) tem de ser tratado como expirado, não como válido.
    const secondsExp = Math.floor((Date.now() + 60_000) / 1000);
    check('exp em segundos rejeita (o contrato é ms)', !(await verifyToken(await signToken({ exp: secondsExp }, SECRET, 'neo_session'), SECRET, 'neo_session')));
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
      ['token válido', await signToken({ email: 'a@b.c', exp: future }, SECRET, 'neo_session'), SECRET],
      ['formato antigo (segredo plano)', legacyToken({ email: 'a@b.c', exp: future }, SECRET), SECRET],
      ['expirado', await signToken({ exp: past }, SECRET, 'neo_session'), SECRET],
      ['secret errado', await signToken({ exp: future }, SECRET, 'neo_session'), OTHER_SECRET],
      ['exp em segundos', await signToken({ exp: Math.floor(future / 1000) }, SECRET, 'neo_session'), SECRET],
      ['sem ponto', 'abcdef', SECRET],
      ['vazio', '', SECRET],
      ['lixo base64', '%%%.###', SECRET],
      ['assinatura adulterada', (await signToken({ exp: future }, SECRET, 'neo_session')).slice(0, -2) + 'xy', SECRET],
      // Os dois casos que importam para ESTE contrato: o middleware só protege /dash,
      // /maturity e /nero com o cookie de SESSÃO. Se a cópia dele divergir e voltar a aceitar
      // token de outro propósito, a senha da Torre passaria a abrir as apps.
      ['token de tower (não deve valer)', await signToken({ exp: future }, SECRET, 'tower'), SECRET],
      ['token de nero (não deve valer)', await signToken({ exp: future }, SECRET, 'nero'), SECRET],
    ];
    for (const [nome, token, secret] of casos) {
      const [pkg, mw] = await Promise.all([
        verifyToken(token, secret, 'neo_session'),
        mwVerifyToken(token, secret),
      ]);
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
    check('token emitido pela function passa no pacote', await verifyToken(emitido, SECRET, 'neo_session'));
    check('token emitido pela function passa no middleware', await mwVerifyToken(emitido, SECRET));
    // `makeToken` acrescenta `purpose: 'neo_session'` ao payload, então a igualdade byte a byte
    // só vale se o pacote assinar o MESMO objeto — inclusive o campo. É o que garante que as
    // duas implementações produzem o token idêntico, não só mutuamente aceitável.
    check(
      'token emitido é byte-idêntico ao do pacote',
      emitido === (await signToken(payload, SECRET, 'neo_session')),
      `function=${emitido.slice(0, 24)}… pacote=${(await signToken(payload, SECRET, 'neo_session')).slice(0, 24)}…`,
    );

    // E o inverso: token do pacote tem de ser aceito por quem consome.
    const doPacote = await signToken(payload, SECRET, 'neo_session');
    check('token do pacote passa no middleware', await mwVerifyToken(doPacote, SECRET));

    // Expirado emitido pela function tem de ser rejeitado pelos dois leitores.
    const velho = fnMakeToken({ exp: past }, SECRET);
    check('token expirado da function é rejeitado no pacote', !(await verifyToken(velho, SECRET, 'neo_session')));
    check('token expirado da function é rejeitado no middleware', !(await mwVerifyToken(velho, SECRET)));

    const jwt = `h.${Buffer.from(JSON.stringify({ email: 'e@f.g' })).toString('base64url')}.s`;
    check('emailFromJwt da function concorda com o pacote', fnEmailFromJwt(jwt) === emailFromJwt(jwt));
    check('emailFromJwt da function em lixo devolve vazio', fnEmailFromJwt('lixo') === '');
  }

  console.log('\n▶ Contrato: api/gate.ts (cópia autocontida) × @neo/auth');
  {
    // O gate LÊ o neo_session emitido por api/session e EMITE neo_tower/neo_nero, que o
    // próprio gate relê depois. Se qualquer um desses três divergir, a trava quebra.
    //
    // ⚠️ AQUI ESTAVA O CASO 'emitido pela function de sessão', que AFIRMAVA que o cookie de
    // sessão passava no verificador do gate — ou seja, o teste documentava a confusão de token
    // como comportamento esperado. Agora ele é o oposto: teste NEGATIVO.
    const casos: Array<[string, string, string]> = [
      ['token válido de sessão', await signToken({ email: 'a@b.c', exp: future }, SECRET, 'neo_session'), SECRET],
      ['formato antigo (segredo plano)', legacyToken({ email: 'a@b.c', exp: future }, SECRET), SECRET],
      ['emitido pela function de sessão', fnMakeToken({ exp: future }, SECRET), SECRET],
      ['expirado', await signToken({ exp: past }, SECRET, 'neo_session'), SECRET],
      ['secret errado', await signToken({ exp: future }, SECRET, 'neo_session'), OTHER_SECRET],
      ['sem ponto', 'abcdef', SECRET],
      ['vazio', '', SECRET],
      ['lixo base64', '%%%.###', SECRET],
    ];
    // Comparado no propósito `neo_session`, que é como o gate confirma a identidade NEO.
    for (const [nome, token, secret] of casos) {
      const pkg = await verifyToken(token, secret, 'neo_session');
      const gate = gateVerifyToken(token, secret, 'neo_session');
      check(`gate.verifyToken concorda: ${nome} (${pkg})`, pkg === gate, `pacote=${pkg} gate=${gate}`);
    }

    // O token que a function de sessão emite TEM de valer como sessão (é o mesmo formato)...
    const daSessao = fnMakeToken({ email: 'a@b.c', exp: future }, SECRET);
    check(
      'token da function de sessão vale como neo_session',
      gateVerifyToken(daSessao, SECRET, 'neo_session'),
    );
    // ...e NÃO pode abrir as travas de senha. Era exatamente isto que o caso antigo garantia
    // ao contrário: quem tinha sessão do portal passava no verificador do gate.
    check(
      'token da function de sessão NÃO abre a Torre',
      !gateVerifyToken(daSessao, SECRET, 'tower'),
    );
    check(
      'token da function de sessão NÃO abre o Nero',
      !gateVerifyToken(daSessao, SECRET, 'nero'),
    );

    // E o inverso: o cookie da Torre não serve como prova de identidade NEO.
    const daTorre = await signToken({ email: 'a@b.c', exp: future }, SECRET, 'tower');
    check('cookie da Torre NÃO vale como sessão no gate', !gateVerifyToken(daTorre, SECRET, 'neo_session'));
    check('cookie da Torre NÃO abre o Nero', !gateVerifyToken(daTorre, SECRET, 'nero'));

    // Node (gate, node:crypto) e Web Crypto (@neo/auth) têm de derivar a MESMA subchave nos
    // três propósitos — senão o cookie emitido por um não verifica no outro.
    for (const purpose of ['neo_session', 'tower', 'nero'] as const) {
      const tok = await signToken({ email: 'a@b.c', exp: future }, SECRET, purpose);
      check(
        `subchave HKDF bate entre node e Web Crypto: ${purpose}`,
        gateVerifyToken(tok, SECRET, purpose),
      );
    }

    for (const [nome, header] of [
      ['normal', 'neo_nero=abc.def'],
      ['malformado', 'neo_nero=%'],
      ['ausente', 'outro=1'],
    ] as Array<[string, string]>) {
      const pkg = parseCookie(header, 'neo_nero');
      const gate = gateParseCookie(header, 'neo_nero');
      check(`gate.parseCookie concorda: ${nome}`, pkg === gate, `pacote=${pkg} gate=${gate}`);
    }

    check('gate.safeSecretEqual: iguais', gateSafeSecretEqual('s3nh4', 's3nh4') === (await safeSecretEqual('s3nh4', 's3nh4')));
    check('gate.safeSecretEqual: diferentes', gateSafeSecretEqual('a', 'b') === (await safeSecretEqual('a', 'b')));
    check('gate.safeSecretEqual: tamanhos diferentes', gateSafeSecretEqual('a', 'aaaaaaaa') === false);

    // O escopo é o que separa TOWER_PASSWORD de NERO_PASSWORD e neo_tower de neo_nero.
    // Aceitar um escopo desconhecido abriria a porta para cookie/env inexistentes.
    check('isScope aceita tower', isScope('tower'));
    check('isScope aceita nero', isScope('nero'));
    check('isScope rejeita desconhecido', !isScope('admin'));
    check('isScope rejeita vazio/undefined', !isScope('') && !isScope(undefined));
    check('isScope rejeita array', !isScope(['tower']));
  }

  console.log(`\n${fail === 0 ? '✔' : '✖'} ${pass} passaram, ${fail} falharam\n`);
  process.exit(fail === 0 ? 0 : 1);
}

void main();
