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
        /permission denied|row-level security/i.test(error.message ?? '')),
  );
}

async function expectPermissionDenied(label, promise) {
  const result = await promise;
  assert(result.error, `${label}: operação direta não retornou erro.`);
  assert(
    isPermissionDenied(result.error),
    `${label}: erro diferente de bloqueio de permissão ` +
      `(${result.error.code ?? '-'}: ${result.error.message ?? '-'}).`,
  );
}

async function verifyAnon() {
  const supabase = client();
  const randomId = crypto.randomUUID();

  await expectPermissionDenied(
    'ANON INSERT',
    supabase.from('visitas_acs_v21').insert({
      id: randomId,
      gestante_id: crypto.randomUUID(),
      acs_id: crypto.randomUUID(),
      ubs_id: crypto.randomUUID(),
      microarea_id: crypto.randomUUID(),
      observacao: 'HOM-DIRECT-ANON',
    }),
  );

  await expectPermissionDenied(
    'ANON UPDATE',
    supabase
      .from('visitas_acs_v21')
      .update({ observacao: 'HOM-DIRECT-ANON-UPDATE' })
      .eq('id', randomId),
  );

  await expectPermissionDenied(
    'ANON DELETE',
    supabase.from('visitas_acs_v21').delete().eq('id', randomId),
  );

  console.log('ANON | INSERT=negado | UPDATE=negado | DELETE=negado | OK');
}

async function verifyUser(email) {
  const supabase = client();

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({ email, password });

  assert(!authError, `${email}: login falhou: ${authError?.message}`);
  assert(authData.user?.id, `${email}: login não retornou usuário.`);

  const randomId = crypto.randomUUID();

  await expectPermissionDenied(
    `${email} INSERT`,
    supabase.from('visitas_acs_v21').insert({
      id: randomId,
      gestante_id: crypto.randomUUID(),
      acs_id: authData.user.id,
      ubs_id: crypto.randomUUID(),
      microarea_id: crypto.randomUUID(),
      observacao: `HOM-DIRECT-${email}`,
    }),
  );

  await expectPermissionDenied(
    `${email} UPDATE`,
    supabase
      .from('visitas_acs_v21')
      .update({ observacao: `HOM-DIRECT-UPDATE-${email}` })
      .eq('id', randomId),
  );

  await expectPermissionDenied(
    `${email} DELETE`,
    supabase.from('visitas_acs_v21').delete().eq('id', randomId),
  );

  console.log(
    `${email} | INSERT=negado | UPDATE=negado | DELETE=negado | OK`,
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
      '\nRESULTADO: 39/39 mutações diretas bloqueadas ' +
        '(anon + 12 usuários × INSERT/UPDATE/DELETE).',
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
