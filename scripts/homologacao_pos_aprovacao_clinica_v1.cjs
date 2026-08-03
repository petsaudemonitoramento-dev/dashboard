'use strict';

const { createClient } = require('@supabase/supabase-js');

const url = process.env.V2_SUPABASE_URL;
const key = process.env.V2_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.V2_TEST_PASSWORD;

if (!url || !key || !password) {
  console.error(
    'Defina V2_SUPABASE_URL, V2_SUPABASE_PUBLISHABLE_KEY e V2_TEST_PASSWORD apenas na sessão atual.',
  );
  process.exit(2);
}

const scenarios = [
  {
    email: 'testeadm@ufcg.com',
    perfil: 'administrador',
    solicitado: null,
    aprovacao: 'aprovado',
    ubsAtribuida: false,
    microareaAtribuida: false,
    expectedCodes: [],
  },
  {
    email: 'testegestao@ufcg.com',
    perfil: 'gestao_municipal',
    solicitado: null,
    aprovacao: 'aprovado',
    ubsAtribuida: false,
    microareaAtribuida: false,
    expectedCodes: [],
  },
  {
    email: 'testeubs@ufcg.com',
    perfil: 'equipe_ubs',
    solicitado: 'equipe_ubs',
    aprovacao: 'aprovado',
    ubsAtribuida: true,
    microareaAtribuida: false,
    expectedCodes: ['HOM-AAV-01', 'HOM-AAV-02', 'HOM-AAV-03'],
  },
  {
    email: 'testeacs@ufcg.com',
    perfil: 'acs',
    solicitado: 'acs',
    aprovacao: 'aprovado',
    ubsAtribuida: true,
    microareaAtribuida: true,
    expectedCodes: ['HOM-AAV-01', 'HOM-AAV-02'],
  },
];

function createTestClient() {
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
        /permission denied|row-level security|schema.*not exposed/i.test(
          error.message ?? '',
        )),
  );
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function arraysEqual(a, b) {
  const aa = sorted(a);
  const bb = sorted(b);
  return aa.length === bb.length && aa.every((value, index) => value === bb[index]);
}

async function readClinicalCodes(supabase, label) {
  const { data, error } = await supabase
    .from('pec_gestantes')
    .select('codigo')
    .like('codigo', 'HOM-%')
    .order('codigo', { ascending: true });

  if (error) {
    assert(
      isPermissionDenied(error),
      `${label}: erro clínico inesperado: ${error.message}`,
    );
    return { mode: 'bloqueado por grant/RLS', codes: [] };
  }

  assert(Array.isArray(data), `${label}: retorno clínico inválido.`);
  return {
    mode: `${data.length} linha(s) por RLS`,
    codes: data.map((row) => row.codigo),
  };
}

async function verifyAnon() {
  const supabase = createTestClient();
  const result = await readClinicalCodes(supabase, 'ANON');

  assert(
    result.codes.length === 0,
    `ANON visualizou registros clínicos: ${result.codes.join(', ')}`,
  );

  console.log(`ANON | clínico=${result.mode} | OK`);
}

async function verifyUser(item) {
  const supabase = createTestClient();

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email: item.email,
      password,
    });

  assert(!authError, `${item.email}: login falhou: ${authError?.message}`);
  assert(authData.user?.id, `${item.email}: login não retornou usuário.`);

  const userId = authData.user.id;

  const { data: rows, error: profileError } = await supabase
    .from('perfis')
    .select(
      [
        'perfil',
        'perfil_solicitado',
        'aprovacao_status',
        'status',
        'ativo',
        'cadastro_completo',
        'ubs_id',
        'microarea_id',
      ].join(','),
    )
    .eq('id', userId);

  assert(
    !profileError,
    `${item.email}: leitura do próprio perfil falhou: ${profileError?.message}`,
  );
  assert(
    Array.isArray(rows) && rows.length === 1,
    `${item.email}: esperava exatamente um perfil próprio.`,
  );

  const profile = rows[0];

  assert(
    profile.perfil === item.perfil,
    `${item.email}: perfil divergente (${profile.perfil}).`,
  );
  assert(
    (profile.perfil_solicitado ?? null) === item.solicitado,
    `${item.email}: perfil solicitado divergente.`,
  );
  assert(
    profile.aprovacao_status === item.aprovacao,
    `${item.email}: aprovação divergente (${profile.aprovacao_status}).`,
  );
  assert(
    profile.status === 'ativo' &&
      profile.ativo === true &&
      profile.cadastro_completo === true,
    `${item.email}: estado ativo/cadastro completo divergente.`,
  );
  assert(
    Boolean(profile.ubs_id) === item.ubsAtribuida,
    `${item.email}: vínculo UBS divergente.`,
  );
  assert(
    Boolean(profile.microarea_id) === item.microareaAtribuida,
    `${item.email}: vínculo de microárea divergente.`,
  );

  const clinical = await readClinicalCodes(supabase, item.email);

  assert(
    arraysEqual(clinical.codes, item.expectedCodes),
    `${item.email}: códigos clínicos divergentes. Esperado=[${item.expectedCodes.join(
      ', ',
    )}] Obtido=[${clinical.codes.join(', ')}]`,
  );

  const privateAttempt = await supabase
    .schema('private')
    .from('credenciais_profissionais')
    .select('usuario_id')
    .limit(1);

  assert(
    privateAttempt.error,
    `${item.email}: schema private ficou acessível pela Data API.`,
  );

  console.log(
    [
      item.email,
      `perfil=${profile.perfil}`,
      `aprovacao=${profile.aprovacao_status}`,
      `ubs=${profile.ubs_id ? 'atribuída' : 'nula'}`,
      `microarea=${profile.microarea_id ? 'atribuída' : 'nula'}`,
      `clínico=${clinical.codes.length}`,
      `códigos=${clinical.codes.length ? clinical.codes.join(',') : '-'}`,
      'private=bloqueado',
      'OK',
    ].join(' | '),
  );

  await supabase.auth.signOut();
}

(async () => {
  try {
    await verifyAnon();

    for (const scenario of scenarios) {
      await verifyUser(scenario);
    }

    console.log(
      '\nRESULTADO: 5/5 cenários pós-aprovação aprovados (anon + 4 usuários principais).',
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
