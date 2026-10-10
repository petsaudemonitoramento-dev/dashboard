-- Fonte: histórico de migrations do Supabase dashboard-v2 (bhkyfcnuxcvjgvusgpgm)
-- Migration já aplicada no remoto. Recuperada para reproduzir o schema em CI/Codespaces.
-- Não contém dump de dados de produção.
-- Não editar retroativamente; novas alterações devem usar migrations posteriores.

-- Dashboard 2.0 - one-time bootstrap for the first technical administrator
-- and the first municipal management account.
--
-- This migration does not create users. It installs a privileged, one-time
-- function that binds two already-confirmed Supabase Auth users to the initial
-- governance profiles. Public applicants continue to use the V22 flow.
BEGIN;

DO $bootstrap_dependencies$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Supabase Auth (auth.users) is required';
  END IF;

  IF to_regclass('public.perfis') IS NULL THEN
    RAISE EXCEPTION 'public.perfis is required';
  END IF;

  IF to_regclass('private.auditoria_perfis_v20') IS NULL THEN
    RAISE EXCEPTION 'private.auditoria_perfis_v20 is required';
  END IF;
END
$bootstrap_dependencies$;

CREATE TABLE "private"."bootstrap_governanca_v25" (
  "singleton" boolean DEFAULT true NOT NULL,
  "administrador_id" uuid NOT NULL,
  "gestao_id" uuid NOT NULL,
  "concluido_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bootstrap_governanca_v25_pkey" PRIMARY KEY ("singleton"),
  CONSTRAINT "bootstrap_governanca_v25_singleton_check" CHECK ("singleton"),
  CONSTRAINT "bootstrap_governanca_v25_usuarios_distintos_check"
    CHECK ("administrador_id" <> "gestao_id"),
  CONSTRAINT "bootstrap_governanca_v25_administrador_fkey"
    FOREIGN KEY ("administrador_id") REFERENCES "auth"."users"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "bootstrap_governanca_v25_gestao_fkey"
    FOREIGN KEY ("gestao_id") REFERENCES "auth"."users"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT
);

ALTER TABLE "private"."bootstrap_governanca_v25" ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER "bootstrap_governanca_v25_append_only"
BEFORE UPDATE OR DELETE ON "private"."bootstrap_governanca_v25"
FOR EACH ROW EXECUTE FUNCTION "private"."bloquear_mutacao_auditoria_v22"();

CREATE TRIGGER "bootstrap_governanca_v25_no_truncate"
BEFORE TRUNCATE ON "private"."bootstrap_governanca_v25"
FOR EACH STATEMENT EXECUTE FUNCTION "private"."bloquear_mutacao_auditoria_v22"();

CREATE OR REPLACE FUNCTION "private"."bootstrap_governanca_inicial_v25"(
  "p_administrador_id" uuid,
  "p_administrador_email" text,
  "p_gestao_id" uuid,
  "p_gestao_email" text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'auth', 'public', 'private'
AS $$
DECLARE
  v_administrador auth.users%ROWTYPE;
  v_gestao auth.users%ROWTYPE;
  v_administrador_nome text;
  v_gestao_nome text;
  v_administrador_email text := lower(btrim(coalesce(p_administrador_email, '')));
  v_gestao_email text := lower(btrim(coalesce(p_gestao_email, '')));
  v_agora timestamp with time zone := now();
  v_administrador_depois jsonb;
  v_gestao_depois jsonb;
BEGIN
  IF p_administrador_id IS NULL OR p_gestao_id IS NULL THEN
    RAISE EXCEPTION 'Os dois usuarios Auth sao obrigatorios';
  END IF;

  IF p_administrador_id = p_gestao_id THEN
    RAISE EXCEPTION 'Administrador e gestao devem ser usuarios distintos';
  END IF;

  IF v_administrador_email = '' OR v_gestao_email = '' THEN
    RAISE EXCEPTION 'Os e-mails esperados sao obrigatorios';
  END IF;

  -- The singleton row serializes concurrent attempts and permanently records
  -- successful completion. No client role receives mutation privileges here.
  LOCK TABLE private.bootstrap_governanca_v25 IN EXCLUSIVE MODE;
  LOCK TABLE public.perfis IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (SELECT 1 FROM private.bootstrap_governanca_v25) THEN
    RAISE EXCEPTION 'Bootstrap inicial de governanca ja foi concluido';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.perfis p
    WHERE p.perfil IN (
      'administrador'::public.perfil_usuario,
      'gestao_municipal'::public.perfil_usuario
    )
       OR p.perfil_solicitado IN ('administrador', 'gestao_municipal')
  ) THEN
    RAISE EXCEPTION 'Ja existe perfil administrativo ou de gestao';
  END IF;

  SELECT u.*
  INTO v_administrador
  FROM auth.users u
  WHERE u.id = p_administrador_id
  FOR SHARE;

  IF NOT FOUND
     OR v_administrador.email IS NULL
     OR lower(btrim(v_administrador.email)) <> v_administrador_email
     OR v_administrador.email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Usuario Auth do administrador inexistente, divergente ou nao confirmado';
  END IF;

  SELECT u.*
  INTO v_gestao
  FROM auth.users u
  WHERE u.id = p_gestao_id
  FOR SHARE;

  IF NOT FOUND
     OR v_gestao.email IS NULL
     OR lower(btrim(v_gestao.email)) <> v_gestao_email
     OR v_gestao.email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Usuario Auth da gestao inexistente, divergente ou nao confirmado';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.perfis p
    WHERE p.id IN (p_administrador_id, p_gestao_id)
       OR lower(p.email) IN (v_administrador_email, v_gestao_email)
  ) THEN
    RAISE EXCEPTION 'Um dos usuarios de bootstrap ja possui perfil';
  END IF;

  v_administrador_nome := coalesce(
    nullif(btrim(v_administrador.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(v_administrador.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(v_administrador.raw_user_meta_data ->> 'nome_completo'), ''),
    split_part(v_administrador_email, '@', 1)
  );

  v_gestao_nome := coalesce(
    nullif(btrim(v_gestao.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(v_gestao.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(v_gestao.raw_user_meta_data ->> 'nome_completo'), ''),
    split_part(v_gestao_email, '@', 1)
  );

  IF char_length(v_administrador_nome) < 3 OR char_length(v_gestao_nome) < 3 THEN
    RAISE EXCEPTION 'Os usuarios Auth devem possuir nomes validos nos metadados';
  END IF;

  INSERT INTO public.perfis (
    id,
    nome_completo,
    email,
    perfil,
    status,
    ubs_id,
    microarea_id,
    primeiro_acesso,
    ativo,
    cadastro_completo,
    aprovacao_status,
    perfil_solicitado,
    ubs_solicitada_id,
    origem_cadastro,
    solicitado_em,
    aprovado_em,
    aprovado_por,
    perfil_excluido_em,
    perfil_excluido_por
  )
  VALUES (
    p_administrador_id,
    v_administrador_nome,
    v_administrador_email,
    'administrador'::public.perfil_usuario,
    'ativo'::public.status_usuario,
    NULL,
    NULL,
    false,
    true,
    true,
    'aprovado',
    NULL,
    NULL,
    'bootstrap_v25',
    v_agora,
    v_agora,
    NULL,
    NULL,
    NULL
  );

  SELECT jsonb_build_object(
    'perfil', p.perfil::text,
    'status', p.status::text,
    'aprovacaoStatus', p.aprovacao_status,
    'ativo', p.ativo,
    'cadastroCompleto', p.cadastro_completo,
    'ubsId', p.ubs_id,
    'microareaId', p.microarea_id,
    'origemCadastro', p.origem_cadastro
  )
  INTO v_administrador_depois
  FROM public.perfis p
  WHERE p.id = p_administrador_id;

  INSERT INTO private.auditoria_perfis_v20 (
    administrador_id,
    perfil_alvo_id,
    acao,
    antes,
    depois
  )
  VALUES (
    NULL,
    p_administrador_id,
    'bootstrap_administrador_v25',
    NULL,
    v_administrador_depois
  );

  INSERT INTO public.perfis (
    id,
    nome_completo,
    email,
    perfil,
    status,
    ubs_id,
    microarea_id,
    primeiro_acesso,
    ativo,
    cadastro_completo,
    aprovacao_status,
    perfil_solicitado,
    ubs_solicitada_id,
    origem_cadastro,
    solicitado_em,
    aprovado_em,
    aprovado_por,
    perfil_excluido_em,
    perfil_excluido_por
  )
  VALUES (
    p_gestao_id,
    v_gestao_nome,
    v_gestao_email,
    'gestao_municipal'::public.perfil_usuario,
    'ativo'::public.status_usuario,
    NULL,
    NULL,
    false,
    true,
    true,
    'aprovado',
    NULL,
    NULL,
    'bootstrap_v25',
    v_agora,
    v_agora,
    p_administrador_id,
    NULL,
    NULL
  );

  SELECT jsonb_build_object(
    'perfil', p.perfil::text,
    'status', p.status::text,
    'aprovacaoStatus', p.aprovacao_status,
    'ativo', p.ativo,
    'cadastroCompleto', p.cadastro_completo,
    'ubsId', p.ubs_id,
    'microareaId', p.microarea_id,
    'origemCadastro', p.origem_cadastro
  )
  INTO v_gestao_depois
  FROM public.perfis p
  WHERE p.id = p_gestao_id;

  INSERT INTO private.auditoria_perfis_v20 (
    administrador_id,
    perfil_alvo_id,
    acao,
    antes,
    depois
  )
  VALUES (
    p_administrador_id,
    p_gestao_id,
    'bootstrap_gestao_v25',
    NULL,
    v_gestao_depois
  );

  INSERT INTO private.bootstrap_governanca_v25 (
    singleton,
    administrador_id,
    gestao_id,
    concluido_em
  )
  VALUES (
    true,
    p_administrador_id,
    p_gestao_id,
    v_agora
  );

  RETURN jsonb_build_object(
    'concluido', true,
    'administradorId', p_administrador_id,
    'gestaoId', p_gestao_id,
    'concluidoEm', v_agora
  );
END
$$;

REVOKE ALL PRIVILEGES ON TABLE "private"."bootstrap_governanca_v25"
  FROM PUBLIC, "anon", "authenticated", "service_role";

GRANT SELECT ON TABLE "private"."bootstrap_governanca_v25"
  TO "service_role";

REVOKE EXECUTE ON FUNCTION
  "private"."bootstrap_governanca_inicial_v25"(uuid, text, uuid, text)
  FROM PUBLIC, "anon", "authenticated", "service_role";

GRANT EXECUTE ON FUNCTION
  "private"."bootstrap_governanca_inicial_v25"(uuid, text, uuid, text)
  TO "service_role";

COMMIT;
