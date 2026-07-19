import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

const emailAntigo = "luccanspaaufcg@gmail.com";
const emailNovo = "luccanspaufcg@gmail.com";

if (!supabaseUrl || !secretKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY não configurada."
  );
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const { data: usersData, error: listError } =
  await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

if (listError) {
  throw listError;
}

const usuarioAntigo = usersData.users.find(
  (usuario) =>
    usuario.email?.toLowerCase() === emailAntigo.toLowerCase()
);

const usuarioNovo = usersData.users.find(
  (usuario) =>
    usuario.email?.toLowerCase() === emailNovo.toLowerCase()
);

if (
  usuarioNovo &&
  usuarioAntigo &&
  usuarioNovo.id !== usuarioAntigo.id
) {
  throw new Error(
    `O e-mail ${emailNovo} já pertence a outro usuário.`
  );
}

const usuario = usuarioAntigo ?? usuarioNovo;

if (!usuario) {
  throw new Error(
    `Nenhum usuário foi encontrado com ${emailAntigo} ou ${emailNovo}.`
  );
}

if (usuario.email?.toLowerCase() !== emailNovo.toLowerCase()) {
  const { error: updateAuthError } =
    await supabase.auth.admin.updateUserById(usuario.id, {
      email: emailNovo,
      email_confirm: true,
    });

  if (updateAuthError) {
    throw updateAuthError;
  }
}

const { error: updateProfileError } = await supabase
  .from("perfis")
  .update({
    email: emailNovo,
  })
  .eq("id", usuario.id);

if (updateProfileError) {
  throw updateProfileError;
}

console.log("E-mail alterado com sucesso.");
console.log(`E-mail anterior: ${emailAntigo}`);
console.log(`Novo e-mail: ${emailNovo}`);
console.log(`ID preservado: ${usuario.id}`);
