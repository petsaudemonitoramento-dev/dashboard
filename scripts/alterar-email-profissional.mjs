import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const oldEmail = process.env.OLD_PROFESSIONAL_EMAIL
  ?.trim()
  .toLowerCase();
const newEmail = process.env.NEW_PROFESSIONAL_EMAIL
  ?.trim()
  .toLowerCase();

if (!supabaseUrl || !secretKey) {
  throw new Error(
    "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY."
  );
}

if (
  !oldEmail ||
  !newEmail ||
  !oldEmail.includes("@") ||
  !newEmail.includes("@") ||
  oldEmail.length > 254 ||
  newEmail.length > 254
) {
  throw new Error(
    "Configure OLD_PROFESSIONAL_EMAIL e NEW_PROFESSIONAL_EMAIL."
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

const oldUser = usersData.users.find(
  (user) => user.email?.toLowerCase() === oldEmail
);

const newUser = usersData.users.find(
  (user) => user.email?.toLowerCase() === newEmail
);

if (newUser && oldUser && newUser.id !== oldUser.id) {
  throw new Error(
    "O novo e-mail já pertence a outro usuário."
  );
}

const user = oldUser ?? newUser;

if (!user) {
  throw new Error("Usuário não encontrado.");
}

if (user.email?.toLowerCase() !== newEmail) {
  const { error: updateAuthError } =
    await supabase.auth.admin.updateUserById(user.id, {
      email: newEmail,
      email_confirm: true,
    });

  if (updateAuthError) {
    throw updateAuthError;
  }
}

const { error: updateProfileError } = await supabase
  .from("perfis")
  .update({ email: newEmail })
  .eq("id", user.id);

if (updateProfileError) {
  throw updateProfileError;
}

console.log("E-mail do profissional alterado com sucesso.");
console.log("ID técnico preservado.");
