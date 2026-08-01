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
  doorForPath,
  emailFromJwt,
  hasClaims,
  hasPerm,
  parseCookie,
  PORTAL_DOORS,
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
  readPayload as mwReadPayload,
  decide as mwDecide,
  doorForPath as mwDoorForPath,
  DOORS as MW_DOORS,
} from '../../middleware.ts';
// api/session.ts também é autocontida (as functions da Vercel não resolvem código
// compartilhado — ver o aviso no cabeçalho dela). Mesma ideia: o contrato é testado.
import {
  makeToken as fnMakeToken,
  emailFromJwt as fnEmailFromJwt,
  parseClaims as fnParseClaims,
  fitsInCookie as fnFitsInCookie,
  MAX_COOKIE_VALUE_BYTES,
} from '../../api/session.ts';
import {
  isScope,
  parseCookie as gateParseCookie,
  safeSecretEqual as gateSafeSecretEqual,
  verifyToken as gateVerifyToken,
} from '../../api/gate.ts';
// api/authz.ts é a QUARTA cópia autocontida do HMAC (as functions da Vercel não resolvem
// código compartilhado). Mesmo contrato das outras três.
import {
  emailFromSession as authzEmailFromSession,
  parseCookie as authzParseCookie,
  isPermId,
  devBypassEnabled,
} from '../../api/authz.ts';

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

  // ══════════════════════════════════════════════════════════════════════════
  // CLAIMS DE AUTORIZAÇÃO NO COOKIE (etapa 3 do RBAC)
  //
  // `api/session.ts` passa a assar `roles`/`perms` no payload do `neo_session`. Três
  // propriedades precisam valer, e as três são testadas aqui:
  //
  //   1. A claim é ASSINADA. Se o payload pudesse ser editado sem invalidar a assinatura,
  //      qualquer pessoa se daria `neo.admin.access` no próprio cookie.
  //   2. AUSENTE ≠ VAZIO. Cookie de antes do RBAC (sem `perms`) tem de ser distinguível de
  //      cookie novo de quem não tem permissão nenhuma — o primeiro merece autocura pelo hub,
  //      o segundo merece "acesso negado". Confundir os dois derruba TODA sessão viva no deploy.
  //   3. As 3 cópias autocontidas continuam concordando com o pacote COM o campo novo. O
  //      payload cresce ~1 KB; nenhuma delas pode ter suposição de tamanho embutida.
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n▶ Claims: hasPerm / hasClaims');
  {
    const comPerms = { exp: future, perms: ['neo.admin.access', 'mma.cycle.homologate'] };
    // Montada por concatenação DE PROPÓSITO: `tests/perm-catalog.ts` varre o TS atrás de
    // `hasPerm(x, 'literal')` e exige que o literal exista no catálogo. Uma permissão
    // inexistente escrita como literal faria aquele teste falhar — com razão.
    const ausenteDoCatalogo = 'mma.cycle.' + 'nao-existe';

    check('hasPerm acha a permissão presente', hasPerm(comPerms, 'neo.admin.access'));
    check('hasPerm nega a ausente', !hasPerm(comPerms, ausenteDoCatalogo));
    check('hasPerm não casa por prefixo', !hasPerm({ exp: future, perms: ['neo.admin.access.x'] }, 'neo.admin.access'));
    check('hasPerm em payload sem claims é false', !hasPerm({ exp: future }, 'neo.admin.access'));
    check('hasPerm em null não lança', !hasPerm(null, 'neo.admin.access'));
    check('hasPerm em undefined não lança', !hasPerm(undefined, 'neo.admin.access'));

    // A distinção que sustenta a autocura da borda.
    check('hasClaims: claims assadas e vazias → true', hasClaims({ exp: future, perms: [] }));
    check('hasClaims: sem o campo → false', !hasClaims({ exp: future }));
    check('hasClaims: null → false', !hasClaims(null));
    check('perms vazio nega tudo', !hasPerm({ exp: future, perms: [] }, 'neo.admin.access'));
  }

  console.log('\n▶ Claims: sobrevivem ao token e são assinadas');
  {
    const perms = ['neo.admin.access', 'mma.cycle.homologate', 'mma.kaizen.write'];
    const roles = ['admin_geral'];
    const tok = await signToken({ email: 'a@b.c', exp: future, roles, perms }, SECRET, 'neo_session');

    const lido = await readToken(tok, SECRET, 'neo_session');
    check('perms voltam intactas do token', JSON.stringify(lido?.perms) === JSON.stringify(perms));
    check('roles voltam intactos do token', JSON.stringify(lido?.roles) === JSON.stringify(roles));
    check('hasPerm sobre o payload lido', hasPerm(lido, 'mma.cycle.homologate'));

    // A propriedade de segurança: escalada por edição do cookie é impossível.
    const [b64] = tok.split('.');
    const adulterado = JSON.parse(Buffer.from(b64, 'base64url').toString());
    adulterado.perms = [...perms, 'neo.matrix.manage'];
    const forjado = `${Buffer.from(JSON.stringify(adulterado)).toString('base64url')}.${tok.split('.')[1]}`;
    check('payload com permissão acrescentada NÃO verifica', !(await verifyToken(forjado, SECRET, 'neo_session')));
    check('e o middleware também recusa o forjado', !(await mwVerifyToken(forjado, SECRET)));
    check('e o gate também recusa o forjado', !gateVerifyToken(forjado, SECRET, 'neo_session'));

    // Token SEM claims continua válido — é o cookie de toda sessão viva hoje.
    const semClaims = await signToken({ email: 'a@b.c', exp: future }, SECRET, 'neo_session');
    check('token sem claims continua verificando', await verifyToken(semClaims, SECRET, 'neo_session'));
    check('token sem claims: perms é undefined, não []', (await readToken(semClaims, SECRET, 'neo_session'))?.perms === undefined);
  }

  console.log('\n▶ Contrato: token COM claims nas 3 cópias autocontidas');
  {
    // 26 permissões e 2 papéis: o tamanho real do catálogo semeado, não um caso de brinquedo.
    const perms = Array.from({ length: 26 }, (_, i) => `mma.dominio${i}.acao_de_nome_realista`);
    const payload = { email: 'pessoa.com.nome.longo@lmmobilidade.com.br', exp: future, roles: ['admin', 'am'], perms };

    const emitido = fnMakeToken(payload, SECRET);
    check('token com claims: function == pacote, byte a byte', emitido === (await signToken(payload, SECRET, 'neo_session')));
    check('token com claims passa no pacote', await verifyToken(emitido, SECRET, 'neo_session'));
    check('token com claims passa no middleware', await mwVerifyToken(emitido, SECRET));
    check('token com claims passa no gate como sessão', gateVerifyToken(emitido, SECRET, 'neo_session'));
    check('token com claims NÃO abre a Torre', !gateVerifyToken(emitido, SECRET, 'tower'));
    check('token com claims NÃO abre o Nero', !gateVerifyToken(emitido, SECRET, 'nero'));
    check('as 26 permissões voltam inteiras', (await readToken(emitido, SECRET, 'neo_session'))?.perms?.length === 26);
  }

  console.log('\n▶ api/session.ts: parseClaims (resposta do RPC my_neo_claims)');
  {
    // `returns table(...)` no PostgREST vem como ARRAY de uma linha.
    const linha = [{ roles: ['am'], perms: ['mma.cycle.homologate'] }];
    check('lê o formato do PostgREST (array de 1 linha)', fnParseClaims(linha)?.perms[0] === 'mma.cycle.homologate');
    check('lê também objeto direto', fnParseClaims({ roles: [], perms: ['x'] })?.perms[0] === 'x');
    check('sem papel nenhum devolve arrays vazios', JSON.stringify(fnParseClaims([{ roles: [], perms: [] }])) === '{"roles":[],"perms":[]}');
    check('roles ausente vira [] (perms é que manda)', JSON.stringify(fnParseClaims([{ perms: ['x'] }])?.roles) === '[]');

    // Resposta torta do banco não pode virar exceção nem claim inventada: null = "sem claims",
    // que é o caminho de autocura, e não "sem permissão", que é negação.
    check('perms ausente devolve null', fnParseClaims([{ roles: ['am'] }]) === null);
    check('perms não-array devolve null', fnParseClaims([{ perms: 'admin' }]) === null);
    check('perms com não-string devolve null', fnParseClaims([{ perms: ['ok', 42] }]) === null);
    check('array vazio devolve null', fnParseClaims([]) === null);
    check('null devolve null', fnParseClaims(null) === null);
    check('string devolve null', fnParseClaims('erro') === null);
    check('erro do PostgREST devolve null', fnParseClaims({ code: 'PGRST202', message: 'not found' }) === null);
  }

  console.log('\n▶ api/session.ts: teto do cookie');
  {
    // Cookie acima do limite do RFC 6265 é DESCARTADO em silêncio pelo browser — e sem
    // `neo_session` a pessoa não entra em nada. O corte tem de ser nas claims, nunca na sessão.
    const realista = fnMakeToken(
      { email: 'pessoa@lmmobilidade.com.br', exp: future, roles: ['admin_geral'], perms: Array.from({ length: 26 }, (_, i) => `mma.dominio${i}.acao_de_nome_realista`) },
      SECRET,
    );
    check('catálogo do tamanho de hoje cabe no cookie', fnFitsInCookie(realista), `${realista.length} bytes de token`);

    const absurdo = fnMakeToken(
      { email: 'pessoa@lmmobilidade.com.br', exp: future, roles: [], perms: Array.from({ length: 400 }, (_, i) => `mma.dominio${i}.acao_de_nome_realista`) },
      SECRET,
    );
    check('catálogo grande demais é detectado', !fnFitsInCookie(absurdo), `${absurdo.length} bytes de token`);
    check('o teto tem folga para os atributos do cookie', MAX_COOKIE_VALUE_BYTES < 4096);
    // E a saída de emergência tem de caber sempre: sessão sem claims é o fallback.
    check('sessão sem claims sempre cabe', fnFitsInCookie(fnMakeToken({ email: 'pessoa@lmmobilidade.com.br', exp: future }, SECRET)));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PORTAS E PRÉ-FILTRO DA BORDA (etapa 4 do RBAC)
  //
  // O mapa rota → permissão existe DUAS vezes: `PORTAL_DOORS` em @neo/auth (que o hub e o
  // Nero importam) e uma cópia inline em `middleware.ts` (que não pode importar nada). Uma
  // divergência aqui não quebra nada visivelmente — a borda passa a proteger a rota com a
  // permissão errada, e isso é indistinguível de "protegida" até alguém tentar entrar.
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n▶ Contrato: mapa de portas @neo/auth × middleware.ts');
  {
    check('as duas listas têm o mesmo tamanho', PORTAL_DOORS.length === MW_DOORS.length, `pacote=${PORTAL_DOORS.length} middleware=${MW_DOORS.length}`);
    for (const door of PORTAL_DOORS) {
      const mw = MW_DOORS.find((d) => d.prefix === door.prefix);
      check(`${door.prefix} → mesma permissão nos dois`, mw?.perm === door.perm, `pacote=${door.perm} middleware=${mw?.perm}`);
    }
    // E o casamento de caminho tem de concordar, inclusive nos casos de borda.
    for (const path of ['/dash', '/dash/', '/dash/x/y', '/maturity/squad/1', '/nero', '/admin/pessoas', '/dashboard', '/', '/admins', '/nerofoo', '/maturity']) {
      const pkg = doorForPath(path)?.perm ?? null;
      const mw = mwDoorForPath(path)?.perm ?? null;
      check(`doorForPath concorda: ${path} (${pkg})`, pkg === mw, `pacote=${pkg} middleware=${mw}`);
    }
    // `/dashboard` não é `/dash`. Casar por prefixo cru abriria rotas vizinhas por acidente.
    check('/dashboard NÃO é a porta do Dash', doorForPath('/dashboard') === null);
    check('/nerofoo NÃO é a porta do Nero', doorForPath('/nerofoo') === null);
    check('a raiz não é porta nenhuma', doorForPath('/') === null);
  }

  console.log('\n▶ Pré-filtro da borda: decide()');
  {
    const comPerm = { exp: future, perms: ['neo.dash.access'] };
    const semPerm = { exp: future, perms: ['neo.mma.access'] };
    const semClaims = { exp: future };

    check('sem payload → sem-sessao', mwDecide(null, 'neo.dash.access') === 'sem-sessao');
    check('com a permissão → passa', mwDecide(comPerm, 'neo.dash.access') === 'passa');
    check('sem a permissão → sem-perm', mwDecide(semPerm, 'neo.dash.access') === 'sem-perm');

    // A distinção que impede o deploy de deslogar todo mundo: cookie de ANTES do RBAC vai para
    // a autocura, não para "acesso negado".
    check('cookie sem claims → sem-claims (autocura)', mwDecide(semClaims, 'neo.dash.access') === 'sem-claims');
    check('claims assadas e VAZIAS → sem-perm, não sem-claims', mwDecide({ exp: future, perms: [] }, 'neo.dash.access') === 'sem-perm');

    // Rota fora do mapa: sessão válida basta. Inventar permissão aqui trancaria rota nova.
    check('rota sem porta mapeada → passa com sessão', mwDecide(comPerm, null) === 'passa');
    check('rota sem porta mapeada → ainda exige sessão', mwDecide(null, null) === 'sem-sessao');
  }

  console.log('\n▶ Contrato: middleware.readPayload × @neo/auth.readToken');
  {
    const perms = ['neo.dash.access', 'neo.admin.access'];
    const tok = await signToken({ email: 'a@b.c', exp: future, perms }, SECRET, 'neo_session');
    const doMw = await mwReadPayload(tok, SECRET);
    const doPkg = await readToken(tok, SECRET, 'neo_session');
    check('as duas leituras dão o mesmo email', doMw?.email === doPkg?.email);
    check('as duas leituras dão as mesmas perms', JSON.stringify(doMw?.perms) === JSON.stringify(doPkg?.perms));

    for (const [nome, token, secret] of [
      ['expirado', await signToken({ exp: past }, SECRET, 'neo_session'), SECRET],
      ['secret errado', tok, OTHER_SECRET],
      ['token de tower', await signToken({ exp: future }, SECRET, 'tower'), SECRET],
      ['lixo', '%%%.###', SECRET],
    ] as Array<[string, string, string]>) {
      check(`readPayload recusa: ${nome}`, (await mwReadPayload(token, secret)) === null);
    }
  }

  console.log('\n▶ api/authz.ts (4ª cópia autocontida)');
  {
    const perms = ['neo.nero.access'];
    const emitido = fnMakeToken({ email: 'pessoa@lmmobilidade.com.br', exp: future, perms }, SECRET);

    // O que /api/authz precisa do cookie é o E-MAIL — é ele o sujeito da pergunta ao banco.
    check('extrai o e-mail do cookie emitido pela sessão', authzEmailFromSession(emitido, SECRET) === 'pessoa@lmmobilidade.com.br');
    check('secret errado não extrai e-mail', authzEmailFromSession(emitido, OTHER_SECRET) === null);
    check('token expirado não extrai e-mail', authzEmailFromSession(fnMakeToken({ email: 'x@y.z', exp: past }, SECRET), SECRET) === null);
    // Um cookie do Nero (senha) não pode servir de identidade para o /api/authz — seria a
    // confusão de token de volta, agora no endpoint que decide o acesso ao próprio Nero.
    check('cookie de nero NÃO vale como sessão', authzEmailFromSession(await signToken({ email: 'x@y.z', exp: future }, SECRET, 'nero'), SECRET) === null);
    check('cookie de tower NÃO vale como sessão', authzEmailFromSession(await signToken({ email: 'x@y.z', exp: future }, SECRET, 'tower'), SECRET) === null);
    // Sessão anônima (sem e-mail no payload) não dá para autorizar: não há sujeito.
    check('payload sem e-mail devolve null', authzEmailFromSession(fnMakeToken({ exp: future }, SECRET), SECRET) === null);
    check('lixo devolve null sem lançar', authzEmailFromSession('%%%.###', SECRET) === null);

    for (const [nome, header] of [
      ['normal', 'neo_session=abc.def'],
      ['malformado', 'neo_session=%'],
      ['ausente', 'outro=1'],
    ] as Array<[string, string]>) {
      check(`authz.parseCookie concorda: ${nome}`, authzParseCookie(header, 'neo_session') === parseCookie(header, 'neo_session'));
    }

    check('isPermId aceita id válido', isPermId('neo.nero.access') && isPermId('mma.cycle.homologate'));
    check('isPermId recusa vazio e undefined', !isPermId('') && !isPermId(undefined));
    check('isPermId recusa segmento faltando', !isPermId('neo.nero'));
    check('isPermId recusa caractere estranho', !isPermId('neo.nero.access; drop') && !isPermId('neo/nero/access'));
    check('isPermId recusa string absurdamente longa', !isPermId('a.b.' + 'x'.repeat(200)));

    // O bypass de desenvolvimento tem de ser IMPOSSÍVEL na Vercel — inclusive em preview, que
    // é onde o resto do portal ainda abre por env ausente (achado NEO-004).
    check('bypass local exige a flag', !devBypassEnabled({}));
    check('bypass local funciona sem VERCEL', devBypassEnabled({ NEO_AUTHZ_DEV_ALLOW: '1' }));
    check('bypass NÃO funciona em preview da Vercel', !devBypassEnabled({ NEO_AUTHZ_DEV_ALLOW: '1', VERCEL: '1', VERCEL_ENV: 'preview' }));
    check('bypass NÃO funciona em produção', !devBypassEnabled({ NEO_AUTHZ_DEV_ALLOW: '1', VERCEL: '1', VERCEL_ENV: 'production' }));
  }

  console.log(`\n${fail === 0 ? '✔' : '✖'} ${pass} passaram, ${fail} falharam\n`);
  process.exit(fail === 0 ? 0 : 1);
}

void main();
