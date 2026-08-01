import { createClient } from '@supabase/supabase-js';

/**
 * MESMO projeto Supabase do MMA — o NEO tem um banco só. A sessão vem do localStorage da mesma
 * origem: o hub loga em `/`, e `/admin/` é a mesma origem, então não há handoff de token.
 *
 * SEM o genérico `Database`. O `types.ts` gerado vive no maturitymodel e tem ~1.500 linhas;
 * copiá-lo para cá criaria uma segunda cópia que envelhece sozinha — exatamente o problema que
 * o repo persegue nas cópias autocontidas do HMAC, só que sem o teste de contrato que as
 * guarda. As linhas que este app usa estão tipadas à mão em `rbac.ts`, que é uma superfície
 * pequena e explícita.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !anon) {
  // Falha alta e cedo. Um cliente Supabase com URL undefined "funciona" até a primeira
  // consulta, e aí o erro é um fetch para `undefined/rest/v1/...` que não diz nada.
  throw new Error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY são obrigatórias — ver .env.example',
  );
}

export const supabase = createClient(url, anon, {
  auth: { storage: localStorage, persistSession: true, autoRefreshToken: true },
});
