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

function isPermissionDenied(error) {
  return Boolean(
    error &&
      (error.code === '42501' ||
        /permission denied|row-level security/i.test(
          error.message ?? '',
        )),
  );
}

async function expectPermissionDenied(label, operation) {
  const result = await operation;
  assert(result.error, `${label}: operação não retornou erro.`);
  assert(
    isPermissionDenied(result.error),
    `${label}: erro inesperado ` +
      `(${result.error.code ?? '-'}: ${result.error.message ?? '-'}).`,
  );
}

async function verifyAnon() {
  const supabase = client();
  const impossibleId = crypto.randomUUID();

  await expectPermissionDenied(
    'ANON UPDATE',
    supabase
      .from('pec_gestantes')
      .update({ exclusao_motivo: 'HOM-DIRECT-ANON' })
      .eq('id', impossibleId),
  );

  await expectPermissionDenied(
    'ANON DELETE',
    supabase
      .from('pec_gestantes')
      .delete()
      .eq('id', impossibleId),
  );

  console.log('ANON | UPDATE=negado | DELETE=negado | OK');
}

async function verifyUser(email) {
  const supabase = client();

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({ email, password });

  assert(!authError, `${email}: login falhou: ${authError?.message}`);
  assert(authData.user?.id, `${email}: login não retornou usuário.`);

  // O UUID não existe. Se a permissão direta fosse concedida,
  // a operação terminaria sem erro e sem alterar linha alguma.
  const impossibleId = crypto.randomUUID();

  await expectPermissionDenied(
    `${email} UPDATE`,
    supabase
      .from('pec_gestantes')
      .update({ exclusao_motivo: `HOM-DIRECT-${email}` })
      .eq('id', impossibleId),
  );

  await expectPermissionDenied(
    `${email} DELETE`,
    supabase
      .from('pec_gestantes')
      .delete()
      .eq('id', impossibleId),
  );

  const privateAttempt = await supabase
    .schema('private')
    .from('auditoria_exclusoes_gestantes')
    .select('id')
    .limit(1);

  assert(
    privateAttempt.error,
    `${email}: schema private ficou acessível pela Data API.`,
  );

  console.log(
    `${email} | UPDATE=negado | DELETE=negado | private=bloqueado | OK`,
  );

  await supabase.auth.signOut();
}

(async () => {
  try {
    await verifyAnon();

    for (const email of emails) {
      await verifyUser(email);
    }

    console.log(
      '\nRESULTADO: 26/26 mutações diretas bloqueadas ' +
        '(anon + 12 usuários × UPDATE/DELETE).',
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
