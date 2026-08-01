import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const temporaryPassword = process.env.TEMP_PROFESSIONAL_PASSWORD;
const email = process.env.EQUIPE_UBS_EMAIL?.trim().toLowerCase();
const fullName = process.env.EQUIPE_UBS_NOME_COMPLETO
  ?.replace(/\s+/g, " ")
  .trim();
const requestedUbsId = process.env.EQUIPE_UBS_UBS_ID?.trim();
const cargoFuncao = process.env.EQUIPE_UBS_CARGO_FUNCAO?.trim().toLowerCase();

const requiredValues = [
  url,
  secret,
  temporaryPassword,
  email,
  fullName,
  requestedUbsId,
  cargoFuncao,
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

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedUbsId)) {
  throw new Error("O identificador da UBS é inválido.");
}

if (!new Set(["medico", "enfermeiro"]).has(cargoFuncao)) {
  throw new Error(
    "A função solicitada deve ser medico ou enfermeiro e ainda exigirá verificação formal."
  );
}

const supabase = createClient(url, secret, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const { data: requestedUbs, error: ubsError } = await supabase
  .from("ubs")
  .select("id")
  .eq("id", requestedUbsId)
  .eq("ativa", true)
  .maybeSingle();

if (ubsError || !requestedUbs) {
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
      ubs_solicitada_id: requestedUbs.id,
    },
  });

if (createUserError || !data.user) {
  throw new Error(
    "Não foi possível criar a solicitação. Verifique se a conta já existe."
  );
}

const createdUserId = data.user.id;
const { error: profileError } = await supabase.from("perfis").upsert(
  {
    id: createdUserId,
    nome_completo: fullName,
    email,
    perfil: "aluno",
    status: "pendente",
    ativo: false,
    primeiro_acesso: true,
    cadastro_completo: false,
    aprovacao_status: "pendente",
    perfil_solicitado: "equipe_ubs",
    ubs_id: null,
    ubs_solicitada_id: requestedUbs.id,
    microarea_id: null,
    cargo_funcao: cargoFuncao,
    origem_cadastro: "administrador",
  },
  { onConflict: "id" }
);

if (profileError) {
  await supabase.auth.admin.deleteUser(createdUserId);
  throw new Error("Não foi possível registrar a solicitação pendente.");
}

console.log("Solicitação pendente criada com sucesso.");
