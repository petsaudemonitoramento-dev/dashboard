'use strict';

const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.V2_SUPABASE_URL;
const key = process.env.V2_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.V2_TEST_PASSWORD;

if (!url || !key || !password) {
  console.error(
    'Defina V2_SUPABASE_URL, V2_SUPABASE_PUBLISHABLE_KEY e ' +
      'V2_TEST_PASSWORD somente nesta sessão.',
  );
  process.exit(2);
}

const emails = [
  'testeadm@ufcg.com',
  'testegestao@ufcg.com',
  'testeubs@ufcg.com',
  'testeacs@ufcg.com',
  'homologacao.equipe.pendente@ufcg.com',
  'homologacao.equipe.rejeitada@ufcg.com',
  'homologacao.equipe.romualdo@ufcg.com',
  'homologacao.acs.microarea02@ufcg.com',
  'homologacao.acs.romualdo@ufcg.com',
  'homologacao.aluno@ufcg.com',
  'homologacao.usuario.pendente@ufcg.com',
  'homologacao.usuario.inativo@ufcg.com',
];

function client() {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isBlocked(error) {
  return Boolean(
    error &&
      (
        error.code === '42501' ||
        error.code === 'PGRST106' ||
        /permission denied|row-level security|schema.*not exposed|invalid schema|must be one of/i.test(
          error.message ?? '',
        )
      ),
  );
}

async function expectBlocked(label, operation) {
  const result = await operation;

  assert(result.error, `${label}: operação não retornou erro.`);
  assert(
    isBlocked(result.error),
    `${label}: erro inesperado ` +
      `(${result.error.code ?? '-'}: ${result.error.message ?? '-'}).`,
  );
}

async function verifyActor(label, supabase) {
  const randomRowId = crypto.randomUUID();

  await expectBlocked(
    `${label} INSERT`,
    supabase.from('importacoes_pec_resumo').insert({
      id: randomRowId,
      ubs_id: crypto.randomUUID(),
      usuario_id: crypto.randomUUID(),
      arquivo_nome: `homologacao_direta_${label}.csv`,
      arquivo_sha256: 'f'.repeat(64),
      linha_cabecalho: 1,
      total_linhas: 0,
      mapeamento: {},
      avisos: [],
    }),
  );

  await expectBlocked(
    `${label} UPDATE`,
    supabase
      .from('importacoes_pec_resumo')
      .update({ status: 'falhou' })
      .eq('id', crypto.randomUUID()),
  );

  await expectBlocked(
    `${label} DELETE`,
    supabase
      .from('importacoes_pec_resumo')
      .delete()
      .eq('id', crypto.randomUUID()),
  );

  await expectBlocked(
    `${label} RPC private.importar_pec`,
    supabase.schema('private').rpc('importar_pec', {
      p_ubs_id: crypto.randomUUID(),
      p_usuario_id: crypto.randomUUID(),
      p_arquivo_nome: `homologacao_rpc_${label}.csv`,
      p_arquivo_sha256: '0'.repeat(64),
      p_linha_cabecalho: 1,
      p_mapeamento: {},
      p_linhas: [],
      p_avisos: [],
    }),
  );

  console.log(
    `${label} | INSERT=negado | UPDATE=negado | DELETE=negado | ` +
      'RPC privada=bloqueada | OK',
  );
}

async function verifyAnon() {
  const supabase = client();
  await verifyActor('ANON', supabase);
}

async function verifyUser(email) {
  const supabase = client();

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({ email, password });

  assert(!authError, `${email}: login falhou: ${authError?.message}`);
  assert(authData.user?.id, `${email}: login não retornou usuário.`);

  await verifyActor(email, supabase);
  await supabase.auth.signOut();
}

(async () => {
  try {
    await verifyAnon();

    for (const email of emails) {
      await verifyUser(email);
    }

    console.log(
      '\nRESULTADO: 39/39 mutações diretas bloqueadas ' +
        '(anon + 12 usuários × INSERT/UPDATE/DELETE).',
    );
    console.log(
      'RESULTADO: 13/13 tentativas de executar a função privada bloqueadas.',
    );
  } catch (error) {
    console.error(
      `\nRESULTADO: REPROVADO — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
})();
