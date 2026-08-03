'use strict';

const { createClient } = require('@supabase/supabase-js');

const url = process.env.V2_SUPABASE_URL;
const publishableKey = process.env.V2_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.V2_SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.V2_TEST_PASSWORD;

if (!url || !publishableKey || !serviceRoleKey || !password) {
  console.error(
    'Defina V2_SUPABASE_URL, V2_SUPABASE_PUBLISHABLE_KEY, ' +
      'V2_SUPABASE_SERVICE_ROLE_KEY e V2_TEST_PASSWORD apenas na sessão atual.',
  );
  process.exit(2);
}

const negativeEmails = [
  'homologacao.equipe.pendente@ufcg.com',
  'homologacao.equipe.rejeitada@ufcg.com',
  'homologacao.equipe.romualdo@ufcg.com',
  'homologacao.acs.microarea02@ufcg.com',
  'homologacao.acs.romualdo@ufcg.com',
  'homologacao.aluno@ufcg.com',
  'homologacao.usuario.pendente@ufcg.com',
  'homologacao.usuario.inativo@ufcg.com',
];

const scenarios = [
  {
    email: 'testeadm@ufcg.com',
    perfil: 'administrador',
    aprovacao: 'aprovado',
    status: 'ativo',
    ativo: true,
    expectedCodes: [],
  },
  {
    email: 'testegestao@ufcg.com',
    perfil: 'gestao_municipal',
    aprovacao: 'aprovado',
    status: 'ativo',
    ativo: true,
    expectedCodes: [],
  },
  {
    email: 'testeubs@ufcg.com',
    perfil: 'equipe_ubs',
    aprovacao: 'aprovado',
    status: 'ativo',
    ativo: true,
    expectedCodes: ['HOM-AAV-01', 'HOM-AAV-02', 'HOM-AAV-03'],
  },
  {
    email: 'testeacs@ufcg.com',
    perfil: 'acs',
    aprovacao: 'aprovado',
    status: 'ativo',
    ativo: true,
    expectedCodes: ['HOM-AAV-01', 'HOM-AAV-02'],
  },
  {
    email: 'homologacao.equipe.pendente@ufcg.com',
    perfil: 'aluno',
    solicitado: 'equipe_ubs',
    aprovacao: 'pendente',
    status: 'ativo',
    ativo: true,
    expectedCodes: [],
  },
  {
    email: 'homologacao.equipe.rejeitada@ufcg.com',
    perfil: 'aluno',
    solicitado: 'equipe_ubs',
    aprovacao: 'pendente',
    status: 'ativo',
    ativo: true,
    expectedCodes: [],
  },
  {
    email: 'homologacao.equipe.romualdo@ufcg.com',
    perfil: 'equipe_ubs',
    solicitado: 'equipe_ubs',
    aprovacao: 'aprovado',
    status: 'ativo',
    ativo: true,
    expectedCodes: ['HOM-RBF-01', 'HOM-RBF-02', 'HOM-RBF-03'],
  },
  {
    email: 'homologacao.acs.microarea02@ufcg.com',
    perfil: 'acs',
    solicitado: 'acs',
    aprovacao: 'aprovado',
    status: 'ativo',
    ativo: true,
    expectedCodes: ['HOM-AAV-03'],
  },
  {
    email: 'homologacao.acs.romualdo@ufcg.com',
    perfil: 'acs',
    solicitado: 'acs',
    aprovacao: 'aprovado',
    status: 'ativo',
    ativo: true,
    expectedCodes: ['HOM-RBF-01', 'HOM-RBF-02'],
  },
  {
    email: 'homologacao.aluno@ufcg.com',
    perfil: 'aluno',
    solicitado: 'aluno',
    aprovacao: 'aprovado',
    status: 'ativo',
    ativo: true,
    expectedCodes: [],
  },
  {
    email: 'homologacao.usuario.pendente@ufcg.com',
    perfil: 'aluno',
    solicitado: 'aluno',
    aprovacao: 'pendente',
    status: 'ativo',
    ativo: true,
    expectedCodes: [],
  },
  {
    email: 'homologacao.usuario.inativo@ufcg.com',
    perfil: 'aluno',
    solicitado: 'aluno',
    aprovacao: 'desativado',
    status: 'bloqueado',
    ativo: false,
    expectedCodes: [],
  },
];

function client(key) {
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

async function listAllAuthUsers(admin) {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    assert(!error, `Falha ao listar usuários Auth: ${error?.message}`);

    const batch = data?.users ?? [];
    users.push(...batch);

    if (batch.length < 100) break;
    page += 1;
  }

  return users;
}

async function normalizeNegativePasswords() {
  const admin = client(serviceRoleKey);
  const users = await listAllAuthUsers(admin);
  const byEmail = new Map(
    users.map((user) => [(user.email ?? '').toLowerCase(), user]),
  );

  for (const email of negativeEmails) {
    const user = byEmail.get(email);
    assert(user?.id, `Usuário Auth não encontrado: ${email}`);

    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
    });

    assert(!error, `Falha ao definir senha temporária de ${email}: ${error?.message}`);
  }

  console.log(
    `PREPARAÇÃO AUTH | ${negativeEmails.length} contas negativas atualizadas pelo Admin API | OK`,
  );
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
    return [];
  }

  assert(Array.isArray(data), `${label}: retorno clínico inválido.`);
  return data.map((row) => row.codigo);
}

async function verifyAnon() {
  const supabase = client(publishableKey);
  const codes = await readClinicalCodes(supabase, 'ANON');
  assert(codes.length === 0, `ANON visualizou: ${codes.join(', ')}`);
  console.log('ANON | clínico=0/bloqueado | OK');
}

async function verifyScenario(item) {
  const supabase = client(publishableKey);

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email: item.email,
      password,
    });

  assert(!authError, `${item.email}: login falhou: ${authError?.message}`);
  assert(authData.user?.id, `${item.email}: login não retornou usuário.`);

  const { data: rows, error: profileError } = await supabase
    .from('perfis')
    .select(
      'perfil,perfil_solicitado,aprovacao_status,status,ativo,ubs_id,microarea_id',
    )
    .eq('id', authData.user.id);

  assert(!profileError, `${item.email}: perfil falhou: ${profileError?.message}`);
  assert(Array.isArray(rows) && rows.length === 1, `${item.email}: perfil próprio inválido.`);

  const profile = rows[0];

  assert(profile.perfil === item.perfil, `${item.email}: perfil divergente.`);
  assert(
    (profile.perfil_solicitado ?? null) === (item.solicitado ?? null),
    `${item.email}: perfil solicitado divergente.`,
  );
  assert(
    profile.aprovacao_status === item.aprovacao,
    `${item.email}: aprovação divergente.`,
  );
  assert(profile.status === item.status, `${item.email}: status divergente.`);
  assert(profile.ativo === item.ativo, `${item.email}: campo ativo divergente.`);

  const codes = await readClinicalCodes(supabase, item.email);
  assert(
    arraysEqual(codes, item.expectedCodes),
    `${item.email}: esperado=[${item.expectedCodes.join(',')}] obtido=[${codes.join(',')}]`,
  );

  const privateAttempt = await supabase
    .schema('private')
    .from('credenciais_profissionais')
    .select('usuario_id')
    .limit(1);

  assert(privateAttempt.error, `${item.email}: schema private ficou acessível.`);

  console.log(
    [
      item.email,
      `perfil=${profile.perfil}`,
      `solicitado=${profile.perfil_solicitado ?? '-'}`,
      `aprovacao=${profile.aprovacao_status}`,
      `status=${profile.status}`,
      `ativo=${profile.ativo}`,
      `clínico=${codes.length}`,
      `códigos=${codes.length ? codes.join(',') : '-'}`,
      'private=bloqueado',
      'OK',
    ].join(' | '),
  );

  await supabase.auth.signOut();
}

(async () => {
  try {
    await normalizeNegativePasswords();
    await verifyAnon();

    for (const scenario of scenarios) {
      await verifyScenario(scenario);
    }

    console.log(
      `\nRESULTADO: ${scenarios.length + 1}/${scenarios.length + 1} ` +
        'cenários aprovados (anon + 12 usuários).',
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
