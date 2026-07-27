/**
 * Redação de PII antes de o texto sair para a API do modelo.
 *
 * O PROBLEMA (achado 7.9 do review de 2026-07-27): a UI afirmava "nunca envie nomes/e-mails/
 * PII", mas `buildMemoriaContext` mandava `Stakeholder.nome`, `Decision.quem`, `Risk.dono`,
 * owner/steward/validador do catálogo, proveniência livre e o conteúdo integral de documentos.
 * O modal era EDUCAÇÃO, não controle: não havia detecção, mascaramento nem bloqueio no
 * servidor. Uma promessa de privacidade que o produto não cumpria é pior que não prometer.
 *
 * O QUE ISTO É: um piso, aplicado no ÚNICO ponto por onde o contexto passa. Pega os formatos
 * estruturados (CPF, CNPJ, e-mail, telefone) por regex, e pseudonimiza nomes de pessoas nos
 * campos onde o schema DIZ que há pessoa.
 *
 * O QUE ISTO NÃO É: detecção de PII em texto livre. Um nome escrito no meio de uma descrição
 * de risco não é detectável de forma confiável sem NER, e um NER errado dá falsa sensação de
 * cobertura. Por isso a copy da UI foi corrigida para descrever o que de fato acontece, em vez
 * de prometer o que nenhum regex entrega.
 */

/** CPF: 000.000.000-00 ou 11 dígitos seguidos. */
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
/** CNPJ: 00.000.000/0000-00 ou 14 dígitos. */
const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
/** Telefone BR: com ou sem +55, DDD entre parênteses, com ou sem hífen. */
const TELEFONE = /(?:\+?55\s?)?(?:\(?\d{2}\)?[\s.-]?)?9?\d{4}[\s.-]?\d{4}\b/g;

/**
 * Substitui identificadores estruturados por marcadores.
 *
 * A ORDEM importa: e-mail antes de telefone, senão a sequência de dígitos dentro de um e-mail
 * (`joao1998@…`) é comida pelo regex de telefone e o e-mail deixa de casar.
 */
export function redactStructuredPii(text: string): string {
  return text
    .replace(EMAIL, "[e-mail removido]")
    .replace(CPF, "[CPF removido]")
    .replace(CNPJ, "[CNPJ removido]")
    .replace(TELEFONE, "[telefone removido]");
}

/**
 * Pseudônimo ESTÁVEL para um nome de pessoa.
 *
 * Estável importa: o Nero precisa entender que o dono do risco R3 é a mesma pessoa que decidiu
 * D7 para raciocinar sobre concentração de responsabilidade. Trocar por "[nome removido]"
 * destruiria essa relação; trocar por um pseudônimo derivado do nome a preserva sem o nome sair.
 *
 * FNV-1a, não hash criptográfico: isto não protege contra quem tem a lista de nomes e quer
 * confirmar um palpite — protege contra o nome TRAFEGAR. Para o perímetro do modelo é o que
 * está em jogo. Se o requisito virar irreversibilidade, troque por HMAC com segredo.
 */
export function pseudonymize(nome: string): string {
  const limpo = nome.trim();
  if (!limpo) return "—";
  let h = 2166136261 >>> 0;
  for (let i = 0; i < limpo.length; i++) {
    h = Math.imul(h ^ limpo.charCodeAt(i), 16777619) >>> 0;
  }
  // 4 dígitos bastam para distinguir as pessoas de um projeto e mantêm o texto legível.
  return `Pessoa-${(h % 10000).toString().padStart(4, "0")}`;
}

/**
 * Campo que o SCHEMA declara como pessoa → pseudônimo. `null`/vazio vira "—".
 * Usado nos campos onde sabemos que há nome: Stakeholder.nome, Decision.quem, Risk.dono,
 * CatalogAsset.owner/steward/validadoPor.
 */
export function personField(valor: string | null | undefined): string {
  if (!valor || !valor.trim()) return "—";
  return pseudonymize(valor);
}

/**
 * Última barreira, aplicada ao contexto MONTADO. Pega PII que entrou por texto livre em
 * qualquer seção — descrição de risco, proveniência, trecho de documento.
 */
export function redactContext(context: string): string {
  return redactStructuredPii(context);
}
