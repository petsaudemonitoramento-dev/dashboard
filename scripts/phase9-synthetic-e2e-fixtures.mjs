import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.PHASE9_TEST_SUPABASE_SECRET_KEY;
const databaseUrl = process.env.PHASE9_TEST_DATABASE_URL;

if (!apiUrl || !secretKey || !databaseUrl) {
  throw new Error("Missing ephemeral Phase 9 fixture configuration");
}

const api = new URL(apiUrl);
const database = new URL(databaseUrl);
if (
  api.hostname !== "127.0.0.1" ||
  api.port !== "54321" ||
  database.hostname !== "127.0.0.1" ||
  database.port !== "54322"
) {
  throw new Error("Refusing to seed a non-ephemeral Supabase environment");
}

const PASSWORD = "Phase9-CI-Only-123!";
const UBS_A = "00000000-0000-4000-8000-000000000101";
const UBS_C = "00000000-0000-4000-8000-000000000102";
const GESTANTE_A = "29000000-0000-4000-8000-000000000001";
const GESTANTE_B = "29000000-0000-4000-8000-000000000002";
const GESTANTE_C = "29000000-0000-4000-8000-000000000003";
const GESTANTE_REVOKED = "29000000-0000-4000-8000-000000000004";
const CLASSIFICATION_A = "39000000-0000-4000-8000-000000000001";
const CLASSIFICATION_B = "39000000-0000-4000-8000-000000000002";

const definitions = [
  {
    key: "a",
    email: "phase9-a@ci.invalid",
    name: "Profissional A Phase 9",
    profile: "equipe_ubs",
    status: "ativo",
    active: true,
    approval: "aprovado",
    requested: "equipe_ubs",
    ubsId: UBS_A,
    requestedUbsId: null,
    role: "medico",
  },
  {
    key: "b",
    email: "phase9-b@ci.invalid",
    name: "Profissional B Phase 9",
    profile: "equipe_ubs",
    status: "ativo",
    active: true,
    approval: "aprovado",
    requested: "equipe_ubs",
    ubsId: UBS_A,
    requestedUbsId: null,
    role: "enfermeiro",
  },
  {
    key: "revocable",
    email: "phase9-revocable@ci.invalid",
    name: "Profissional Revogável Phase 9",
    profile: "equipe_ubs",
    status: "ativo",
    active: true,
    approval: "aprovado",
    requested: "equipe_ubs",
    ubsId: UBS_A,
    requestedUbsId: null,
    role: "medico",
  },
  {
    key: "pending",
    email: "phase9-pending@ci.invalid",
    name: "Profissional Pendente Phase 9",
    profile: "aluno",
    status: "ativo",
    active: true,
    approval: "pendente",
    requested: "equipe_ubs",
    ubsId: null,
    requestedUbsId: UBS_A,
    role: null,
  },
  {
    key: "admin",
    email: "phase9-admin@ci.invalid",
    name: "Administrador Phase 9",
    profile: "administrador",
    status: "ativo",
    active: true,
    approval: "aprovado",
    requested: "administrador",
    ubsId: null,
    requestedUbsId: null,
    role: null,
  },
  {
    key: "withoutProfile",
    email: "phase9-no-profile@ci.invalid",
    name: "Sem Perfil Phase 9",
    skipProfile: true,
  },
  {
    key: "otherUbs",
    email: "phase9-other-ubs@ci.invalid",
    name: "Profissional Outra UBS Phase 9",
    profile: "equipe_ubs",
    status: "ativo",
    active: true,
    approval: "aprovado",
    requested: "equipe_ubs",
    ubsId: UBS_C,
    requestedUbsId: null,
    role: "enfermeiro",
  },
];

const admin = createClient(apiUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

for (const definition of definitions) {
  const { data, error } = await admin.auth.admin.createUser({
    email: definition.email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Could not create ${definition.key} fixture: ${error?.message ?? "unknown"}`);
  }
  definition.id = data.user.id;
}

const sql = postgres(databaseUrl, { max: 1 });
try {
  await sql.begin(async (transaction) => {
    await transaction`
      insert into public.ubs (
        id, nome, nome_abreviado, codigo_interno, municipio, uf, ativa
      ) values (
        ${UBS_C}::uuid,
        'UBS Sintética Outra Phase 9',
        'UBS P9-B',
        'CI-P9-002',
        'Campina Grande',
        'PB',
        true
      )
      on conflict (id) do update set ativa = true
    `;

    for (const definition of definitions.filter((item) => !item.skipProfile)) {
      await transaction`
        insert into public.perfis (
          id,
          nome_completo,
          email,
          perfil,
          status,
          ubs_id,
          ubs_solicitada_id,
          primeiro_acesso,
          ativo,
          cadastro_completo,
          aprovacao_status,
          perfil_solicitado,
          origem_cadastro,
          cargo_funcao,
          perfil_excluido_em
        ) values (
          ${definition.id}::uuid,
          ${definition.name},
          ${definition.email},
          ${definition.profile}::public.perfil_usuario,
          ${definition.status}::public.status_usuario,
          ${definition.ubsId}::uuid,
          ${definition.requestedUbsId}::uuid,
          false,
          ${definition.active},
          true,
          ${definition.approval},
          ${definition.requested},
          'phase9_ci',
          ${definition.role},
          null
        )
        on conflict (id) do update set
          nome_completo = excluded.nome_completo,
          email = excluded.email,
          perfil = excluded.perfil,
          status = excluded.status,
          ubs_id = excluded.ubs_id,
          ubs_solicitada_id = excluded.ubs_solicitada_id,
          ativo = excluded.ativo,
          cadastro_completo = excluded.cadastro_completo,
          aprovacao_status = excluded.aprovacao_status,
          perfil_solicitado = excluded.perfil_solicitado,
          cargo_funcao = excluded.cargo_funcao,
          perfil_excluido_em = null
      `;
    }

    const clinicalUsers = definitions.filter((item) =>
      ["a", "b", "revocable", "otherUbs"].includes(item.key)
    );
    for (const [index, definition] of clinicalUsers.entries()) {
      await transaction`
        insert into private.credenciais_profissionais (
          usuario_id,
          cargo_funcao,
          conselho,
          uf,
          numero_registro,
          categoria,
          situacao,
          decidido_em,
          decidido_por,
          fonte_verificacao
        ) values (
          ${definition.id}::uuid,
          ${definition.role},
          ${definition.role === "medico" ? "CRM" : "COREN"},
          'PB',
          ${`P9${index + 1}0001`},
          ${definition.role === "medico" ? "MEDICO" : "ENFERMEIRO"},
          'validado',
          now(),
          ${definitions.find((item) => item.key === "admin").id}::uuid,
          'phase9_ci'
        )
      `;
    }

    await transaction`
      insert into public.pec_gestantes (
        id, codigo, ubs_id, profissional_responsavel_id, risco_gestacional
      ) values
        (${GESTANTE_A}::uuid, 'GST-PHASE9-A', ${UBS_A}::uuid, ${definitions.find((item) => item.key === "a").id}::uuid, 'Risco habitual'),
        (${GESTANTE_B}::uuid, 'GST-PHASE9-B', ${UBS_A}::uuid, ${definitions.find((item) => item.key === "b").id}::uuid, 'Alto risco'),
        (${GESTANTE_C}::uuid, 'GST-PHASE9-C', ${UBS_C}::uuid, ${definitions.find((item) => item.key === "otherUbs").id}::uuid, 'Risco habitual'),
        (${GESTANTE_REVOKED}::uuid, 'GST-PHASE9-R', ${UBS_A}::uuid, ${definitions.find((item) => item.key === "revocable").id}::uuid, 'Risco habitual')
    `;

    await transaction`
      insert into public.classificacoes_risco_gestacional (
        id,
        gestante_id,
        instrumento_versao,
        trimestre,
        faixa_imc,
        classificacao,
        conduta_sugerida,
        profissional_id,
        profissional_nome_snapshot,
        perfil_snapshot,
        ubs_origem_profissional_id,
        ubs_origem_nome_snapshot,
        ubs_atendimento_id,
        ubs_atendimento_nome_snapshot
      ) values
        (
          ${CLASSIFICATION_A}::uuid,
          ${GESTANTE_A}::uuid,
          'PHASE9-CI', 1, 'normal', 'Risco habitual', 'Acompanhamento sintético',
          ${definitions.find((item) => item.key === "a").id}::uuid,
          'Profissional A Phase 9', 'equipe_ubs', ${UBS_A}::uuid,
          'UBS Teste Segurança CI', ${UBS_A}::uuid, 'UBS Teste Segurança CI'
        ),
        (
          ${CLASSIFICATION_B}::uuid,
          ${GESTANTE_B}::uuid,
          'PHASE9-CI', 1, 'normal', 'Alto risco', 'Acompanhamento sintético',
          ${definitions.find((item) => item.key === "b").id}::uuid,
          'Profissional B Phase 9', 'equipe_ubs', ${UBS_A}::uuid,
          'UBS Teste Segurança CI', ${UBS_A}::uuid, 'UBS Teste Segurança CI'
        )
    `;
  });
} finally {
  await sql.end();
}

process.stdout.write(
  `PHASE9_FIXTURES=${JSON.stringify({
    users: definitions.length,
    sameUbsProfessionals: 3,
    distinctUbsProfessionals: 1,
    gestantes: 4,
    classifications: 2,
    syntheticOnly: true,
  })}\n`
);