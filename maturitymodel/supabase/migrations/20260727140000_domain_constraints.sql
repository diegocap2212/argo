-- ============================================================================
-- Constraints de domínio: fazer o banco garantir o que o TypeScript já afirmava.
--
-- COMO ISTO APARECEU: ao consertar o typecheck do app (que era falso verde — `tsc --noEmit`
-- sobre um tsconfig com `files: []`), sobraram 5 erros reais, todos da mesma família:
--
--   src/types/mma.ts declara  `type AxisKey = "processo" | "produto" | "time"`
--   e `stage_number: 1 | 2 | 3 | 4`
--
--   mas no banco `axes.key` é `text unique not null` SEM check, e `stage_number` é `int`
--   SEM check. O tipo prometia um domínio que nada garantia. A saída fácil seria um `as
--   AxisKey` no hook — o que transforma a promessa numa mentira silenciosa: um valor novo
--   inserido à mão em `axes.key` passaria por todo o app tipado como se fosse válido, e
--   quebraria só na tela, longe da origem.
--
-- Mesma classe do achado 7.7 do review (no Nero: 113 campos `String`, 0 enums). Aqui o
-- conjunto é pequeno e estável, então CHECK resolve — sem precisar de enum de verdade.
--
-- Se estes CHECKs FALHAREM ao aplicar, é porque existe dado fora do domínio em produção.
-- Isso é informação, não obstáculo: significa que o app está tipado sobre uma premissa falsa.
-- ============================================================================
begin;

-- Os 3 eixos do modelo. Se um quarto eixo passar a existir, esta constraint E o tipo
-- `AxisKey` mudam no MESMO commit — que é exatamente o acoplamento desejado.
alter table public.axes drop constraint if exists axes_key_domain;
alter table public.axes
  add constraint axes_key_domain check (key in ('processo', 'produto', 'time'));

-- Estágios de maturidade: 1..4. `stages.number` é a fonte; as descrições referenciam.
alter table public.stages drop constraint if exists stages_number_domain;
alter table public.stages
  add constraint stages_number_domain check (number between 1 and 4);

alter table public.dimension_stage_descriptions
  drop constraint if exists dsd_stage_number_domain;
alter table public.dimension_stage_descriptions
  add constraint dsd_stage_number_domain check (stage_number between 1 and 4);

commit;
