'use strict';

const { createClient } = require('@supabase/supabase-js');

const url = process.env.V2_SUPABASE_URL;
const key = process.env.V2_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.V2_TEST_PASSWORD;

if (!url || !key || !password) {
  console.error('Defina V2_SUPABASE_URL, V2_SUPABASE_PUBLISHABLE_KEY e V2_TEST_PASSWORD apenas na sessão atual.');
  process.exit(2);
}

const expected = [
  {
    email: 'testeadm@ufcg.com',
    perfil: 'administrador',
    solicitado: null,
    aprovacao: 'aprovado',
    ubsNula: true,
    microareaNula: true,
  },
  {
    email: 'testegestao@ufcg.com',
    perfil: 'gestao_municipal',
    solicitado: null,
    aprovacao: 'aprovado',
    ubsNula: true,
    microareaNula: true,
  },
  {
    email: 'testeubs@ufcg.com',
    perfil: 'aluno',
    solicitado: 'equipe_ubs',
    aprovacao: 'pendente',
    ubsNula: true,
    microareaNula: true,
  },
  {
    email: 'testeacs@ufcg.com',
    perfil: 'aluno',
    solicitado: 'acs',
    aprovacao: 'pendente',
    ubsNula: true,
    microareaNula: true,
  },
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

async function verifyAnon() {
  const supabase = client();
  const { data, error } = await supabase
    .from('perfis')
    .select('id')
    .limit(5);

  assert(!error, `Consulta anon de perfis retornou erro inesperado: ${error.message}`);
  assert(Array.isArray(data) && data.length === 0, 'Anon conseguiu visualizar perfis.');

  const privateAttempt = await supabase
    .schema('private')
    .from('credenciais_profissionais')
    .select('usuario_id')
    .limit(1);

  assert(privateAttempt.error, 'Schema private ficou acessível anonimamente pela Data API.');
  console.log('ANON | perfis ocultos: OK | schema private bloqueado: OK');
}

async function verifyUser(item) {
  const supabase = client();
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: item.email,
    password,
  });

  assert(!authError, `${item.email}: login falhou: ${authError?.message}`);
  assert(authData.user?.id, `${item.email}: login não retornou usuário.`);

  const userId = authData.user.id;
  const { data: rows, error: profileError } = await supabase
    .from('perfis')
    .select([
      'id',
      'email',
      'nome_completo',
      'perfil',
      'status',
      'ativo',
      'cadastro_completo',
      'aprovacao_status',
      'perfil_solicitado',
      'ubs_id',
      'microarea_id',
    ].join(','))
    .eq('id', userId);

  assert(!profileError, `${item.email}: leitura do próprio perfil falhou: ${profileError?.message}`);
  assert(Array.isArray(rows) && rows.length === 1, `${item.email}: esperava exatamente um perfil próprio.`);

  const p = rows[0];
  assert(p.email === item.email, `${item.email}: e-mail divergente no perfil.`);
  assert(p.perfil === item.perfil, `${item.email}: perfil atual divergente (${p.perfil}).`);
  assert((p.perfil_solicitado ?? null) === item.solicitado, `${item.email}: perfil solicitado divergente.`);
  assert(p.aprovacao_status === item.aprovacao, `${item.email}: aprovação divergente (${p.aprovacao_status}).`);
  assert(p.status === 'ativo' && p.ativo === true && p.cadastro_completo === true,
    `${item.email}: estado ativo/cadastro completo divergente.`);
  assert((p.ubs_id === null) === item.ubsNula, `${item.email}: vínculo UBS inesperado.`);
  assert((p.microarea_id === null) === item.microareaNula, `${item.email}: vínculo de microárea inesperado.`);

  const privateAttempt = await supabase
    .schema('private')
    .from('credenciais_profissionais')
    .select('usuario_id')
    .limit(1);
  assert(privateAttempt.error, `${item.email}: schema private ficou acessível pela Data API.`);

  console.log([
    item.email,
    `login=OK`,
    `perfil=${p.perfil}`,
    `solicitado=${p.perfil_solicitado ?? '-'}`,
    `aprovacao=${p.aprovacao_status}`,
    `ubs=${p.ubs_id ? 'atribuída' : 'nula'}`,
    `microarea=${p.microarea_id ? 'atribuída' : 'nula'}`,
    `private=bloqueado`,
  ].join(' | '));

  await supabase.auth.signOut();
}

(async () => {
  try {
    await verifyAnon();
    for (const item of expected) await verifyUser(item);
    console.log('\nRESULTADO: 5/5 cenários aprovados (anon + 4 usuários principais).');
  } catch (error) {
    console.error(`\nRESULTADO: REPROVADO — ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
})();
