'use strict';

const { createClient } = require('@supabase/supabase-js');

const url = process.env.V2_SUPABASE_URL;
const key = process.env.V2_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.V2_TEST_PASSWORD;

if (!url || !key || !password) {
  console.error('Defina V2_SUPABASE_URL, V2_SUPABASE_PUBLISHABLE_KEY e V2_TEST_PASSWORD apenas na sessão atual.');
  process.exit(2);
}

const users = [
  { email: 'testeadm@ufcg.com', perfil: 'administrador' },
  { email: 'testegestao@ufcg.com', perfil: 'gestao_municipal' },
  { email: 'testeubs@ufcg.com', perfil: 'aluno', solicitado: 'equipe_ubs' },
  { email: 'testeacs@ufcg.com', perfil: 'aluno', solicitado: 'acs' },
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
      (error.code === '42501' || /permission denied|row-level security/i.test(error.message ?? '')),
  );
}

async function readSyntheticClinicalRows(supabase, label) {
  const { data, error } = await supabase
    .from('pec_gestantes')
    .select('codigo,ubs_id,microarea_id')
    .like('codigo', 'HOM-%')
    .limit(20);

  if (error) {
    assert(isPermissionDenied(error), `${label}: erro clínico inesperado: ${error.message}`);
    return 'bloqueado por grant/RLS';
  }

  assert(Array.isArray(data), `${label}: retorno clínico inválido.`);
  assert(data.length === 0, `${label}: conseguiu visualizar ${data.length} registro(s) clínico(s) antes da autorização.`);
  return 'zero linhas por RLS';
}

async function verifyAnon() {
  const supabase = createTestClient();
  const clinical = await readSyntheticClinicalRows(supabase, 'ANON');
  console.log(`ANON | clínico=${clinical}: OK`);
}

async function verifyUser(item) {
  const supabase = createTestClient();
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: item.email,
    password,
  });

  assert(!authError, `${item.email}: login falhou: ${authError?.message}`);
  assert(authData.user?.id, `${item.email}: login não retornou usuário.`);

  const userId = authData.user.id;
  const { data: profiles, error: profileError } = await supabase
    .from('perfis')
    .select('perfil,perfil_solicitado,aprovacao_status,ubs_id,microarea_id')
    .eq('id', userId);

  assert(!profileError, `${item.email}: perfil falhou: ${profileError?.message}`);
  assert(Array.isArray(profiles) && profiles.length === 1, `${item.email}: perfil próprio não encontrado.`);

  const p = profiles[0];
  assert(p.perfil === item.perfil, `${item.email}: perfil divergente (${p.perfil}).`);
  if (item.solicitado) {
    assert(p.perfil_solicitado === item.solicitado, `${item.email}: solicitação divergente.`);
    assert(p.aprovacao_status === 'pendente', `${item.email}: deveria permanecer pendente.`);
    assert(p.ubs_id === null && p.microarea_id === null, `${item.email}: recebeu território antes da aprovação.`);
  }

  const clinical = await readSyntheticClinicalRows(supabase, item.email);
  console.log([
    item.email,
    `perfil=${p.perfil}`,
    `solicitado=${p.perfil_solicitado ?? '-'}`,
    `aprovacao=${p.aprovacao_status}`,
    `clínico=${clinical}`,
    'OK',
  ].join(' | '));

  await supabase.auth.signOut();
}

(async () => {
  try {
    await verifyAnon();
    for (const item of users) await verifyUser(item);
    console.log('\nRESULTADO: 5/5 cenários sem acesso clínico aprovados antes das aprovações.');
  } catch (error) {
    console.error(`\nRESULTADO: REPROVADO — ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
})();
