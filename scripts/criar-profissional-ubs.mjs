import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const temporaryPassword =
  process.env.TEMP_PROFESSIONAL_PASSWORD ?? "1234Aa!";

if (!url || !secret) {
  throw new Error(
    "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY no .env.local."
  );
}

const supabase = createClient(url, secret, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const email = "luccanspaaufcg@gmail.com";
const fullName = "Profissional UBS — Antonio Aurelio Ventura";
const ubsName = "Antonio Aurelio Ventura (Cinza)";

const { data: listData, error: listError } =
  await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

if (listError) {
  throw listError;
}

let user = listData.users.find(
  (item) => item.email?.toLowerCase() === email.toLowerCase()
);

if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      nome_completo: fullName,
      perfil: "profissional_ubs",
    },
  });

  if (error) {
    throw error;
  }

  user = data.user;
} else {
  const { data, error } =
    await supabase.auth.admin.updateUserById(user.id, {
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        nome_completo: fullName,
        perfil: "profissional_ubs",
      },
    });

  if (error) {
    throw error;
  }

  user = data.user;
}

const { data: ubs, error: ubsError } = await supabase
  .from("ubs")
  .select("id, nome")
  .eq("nome", ubsName)
  .single();

if (ubsError || !ubs) {
  throw new Error(
    `A UBS "${ubsName}" não foi encontrada. Execute primeiro a migração.`
  );
}

const { error: profileError } = await supabase
  .from("perfis")
  .upsert(
    {
      id: user.id,
      nome_completo: fullName,
      email,
      perfil: "profissional_ubs",
      status: "ativo",
      ativo: true,
      primeiro_acesso: true,
      ubs_id: ubs.id,
    },
    {
      onConflict: "id",
    }
  );

if (profileError) {
  throw profileError;
}

console.log("Profissional criado/atualizado:");
console.log(`E-mail: ${email}`);
console.log(`UBS: ${ubsName}`);
console.log(`Senha temporária: ${temporaryPassword}`);
console.log("primeiro_acesso = true");
