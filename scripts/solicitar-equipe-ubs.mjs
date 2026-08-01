import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const databaseUrl = process.env.SUPABASE_DATABASE_URL;
const temporaryPassword = process.env.TEMP_PROFESSIONAL_PASSWORD;
const email = process.env.EQUIPE_UBS_EMAIL?.trim().toLowerCase();
const fullName = process.env.EQUIPE_UBS_NOME_COMPLETO
  ?.replace(/\s+/g, " ")
  .trim();
const requestedUbsId = process.env.EQUIPE_UBS_UBS_ID?.trim();
const cargoFuncao = process.env.EQUIPE_UBS_CARGO_FUNCAO?.trim().toLowerCase();
const conselhoUf = process.env.EQUIPE_UBS_CONSELHO_UF?.trim().toUpperCase();
const numeroRegistro = process.env.EQUIPE_UBS_REGISTRO?.replace(/\D/g, "");
const brazilianStates = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",
  "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
  "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

const requiredValues = [
  url,
  secret,
  databaseUrl,
  temporaryPassword,
  email,
  fullName,
  requestedUbsId,
  cargoFuncao,
  conselhoUf,
  numeroRegistro,
];

if (requiredValues.some((value) => !value)) {
  throw new Error(
    "Configure todas as variáveis obrigatórias do script no ambiente."
  );
}

if (!email.includes("@") || email.length > 254) {
  throw new Error("O e-mail informado é inválido.");
}

if (fullName.length < 5 || fullName.length > 160) {
  throw new Error("O nome completo informado é inválido.");
}

if (temporaryPassword.length < 8) {
  throw new Error("A senha temporária deve ter pelo menos 8 caracteres.");
}

if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestedUbsId
  )
) {
  throw new Error("O identificador da UBS é inválido.");
}

if (!new Set(["medico", "enfermeiro"]).has(cargoFuncao)) {
  throw new Error("A função solicitada deve ser medico ou enfermeiro.");
}

if (!brazilianStates.has(conselhoUf) || !/^\d{3,15}$/.test(numeroRegistro)) {
  throw new Error("A UF ou o número do conselho é inválido.");
}

const conselho = cargoFuncao === "medico" ? "CRM" : "COREN";
const categoria = cargoFuncao === "medico" ? "MEDICO" : "ENFERMEIRO";
const supabase = createClient(url, secret, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
const sql = postgres(databaseUrl, {
  ssl: "require",
  max: 1,
  prepare: false,
});

let createdUserId = null;

try {
  const requestedUbs = await sql`
    select id
    from public.ubs
    where id = ${requestedUbsId}::uuid
      and ativa = true
  `;

  if (!requestedUbs[0]) {
    throw new Error("A UBS solicitada não está disponível.");
  }

  const { data, error: createUserError } =
    await supabase.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        nome_completo: fullName,
        perfil_solicitado: "equipe_ubs",
        ubs_solicitada_id: requestedUbsId,
      },
    });

  if (createUserError || !data.user) {
    throw new Error(
      "Não foi possível criar a solicitação. Verifique se a conta já existe."
    );
  }

  createdUserId = data.user.id;

  await sql.begin(async (transaction) => {
    await transaction`
      insert into public.perfis (
        id,
        nome_completo,
        email,
        perfil,
        status,
        ativo,
        primeiro_acesso,
        cadastro_completo,
        aprovacao_status,
        perfil_solicitado,
        ubs_id,
        ubs_solicitada_id,
        microarea_id,
        cargo_funcao,
        origem_cadastro
      )
      values (
        ${createdUserId}::uuid,
        ${fullName},
        ${email},
        'aluno'::public.perfil_usuario,
        'ativo'::public.status_usuario,
        true,
        true,
        true,
        'pendente',
        'equipe_ubs',
        null,
        ${requestedUbsId}::uuid,
        null,
        ${cargoFuncao},
        'provisionamento_tecnico'
      )
      on conflict (id) do nothing
    `;

    await transaction`
      select private.submeter_credencial_profissional_v22(
        ${createdUserId}::uuid,
        ${cargoFuncao},
        ${conselho},
        ${conselhoUf},
        ${numeroRegistro},
        ${categoria}
      )
    `;
  });

  console.log("Solicitação pendente criada com credencial para validação.");
} catch (error) {
  if (createdUserId) {
    await supabase.auth.admin.deleteUser(createdUserId);
  }

  throw error;
} finally {
  await sql.end();
}
